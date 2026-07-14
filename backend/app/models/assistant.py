"""
Internal AI assistant models - separate from the patient-facing WhatsApp
Conversation. AssistantConversation holds a single ongoing chat thread per
clinic (the owner's "right hand"); AssistantMemory holds facts the assistant
has chosen to remember across sessions via its remember_fact tool, so it
keeps learning about the clinic over time instead of starting from zero
every conversation.
"""
import uuid

from app.utils.datetime_utils import utcnow
from app import db
from app.models.types import JSONB, UUID
from .mixins import TimestampMixin


class AssistantConversation(db.Model, TimestampMixin):
    __tablename__ = 'assistant_conversations'

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clinic_id = db.Column(
        UUID(as_uuid=True), db.ForeignKey('clinics.id', ondelete='CASCADE'),
        nullable=False, unique=True
    )
    messages = db.Column(JSONB, default=list)  # [{id, role, content, timestamp}]
    last_message_at = db.Column(db.DateTime, nullable=True)

    def add_message(self, role: str, content: str) -> dict:
        message = {
            'id': uuid.uuid4().hex,
            'role': role,
            'content': content,
            'timestamp': utcnow().isoformat() + 'Z',
        }
        self.messages = (self.messages or []) + [message]
        self.last_message_at = utcnow()
        return message

    def to_dict(self) -> dict:
        return {
            'id': str(self.id),
            'clinic_id': str(self.clinic_id),
            'messages': self.messages or [],
            'last_message_at': self.last_message_at.isoformat() + 'Z' if self.last_message_at else None,
        }

    def __repr__(self) -> str:
        return f'<AssistantConversation clinic={self.clinic_id}>'


class AssistantMemory(db.Model, TimestampMixin):
    __tablename__ = 'assistant_memories'

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clinic_id = db.Column(UUID(as_uuid=True), db.ForeignKey('clinics.id', ondelete='CASCADE'), nullable=False)
    content = db.Column(db.Text, nullable=False)

    def to_dict(self) -> dict:
        return {
            'id': str(self.id),
            'clinic_id': str(self.clinic_id),
            'content': self.content,
            'created_at': self.created_at.isoformat() + 'Z' if self.created_at else None,
        }

    def __repr__(self) -> str:
        return f'<AssistantMemory {self.content[:30]!r}>'


db.Index('ix_assistant_conversations_clinic_id', AssistantConversation.clinic_id)
db.Index('ix_assistant_memories_clinic_id', AssistantMemory.clinic_id)
