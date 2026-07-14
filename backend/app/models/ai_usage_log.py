"""
Per-call token/cost usage log for AI (OpenRouter) calls.

Written by app.utils.ai_usage.record_ai_usage() after every completion call
from ClaudeService (the WhatsApp patient agent), AssistantService (the
internal dashboard copilot), and the automation one-shot completions
(funnel classification, weekly report, proactive messages, handoff
summaries). This is the only place token/cost spend is visible from inside
the product - before this existed there was no way to answer "how much AI
usage is this clinic generating" without leaving the app.
"""
import uuid
from app.models.types import UUID

from app import db
from .mixins import TimestampMixin


class AiUsageService:
    """Which part of the system made the call."""
    WHATSAPP = 'whatsapp'          # ClaudeService - patient-facing agent
    ASSISTANT = 'assistant'        # AssistantService - internal dashboard copilot
    AUTOMATION = 'automation'      # one-shot completions (funnel, reports, proactive messages...)


class AiUsageLog(db.Model, TimestampMixin):
    __tablename__ = 'ai_usage_logs'

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clinic_id = db.Column(UUID(as_uuid=True), db.ForeignKey('clinics.id', ondelete='CASCADE'), nullable=False)

    service = db.Column(db.String(20), nullable=False)
    task = db.Column(db.String(50), nullable=False)
    model = db.Column(db.String(100), nullable=False)

    prompt_tokens = db.Column(db.Integer, nullable=True)
    completion_tokens = db.Column(db.Integer, nullable=True)
    total_tokens = db.Column(db.Integer, nullable=True)
    cached_tokens = db.Column(db.Integer, nullable=True)
    # OpenRouter's own cost figure for the call (already accounts for the
    # specific model's pricing and any cache discount), in USD.
    cost_usd = db.Column(db.Numeric(12, 6), nullable=True)

    def to_dict(self) -> dict:
        return {
            'id': str(self.id),
            'clinic_id': str(self.clinic_id),
            'service': self.service,
            'task': self.task,
            'model': self.model,
            'prompt_tokens': self.prompt_tokens,
            'completion_tokens': self.completion_tokens,
            'total_tokens': self.total_tokens,
            'cached_tokens': self.cached_tokens,
            'cost_usd': float(self.cost_usd) if self.cost_usd is not None else None,
            'created_at': self.created_at.isoformat() + 'Z' if self.created_at else None,
        }

    def __repr__(self) -> str:
        return f'<AiUsageLog {self.service}/{self.task} {self.total_tokens}tok>'


db.Index('ix_ai_usage_logs_clinic_id', AiUsageLog.clinic_id)
db.Index('ix_ai_usage_logs_clinic_created', AiUsageLog.clinic_id, AiUsageLog.created_at)
