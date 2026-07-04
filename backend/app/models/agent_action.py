import uuid
from datetime import datetime, timedelta
from sqlalchemy.dialects.postgresql import UUID, JSONB

from app import db
from .mixins import TimestampMixin


class AgentActionType:
    """Types of autonomous action the AI can take on its own initiative."""
    NOSHOW_RECOVERY = 'noshow_recovery'      # reopened after a no-show
    CANCELLATION_RECOVERY = 'cancellation_recovery'  # reopened after a cancellation
    WAITLIST_OFFER = 'waitlist_offer'        # offered a freed-up slot
    RECALL = 'recall'                        # reactivation of an inactive patient
    HANDOFF_SUMMARY = 'handoff_summary'      # generated a summary for a human takeover
    FUNNEL_QUALIFICATION = 'funnel_qualification'  # classified/moved a lead in the CRM
    WEEKLY_REPORT = 'weekly_report'          # sent the clinic owner a performance digest
    PROACTIVE_MESSAGE = 'proactive_message'  # generic proactive outreach


class AgentActionStatus:
    SENT = 'sent'
    SKIPPED = 'skipped'
    FAILED = 'failed'


class AgentAction(db.Model, TimestampMixin):
    """
    Audit trail of everything the AI does *on its own initiative* (proactive
    outreach, funnel moves, handoff summaries, reports).

    Serves two purposes:
      1. Auditability — the clinic can see exactly what the autonomous agent
         did and why (nothing the AI does proactively is invisible).
      2. Guardrails — used to rate-limit outreach (e.g. "don't message the same
         patient more than N times per day") and to avoid duplicate actions
         (e.g. don't run recall on the same patient twice in a short window).
    """
    __tablename__ = 'agent_actions'

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Deleting a clinic wipes its audit trail; deleting a patient/conversation
    # just detaches the audit rows (kept for aggregate stats) via SET NULL.
    clinic_id = db.Column(UUID(as_uuid=True), db.ForeignKey('clinics.id', ondelete='CASCADE'), nullable=False)
    patient_id = db.Column(UUID(as_uuid=True), db.ForeignKey('patients.id', ondelete='SET NULL'), nullable=True)
    conversation_id = db.Column(UUID(as_uuid=True), db.ForeignKey('conversations.id', ondelete='SET NULL'), nullable=True)
    appointment_id = db.Column(UUID(as_uuid=True), nullable=True)

    action_type = db.Column(db.String(40), nullable=False)
    channel = db.Column(db.String(20), nullable=True)  # 'whatsapp' | 'email' | 'internal'
    status = db.Column(db.String(20), nullable=False, default=AgentActionStatus.SENT)
    detail = db.Column(db.Text, nullable=True)          # human-readable summary of what happened
    meta = db.Column(JSONB, default=dict)               # structured extras (slot, stage, reason...)

    def to_dict(self) -> dict:
        return {
            'id': str(self.id),
            'clinic_id': str(self.clinic_id),
            'patient_id': str(self.patient_id) if self.patient_id else None,
            'conversation_id': str(self.conversation_id) if self.conversation_id else None,
            'appointment_id': str(self.appointment_id) if self.appointment_id else None,
            'action_type': self.action_type,
            'channel': self.channel,
            'status': self.status,
            'detail': self.detail,
            'meta': self.meta or {},
            'created_at': self.created_at.isoformat() + 'Z' if self.created_at else None,
        }

    @classmethod
    def count_recent_for_patient(cls, patient_id, within: timedelta) -> int:
        """How many messages the agent has sent this patient within a window (for rate limiting)."""
        since = datetime.utcnow() - within
        return cls.query.filter(
            cls.patient_id == patient_id,
            cls.status == AgentActionStatus.SENT,
            cls.created_at >= since,
        ).count()

    @classmethod
    def has_recent_action(cls, patient_id, action_type: str, within: timedelta) -> bool:
        """Whether a given action type already ran for this patient recently (dedupe)."""
        since = datetime.utcnow() - within
        return db.session.query(
            cls.query.filter(
                cls.patient_id == patient_id,
                cls.action_type == action_type,
                cls.created_at >= since,
            ).exists()
        ).scalar()

    def __repr__(self) -> str:
        return f'<AgentAction {self.action_type} {self.status}>'


db.Index('ix_agent_actions_clinic_id', AgentAction.clinic_id)
db.Index('ix_agent_actions_patient_id', AgentAction.patient_id)
db.Index('ix_agent_actions_type_created', AgentAction.action_type, AgentAction.created_at)
