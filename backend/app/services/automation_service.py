"""
Autonomous automation service.

Orchestrates the scheduled, agent-initiated behaviours that make the system
proactive instead of purely reactive:

  * no-show / cancellation recovery  -> reopen and offer to rebook
  * waitlist                         -> offer a freed-up slot to a waiting patient
  * recall                           -> reactivate long-inactive patients
  * funnel qualification             -> classify & move leads in the CRM
  * weekly report                    -> send the owner a performance digest

Each method is defensive (per-item try/except, bounded batch sizes) and routes
every patient-facing message through OutreachService, so guardrails and the
audit log always apply. All of this is gated by clinic.proactive_outreach_enabled
(the master switch) plus the per-feature flags.
"""
import logging
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func

from app import db
from app.models import (
    Appointment,
    AppointmentStatus,
    Patient,
    Conversation,
    ConversationStatus,
    PipelineStage,
    AgentAction,
    AgentActionType,
    AgentActionStatus,
)
from app.services.outreach_service import OutreachService

logger = logging.getLogger(__name__)

BR_TZ = ZoneInfo('America/Sao_Paulo')

# Batch caps so a single scheduler tick can never fan out unbounded outreach.
RECOVERY_BATCH = 20
RECALL_BATCH = 15
WAITLIST_BATCH = 10
FUNNEL_BATCH = 15

# Dedupe windows
RECOVERY_DEDUPE = timedelta(days=7)
RECALL_DEDUPE = timedelta(days=90)
FUNNEL_DEDUPE = timedelta(hours=20)


def _now() -> datetime:
    return datetime.utcnow()


def collect_metrics(clinic, days: int = 30) -> dict:
    """
    Snapshot of a clinic's key metrics, reused by the weekly report and the
    natural-language analytics endpoint.
    """
    now = _now()
    start = now - timedelta(days=days)

    total = Appointment.query.filter(
        Appointment.clinic_id == clinic.id,
        Appointment.scheduled_datetime >= start,
    ).count()
    by_status = dict(
        db.session.query(Appointment.status, func.count(Appointment.id))
        .filter(
            Appointment.clinic_id == clinic.id,
            Appointment.scheduled_datetime >= start,
        )
        .group_by(Appointment.status)
        .all()
    )

    upcoming = Appointment.query.filter(
        Appointment.clinic_id == clinic.id,
        Appointment.scheduled_datetime >= now,
        Appointment.status.in_([AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED]),
    ).count()

    total_patients = Patient.query.filter_by(clinic_id=clinic.id).count()
    new_patients = Patient.query.filter(
        Patient.clinic_id == clinic.id,
        Patient.created_at >= start,
    ).count()

    needs_attention = Conversation.query.filter_by(
        clinic_id=clinic.id,
        status=ConversationStatus.TRANSFERRED_TO_HUMAN,
    ).count()

    top_services = [
        {'name': name, 'count': cnt}
        for name, cnt in db.session.query(
            Appointment.service_name, func.count(Appointment.id)
        ).filter(
            Appointment.clinic_id == clinic.id,
            Appointment.scheduled_datetime >= start,
        ).group_by(Appointment.service_name).order_by(func.count(Appointment.id).desc()).limit(5).all()
    ]

    no_shows = by_status.get(AppointmentStatus.NO_SHOW, 0)
    cancelled = by_status.get(AppointmentStatus.CANCELLED, 0)
    completed = by_status.get(AppointmentStatus.COMPLETED, 0)

    # Autonomous actions taken in the window (so reports can show AI impact)
    ai_actions = dict(
        db.session.query(AgentAction.action_type, func.count(AgentAction.id))
        .filter(
            AgentAction.clinic_id == clinic.id,
            AgentAction.status == AgentActionStatus.SENT,
            AgentAction.created_at >= start,
        )
        .group_by(AgentAction.action_type)
        .all()
    )

    return {
        'period_days': days,
        'appointments': {
            'total': total,
            'completed': completed,
            'cancelled': cancelled,
            'no_shows': no_shows,
            'upcoming': upcoming,
            'no_show_rate': round((no_shows / total) * 100, 1) if total else 0,
        },
        'patients': {'total': total_patients, 'new': new_patients},
        'conversations': {'needs_attention': needs_attention},
        'top_services': top_services,
        'ai_actions': ai_actions,
    }


class AutomationService:
    def __init__(self, clinic):
        self.clinic = clinic
        self.outreach = OutreachService(clinic)

    # -- 1. No-show & cancellation recovery -------------------------------

    def run_recovery(self) -> dict:
        results = {'noshow': 0, 'cancellation': 0}
        if not self.clinic.noshow_recovery_enabled:
            return results
        now = _now()

        # No-shows in the last 3 days
        noshows = Appointment.query.filter(
            Appointment.clinic_id == self.clinic.id,
            Appointment.status == AppointmentStatus.NO_SHOW,
            Appointment.scheduled_datetime >= now - timedelta(days=3),
            Appointment.scheduled_datetime < now,
        ).limit(RECOVERY_BATCH).all()

        for appt in noshows:
            if self._recover_one(appt, AgentActionType.NOSHOW_RECOVERY,
                                  'o paciente faltou à consulta e queremos reengajá-lo com carinho, '
                                  'sem cobrança, oferecendo remarcar em um novo horário'):
                results['noshow'] += 1

        # Cancellations in the last 2 days
        cancellations = Appointment.query.filter(
            Appointment.clinic_id == self.clinic.id,
            Appointment.status == AppointmentStatus.CANCELLED,
            Appointment.cancelled_at >= now - timedelta(days=2),
        ).limit(RECOVERY_BATCH).all()

        for appt in cancellations:
            if self._recover_one(appt, AgentActionType.CANCELLATION_RECOVERY,
                                  'a consulta do paciente foi cancelada e queremos oferecer um novo '
                                  'horário para reagendar, de forma leve e prestativa'):
                results['cancellation'] += 1

        return results

    def _recover_one(self, appt: Appointment, action_type: str, objective: str) -> bool:
        try:
            patient = appt.patient
            if not patient:
                return False
            # Already rebooked? Skip.
            has_future = Appointment.query.filter(
                Appointment.clinic_id == self.clinic.id,
                Appointment.patient_id == patient.id,
                Appointment.scheduled_datetime >= _now(),
                Appointment.status.in_([AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED]),
            ).first()
            if has_future:
                return False
            if AgentAction.has_recent_action(patient.id, action_type, RECOVERY_DEDUPE):
                return False
            action = self.outreach.send_proactive(
                patient=patient,
                objective=objective,
                action_type=action_type,
                extra_context=f"Serviço da consulta: {appt.service_name}.",
                appointment_id=appt.id,
            )
            return bool(action and action.status == AgentActionStatus.SENT)
        except Exception:
            logger.exception('Recovery failed for appointment %s', appt.id)
            return False

    # -- 2. Waitlist: fill freed-up slots ---------------------------------

    def fill_freed_slots(self) -> dict:
        results = {'offers': 0}
        if not self.clinic.waitlist_enabled:
            return results
        now = _now()

        freed = Appointment.query.filter(
            Appointment.clinic_id == self.clinic.id,
            Appointment.status == AppointmentStatus.CANCELLED,
            Appointment.cancelled_at >= now - timedelta(hours=2),
            Appointment.scheduled_datetime > now,
        ).limit(WAITLIST_BATCH).all()

        for appt in freed:
            try:
                # Don't offer the same freed slot twice.
                already = AgentAction.query.filter(
                    AgentAction.clinic_id == self.clinic.id,
                    AgentAction.action_type == AgentActionType.WAITLIST_OFFER,
                    AgentAction.appointment_id == appt.id,
                ).first()
                if already:
                    continue

                # Best candidate: a patient whose next appointment is LATER than
                # this freed slot and who might prefer to come earlier.
                candidate = Appointment.query.filter(
                    Appointment.clinic_id == self.clinic.id,
                    Appointment.status.in_([AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED]),
                    Appointment.scheduled_datetime > appt.scheduled_datetime + timedelta(days=1),
                ).order_by(Appointment.scheduled_datetime).first()
                if not candidate or not candidate.patient:
                    continue

                slot_str = appt.scheduled_datetime.strftime('%d/%m às %H:%M')
                action = self.outreach.send_proactive(
                    patient=candidate.patient,
                    objective=(
                        'abriu um horário mais próximo do que a consulta que o paciente já tem marcada, '
                        'e queremos oferecer antecipar o atendimento se for do interesse dele'
                    ),
                    action_type=AgentActionType.WAITLIST_OFFER,
                    extra_context=f"Horário que abriu: {slot_str}. Serviço: {appt.service_name}.",
                    appointment_id=appt.id,
                )
                if action and action.status == AgentActionStatus.SENT:
                    results['offers'] += 1
            except Exception:
                logger.exception('Waitlist offer failed for freed appointment %s', appt.id)

        return results

    # -- 3. Recall: reactivate inactive patients --------------------------

    def run_recall(self) -> dict:
        results = {'recalled': 0}
        if not self.clinic.recall_enabled:
            return results
        now = _now()
        cutoff = now - timedelta(days=self.clinic.recall_inactive_days or 180)

        # Patients whose most recent appointment is older than the cutoff.
        last_appt = db.session.query(
            Appointment.patient_id.label('pid'),
            func.max(Appointment.scheduled_datetime).label('last_dt'),
        ).filter(
            Appointment.clinic_id == self.clinic.id,
        ).group_by(Appointment.patient_id).subquery()

        # Patients with a future appointment (exclude - they're already active).
        future_ids = db.session.query(Appointment.patient_id).filter(
            Appointment.clinic_id == self.clinic.id,
            Appointment.scheduled_datetime >= now,
            Appointment.status.in_([AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED]),
        )

        candidates = (
            Patient.query
            .join(last_appt, Patient.id == last_appt.c.pid)
            .filter(
                Patient.clinic_id == self.clinic.id,
                Patient.whatsapp_opt_out.is_(False),
                last_appt.c.last_dt < cutoff,
                ~Patient.id.in_(future_ids),
            )
            .limit(RECALL_BATCH * 2)  # over-fetch; some will be deduped out
            .all()
        )

        for patient in candidates:
            if results['recalled'] >= RECALL_BATCH:
                break
            try:
                if AgentAction.has_recent_action(patient.id, AgentActionType.RECALL, RECALL_DEDUPE):
                    continue
                action = self.outreach.send_proactive(
                    patient=patient,
                    objective=(
                        'faz um bom tempo que o paciente não vem à clínica e queremos convidá-lo, '
                        'de forma acolhedora, para agendar um retorno / avaliação de rotina'
                    ),
                    action_type=AgentActionType.RECALL,
                    add_opt_out_footer=True,
                )
                if action and action.status == AgentActionStatus.SENT:
                    results['recalled'] += 1
            except Exception:
                logger.exception('Recall failed for patient %s', patient.id)

        return results

    # -- 5. Funnel qualification ------------------------------------------

    def qualify_recent_conversations(self) -> dict:
        results = {'classified': 0}
        if not self.clinic.funnel_automation_enabled:
            return results

        stages = PipelineStage.query.filter_by(
            clinic_id=self.clinic.id
        ).order_by(PipelineStage.order).all()
        if not stages:
            return results
        stage_names = [s.name for s in stages]
        stage_by_name = {s.name.strip().lower(): s for s in stages}

        recent = Conversation.query.filter(
            Conversation.clinic_id == self.clinic.id,
            Conversation.status == ConversationStatus.ACTIVE,
            Conversation.last_message_at >= _now() - timedelta(hours=24),
            Conversation.patient_id.isnot(None),
        ).order_by(Conversation.last_message_at.desc()).limit(FUNNEL_BATCH).all()

        agent = None
        for conv in recent:
            try:
                patient = conv.patient
                if not patient:
                    continue
                if AgentAction.has_recent_action(patient.id, AgentActionType.FUNNEL_QUALIFICATION, FUNNEL_DEDUPE):
                    continue
                if agent is None:
                    agent = self.outreach.clinic_agent()
                result = agent.classify_conversation_funnel(conv, stage_names)
                if not result:
                    continue
                stage = stage_by_name.get(result['stage_name'].strip().lower())
                if not stage:
                    continue
                patient.pipeline_stage_id = stage.id
                if result.get('note'):
                    note = f"[IA] {result['note']}"
                    patient.notes = f"{patient.notes}\n{note}" if patient.notes else note
                db.session.add(AgentAction(
                    clinic_id=self.clinic.id,
                    patient_id=patient.id,
                    conversation_id=conv.id,
                    action_type=AgentActionType.FUNNEL_QUALIFICATION,
                    channel='internal',
                    status=AgentActionStatus.SENT,
                    detail=f"Movido para '{stage.name}': {result.get('note', '')}",
                    meta={'stage': stage.name},
                ))
                db.session.commit()
                results['classified'] += 1
            except Exception:
                db.session.rollback()
                logger.exception('Funnel qualification failed for conversation %s', conv.id)

        return results

    # -- 7. Weekly performance report -------------------------------------

    def send_weekly_report(self) -> dict:
        results = {'sent': 0}
        if not self.clinic.weekly_report_enabled:
            return results
        # Avoid duplicate sends within the week.
        already = AgentAction.query.filter(
            AgentAction.clinic_id == self.clinic.id,
            AgentAction.action_type == AgentActionType.WEEKLY_REPORT,
            AgentAction.created_at >= _now() - timedelta(days=6),
        ).first()
        if already:
            return results

        try:
            metrics = collect_metrics(self.clinic, days=7)
            agent = self.outreach.clinic_agent()
            digest = agent.generate_report_digest(metrics)
            if not digest:
                return results

            from app.services.evolution_service import EvolutionService
            send_result = EvolutionService(self.clinic).send_message(self.clinic.phone, digest)
            status = AgentActionStatus.SENT
            if isinstance(send_result, dict) and 'error' in send_result:
                status = AgentActionStatus.FAILED

            db.session.add(AgentAction(
                clinic_id=self.clinic.id,
                action_type=AgentActionType.WEEKLY_REPORT,
                channel='whatsapp',
                status=status,
                detail=digest[:280],
                meta=metrics,
            ))
            db.session.commit()
            if status == AgentActionStatus.SENT:
                results['sent'] += 1
        except Exception:
            db.session.rollback()
            logger.exception('Weekly report failed for clinic %s', self.clinic.id)

        return results
