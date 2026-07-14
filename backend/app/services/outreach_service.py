"""
Proactive outreach service.

This is the guarded gateway for every message the AI sends on its OWN
initiative (no-show recovery, recall, waitlist offers, etc.). Everything
proactive goes through here so the guardrails and the audit log are applied
in ONE place:

  * master switch (clinic.proactive_outreach_enabled) - off by default
  * per-patient opt-out (respond "SAIR")
  * quiet hours (never message late at night)
  * daily rate limit per patient
  * never interrupt a conversation already handed to a human
  * every send (and skip) is written to agent_actions for auditability

The proactive message only OPENS a conversation. When the patient replies,
the normal reactive webhook flow handles the actual booking/rescheduling -
so the AI never takes an irreversible action without a human (the patient)
in the loop.
"""
import logging
from datetime import timedelta
from typing import Optional

from app.utils.datetime_utils import local_now
from app import db
from app.models import (
    Patient,
    Conversation,
    ConversationStatus,
    AgentAction,
    AgentActionType,
    AgentActionStatus,
)
from app.services.claude_service import ClaudeService
from app.services.conversation_service import ConversationService
from app.services.evolution_service import EvolutionService

logger = logging.getLogger(__name__)


# Guardrail defaults
QUIET_HOURS_START = 8    # do not send before 08:00 BRT
QUIET_HOURS_END = 20     # do not send after 20:00 BRT
MAX_PROACTIVE_PER_DAY = 2  # per patient, agent-initiated messages in 24h

OPT_OUT_FOOTER = "\n\nSe não quiser mais receber estas mensagens, responda SAIR."

# Substrings that mean "stop contacting me" (matched on a normalized message)
OPT_OUT_KEYWORDS = (
    'sair', 'parar', 'pare', 'nao quero receber', 'não quero receber',
    'descadastrar', 'remover meu numero', 'remover meu número',
    'nao me mande', 'não me mande', 'cancelar inscricao', 'cancelar inscrição',
    'stop',
)


def is_opt_out_message(text: str) -> bool:
    """Whether an inbound message is a request to stop proactive contact."""
    if not text:
        return False
    normalized = text.strip().lower()
    # A bare keyword ("SAIR") or a short message containing one counts.
    if normalized in OPT_OUT_KEYWORDS:
        return True
    if len(normalized) <= 40:
        return any(kw in normalized for kw in OPT_OUT_KEYWORDS)
    return False


class OutreachService:
    """Sends guarded, audited proactive messages on behalf of a clinic."""

    def __init__(self, clinic):
        self.clinic = clinic

    # -- guardrails -------------------------------------------------------

    def can_contact(self, patient: Patient, ignore_quiet_hours: bool = False) -> tuple[bool, Optional[str]]:
        """Return (allowed, reason_if_blocked)."""
        if not self.clinic.proactive_outreach_enabled:
            return False, 'proactive_disabled'
        if not patient or not patient.phone:
            return False, 'no_phone'
        if getattr(patient, 'whatsapp_opt_out', False):
            return False, 'opted_out'
        if not ignore_quiet_hours:
            hour = local_now().hour
            if hour < QUIET_HOURS_START or hour >= QUIET_HOURS_END:
                return False, 'quiet_hours'
        recent = AgentAction.count_recent_for_patient(patient.id, timedelta(hours=24))
        if recent >= MAX_PROACTIVE_PER_DAY:
            return False, 'rate_limited'
        # Never interrupt a conversation a human is already handling.
        active_human = Conversation.query.filter(
            Conversation.clinic_id == self.clinic.id,
            Conversation.phone_number == patient.phone,
            Conversation.status == ConversationStatus.TRANSFERRED_TO_HUMAN,
        ).first()
        if active_human:
            return False, 'human_handling'
        return True, None

    # -- sending ----------------------------------------------------------

    def send_proactive(
        self,
        patient: Patient,
        objective: str,
        action_type: str,
        extra_context: Optional[str] = None,
        appointment_id=None,
        add_opt_out_footer: bool = False,
        ignore_quiet_hours: bool = False,
    ) -> Optional[AgentAction]:
        """
        Compose and send a proactive WhatsApp message to a patient, applying all
        guardrails and recording the outcome in agent_actions.

        Returns the AgentAction record (status sent/skipped/failed), or None if
        the whole feature is disabled for the clinic.
        """
        allowed, reason = self.can_contact(patient, ignore_quiet_hours=ignore_quiet_hours)
        if not allowed:
            # Feature-off and transient blocks (quiet hours / rate limit) are not
            # worth an audit row; opt-out and human-handling are meaningful skips.
            if reason in ('opted_out', 'human_handling'):
                return self._log(patient, action_type, AgentActionStatus.SKIPPED,
                                 detail=f'Não enviado: {reason}', meta={'reason': reason},
                                 appointment_id=appointment_id)
            logger.info('Proactive %s skipped for patient %s: %s', action_type, patient.id, reason)
            return None

        first_name = patient.name.split()[0] if patient.name else None
        try:
            message = self.clinic_agent().generate_proactive_message(
                objective=objective,
                patient_first_name=first_name,
                extra_context=extra_context,
            )
        except Exception as e:
            logger.exception('Failed to generate proactive message: %s', e)
            return self._log(patient, action_type, AgentActionStatus.FAILED,
                             detail=f'Falha ao gerar mensagem: {e}', appointment_id=appointment_id)

        if not message:
            return self._log(patient, action_type, AgentActionStatus.FAILED,
                             detail='Mensagem gerada vazia', appointment_id=appointment_id)

        if add_opt_out_footer:
            message = message + OPT_OUT_FOOTER

        # Record the outbound message on the conversation (also broadcasts to the
        # clinic's live inbox so staff see the AI reaching out).
        conv_service = ConversationService(self.clinic)
        conversation = conv_service.get_or_create_conversation(patient.phone)
        conv_service.add_message(conversation, 'assistant', message)

        # Send via WhatsApp
        result = EvolutionService(self.clinic).send_message(patient.phone, message)
        if isinstance(result, dict) and 'error' in result:
            return self._log(patient, action_type, AgentActionStatus.FAILED,
                             detail=f"Falha no envio: {result['error']}",
                             conversation_id=conversation.id, appointment_id=appointment_id)

        logger.info('Proactive %s sent to patient %s', action_type, patient.id)
        return self._log(
            patient, action_type, AgentActionStatus.SENT,
            detail=message[:280], channel='whatsapp',
            conversation_id=conversation.id, appointment_id=appointment_id,
            meta={'objective': objective},
        )

    def clinic_agent(self) -> ClaudeService:
        """Lazily build a ClaudeService for this clinic (raises if no API key)."""
        if not hasattr(self, '_agent'):
            self._agent = ClaudeService(self.clinic)
        return self._agent

    # -- audit ------------------------------------------------------------

    def _log(self, patient, action_type, status, detail=None, channel=None,
             conversation_id=None, appointment_id=None, meta=None) -> AgentAction:
        action = AgentAction(
            clinic_id=self.clinic.id,
            patient_id=patient.id if patient else None,
            conversation_id=conversation_id,
            appointment_id=appointment_id,
            action_type=action_type,
            channel=channel,
            status=status,
            detail=detail,
            meta=meta or {},
        )
        db.session.add(action)
        db.session.commit()
        return action
