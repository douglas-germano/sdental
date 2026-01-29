import uuid
from datetime import datetime
from sqlalchemy.dialects.postgresql import UUID

from app import db
from .mixins import SoftDeleteMixin, TimestampMixin


class BotTransfer(db.Model, SoftDeleteMixin, TimestampMixin):
    __tablename__ = 'bot_transfers'

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id = db.Column(UUID(as_uuid=True), db.ForeignKey('conversations.id'), nullable=False)
    reason = db.Column(db.Text, nullable=False)
    transferred_at = db.Column(db.DateTime, default=datetime.utcnow)
    resolved = db.Column(db.Boolean, default=False)
    resolved_at = db.Column(db.DateTime, nullable=True)

    def resolve(self) -> None:
        self.resolved = True
        self.resolved_at = datetime.utcnow()

    def to_dict(self) -> dict:
        return {
            'id': str(self.id),
            'conversation_id': str(self.conversation_id),
            'reason': self.reason,
            'transferred_at': self.transferred_at.isoformat() if self.transferred_at else None,
            'resolved': self.resolved,
            'resolved_at': self.resolved_at.isoformat() if self.resolved_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'deleted_at': self.deleted_at.isoformat() if self.deleted_at else None
        }

    def __repr__(self) -> str:
        return f'<BotTransfer {self.id}>'


# Create indexes
db.Index('ix_bot_transfers_conversation_id', BotTransfer.conversation_id)
db.Index('ix_bot_transfers_resolved', BotTransfer.resolved)
