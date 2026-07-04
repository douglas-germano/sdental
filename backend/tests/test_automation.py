"""
Tests for the autonomous / proactive agent layer: opt-out detection,
outreach guardrails, the agent-action audit log, and the metrics collector.
"""
from datetime import datetime, timedelta

import pytest

from app import db
from app.models import (
    Clinic, Patient, Appointment, AppointmentStatus,
    AgentAction, AgentActionType, AgentActionStatus,
)
from app.services.outreach_service import OutreachService, is_opt_out_message, MAX_PROACTIVE_PER_DAY


class TestOptOutDetection:
    """The 'SAIR' opt-out keyword matcher."""

    def test_bare_keyword_matches(self):
        assert is_opt_out_message('SAIR')
        assert is_opt_out_message('sair')
        assert is_opt_out_message('Parar')
        assert is_opt_out_message('STOP')

    def test_short_sentence_with_keyword_matches(self):
        assert is_opt_out_message('quero sair da lista')
        assert is_opt_out_message('não quero receber mais')

    def test_normal_message_does_not_match(self):
        assert not is_opt_out_message('Quero agendar uma consulta')
        assert not is_opt_out_message('Bom dia, gostaria de remarcar')
        assert not is_opt_out_message('')

    def test_long_message_mentioning_keyword_does_not_match(self):
        # A long message that merely contains "sair" shouldn't be treated as opt-out
        long_msg = (
            'Oi, tudo bem? Estava pensando em sair mais cedo do trabalho para '
            'conseguir chegar na consulta, será que tem horário depois das 17h?'
        )
        assert not is_opt_out_message(long_msg)


class TestPatientOptOut:
    def test_opt_out_and_in(self, app, sample_patient):
        with app.app_context():
            patient = db.session.get(Patient, sample_patient.id)
            assert patient.whatsapp_opt_out is False
            patient.opt_out_whatsapp()
            assert patient.whatsapp_opt_out is True
            assert patient.whatsapp_opt_out_at is not None
            patient.opt_in_whatsapp()
            assert patient.whatsapp_opt_out is False
            assert patient.whatsapp_opt_out_at is None


class TestOutreachGuardrails:
    """OutreachService.can_contact must block outreach unless everything is safe."""

    def _enable(self, clinic):
        clinic.proactive_outreach_enabled = True
        db.session.commit()

    def test_blocked_when_master_switch_off(self, app, sample_clinic, sample_patient):
        with app.app_context():
            clinic = db.session.get(Clinic, sample_clinic.id)
            patient = db.session.get(Patient, sample_patient.id)
            allowed, reason = OutreachService(clinic).can_contact(patient, ignore_quiet_hours=True)
            assert allowed is False
            assert reason == 'proactive_disabled'

    def test_allowed_when_enabled(self, app, sample_clinic, sample_patient):
        with app.app_context():
            clinic = db.session.get(Clinic, sample_clinic.id)
            self._enable(clinic)
            patient = db.session.get(Patient, sample_patient.id)
            allowed, reason = OutreachService(clinic).can_contact(patient, ignore_quiet_hours=True)
            assert allowed is True
            assert reason is None

    def test_blocked_when_opted_out(self, app, sample_clinic, sample_patient):
        with app.app_context():
            clinic = db.session.get(Clinic, sample_clinic.id)
            self._enable(clinic)
            patient = db.session.get(Patient, sample_patient.id)
            patient.opt_out_whatsapp()
            db.session.commit()
            allowed, reason = OutreachService(clinic).can_contact(patient, ignore_quiet_hours=True)
            assert allowed is False
            assert reason == 'opted_out'

    def test_blocked_when_rate_limited(self, app, sample_clinic, sample_patient):
        with app.app_context():
            clinic = db.session.get(Clinic, sample_clinic.id)
            self._enable(clinic)
            patient = db.session.get(Patient, sample_patient.id)
            for _ in range(MAX_PROACTIVE_PER_DAY):
                db.session.add(AgentAction(
                    clinic_id=clinic.id, patient_id=patient.id,
                    action_type=AgentActionType.RECALL,
                    status=AgentActionStatus.SENT,
                ))
            db.session.commit()
            allowed, reason = OutreachService(clinic).can_contact(patient, ignore_quiet_hours=True)
            assert allowed is False
            assert reason == 'rate_limited'


class TestAgentActionHelpers:
    def test_count_and_has_recent(self, app, sample_clinic, sample_patient):
        with app.app_context():
            clinic = db.session.get(Clinic, sample_clinic.id)
            patient = db.session.get(Patient, sample_patient.id)
            assert AgentAction.count_recent_for_patient(patient.id, timedelta(hours=24)) == 0
            assert AgentAction.has_recent_action(patient.id, AgentActionType.RECALL, timedelta(days=1)) is False

            db.session.add(AgentAction(
                clinic_id=clinic.id, patient_id=patient.id,
                action_type=AgentActionType.RECALL, status=AgentActionStatus.SENT,
            ))
            db.session.commit()

            assert AgentAction.count_recent_for_patient(patient.id, timedelta(hours=24)) == 1
            assert AgentAction.has_recent_action(patient.id, AgentActionType.RECALL, timedelta(days=1)) is True
            # A different action type should not match
            assert AgentAction.has_recent_action(patient.id, AgentActionType.NOSHOW_RECOVERY, timedelta(days=1)) is False


class TestMetricsCollector:
    def test_collect_metrics_shape(self, app, sample_clinic, sample_patient):
        from app.services.automation_service import collect_metrics
        with app.app_context():
            clinic = db.session.get(Clinic, sample_clinic.id)
            patient = db.session.get(Patient, sample_patient.id)
            db.session.add(Appointment(
                clinic_id=clinic.id, patient_id=patient.id,
                service_name='Consulta Geral',
                scheduled_datetime=datetime.utcnow() - timedelta(days=1),
                duration_minutes=30, status=AppointmentStatus.COMPLETED,
            ))
            db.session.add(Appointment(
                clinic_id=clinic.id, patient_id=patient.id,
                service_name='Consulta Geral',
                scheduled_datetime=datetime.utcnow() - timedelta(days=2),
                duration_minutes=30, status=AppointmentStatus.NO_SHOW,
            ))
            db.session.commit()

            metrics = collect_metrics(clinic, days=30)
            assert metrics['appointments']['total'] >= 2
            assert metrics['appointments']['completed'] >= 1
            assert metrics['appointments']['no_shows'] >= 1
            assert 'no_show_rate' in metrics['appointments']
            assert 'top_services' in metrics
            assert isinstance(metrics['top_services'], list)
