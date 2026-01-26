import uuid
from datetime import datetime
from sqlalchemy.dialects.postgresql import UUID, JSONB

from app import db


class ConversationStatus:
    ACTIVE = 'active'
    TRANSFERRED_TO_HUMAN = 'transferred_to_human'
    COMPLETED = 'completed'


class Conversation(db.Model):
    __tablename__ = 'conversations'

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clinic_id = db.Column(UUID(as_uuid=True), db.ForeignKey('clinics.id'), nullable=False)
    patient_id = db.Column(UUID(as_uuid=True), db.ForeignKey('patients.id'), nullable=True)
    phone_number = db.Column(db.String(20), nullable=False)
    messages = db.Column(JSONB, default=list)  # [{role, content, timestamp}]
    context = db.Column(JSONB, default=dict)  # Context for Claude
    status = db.Column(db.String(30), default=ConversationStatus.ACTIVE)
    last_message_at = db.Column(db.DateTime, default=datetime.utcnow)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    bot_transfers = db.relationship('BotTransfer', backref='conversation', lazy='dynamic')

    def add_message(self, role: str, content: str) -> None:
        if self.messages is None:
            self.messages = []
        self.messages = self.messages + [{
            'role': role,
            'content': content,
            'timestamp': datetime.utcnow().isoformat()
        }]
        self.last_message_at = datetime.utcnow()

    def to_dict(self, include_messages: bool = True) -> dict:
        data = {
            'id': str(self.id),
            'clinic_id': str(self.clinic_id),
            'patient_id': str(self.patient_id) if self.patient_id else None,
            'patient': self.patient.to_dict() if self.patient else None,
            'phone_number': self.phone_number,
            'status': self.status,
            'last_message_at': self.last_message_at.isoformat() if self.last_message_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
        if include_messages:
            data['messages'] = self.messages
            data['context'] = self.context
        return data

    def __repr__(self) -> str:
        return f'<Conversation {self.id} - {self.phone_number}>'


# Create indexes
db.Index('ix_conversations_clinic_id', Conversation.clinic_id)
db.Index('ix_conversations_last_message_at', Conversation.last_message_at)
db.Index('ix_conversations_phone_number', Conversation.phone_number)
