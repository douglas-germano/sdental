import uuid
from datetime import datetime
from sqlalchemy.dialects.postgresql import UUID, JSONB

from app import db
from .mixins import SoftDeleteMixin, TimestampMixin


class ConversationStatus:
    ACTIVE = 'active'
    TRANSFERRED_TO_HUMAN = 'transferred_to_human'
    COMPLETED = 'completed'


class MessageStatus:
    SENT = 'sent'
    DELIVERED = 'delivered'
    READ = 'read'
    FAILED = 'failed'


class MessageType:
    TEXT = 'text'
    IMAGE = 'image'
    AUDIO = 'audio'
    DOCUMENT = 'document'


class Conversation(db.Model, SoftDeleteMixin, TimestampMixin):
    __tablename__ = 'conversations'

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clinic_id = db.Column(UUID(as_uuid=True), db.ForeignKey('clinics.id'), nullable=False)
    patient_id = db.Column(UUID(as_uuid=True), db.ForeignKey('patients.id'), nullable=True)
    phone_number = db.Column(db.String(20), nullable=False)
    messages = db.Column(JSONB, default=list)  # [{role, content, timestamp}]
    context = db.Column(JSONB, default=dict)  # Context for Claude
    status = db.Column(db.String(30), default=ConversationStatus.ACTIVE)
    last_message_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    bot_transfers = db.relationship('BotTransfer', backref='conversation', lazy='dynamic')

    def _lock_row(self) -> None:
        """
        Lock this conversation's row (SELECT ... FOR UPDATE) and sync
        `self.messages` to the latest committed value.

        The `messages` JSONB column is mutated via read-modify-write
        (`self.messages = self.messages + [...]`), which races if two
        requests for the same conversation run concurrently (the gthread
        worker allows this). Locking the row first forces the second
        writer to wait for the first to commit and see its changes,
        instead of silently overwriting them.

        Uses the raw table (not the ORM entity) because `Conversation.patient`
        is a `lazy='joined'` backref, and Postgres refuses `FOR UPDATE` on the
        nullable side of an outer join - going through `Session.refresh()`
        would pull that join in and fail.
        """
        row = db.session.execute(
            db.select(self.__table__.c.messages)
            .where(self.__table__.c.id == self.id)
            .with_for_update()
        ).first()
        if row is not None:
            self.messages = row.messages

    def add_message(
        self,
        role: str,
        content: str,
        message_id: str = None,
        evolution_id: str = None,
        status: str = MessageStatus.SENT,
        message_type: str = MessageType.TEXT,
        media_url: str = None,
        media_mimetype: str = None,
        caption: str = None
    ) -> dict:
        """
        Append a message to the conversation.

        `message_id` is our own stable identifier for the message (used by the
        frontend). `evolution_id` is the WhatsApp/Evolution message id, used to
        match later delivery/read ACK webhooks - it may be unknown at creation
        time (e.g. the bot composes a reply before it is actually sent).
        """
        self._lock_row()

        if self.messages is None:
            self.messages = []

        message = {
            'id': message_id or uuid.uuid4().hex,
            'evolution_id': evolution_id,
            'role': role,
            'content': content,
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'status': status,
            'type': message_type
        }
        if media_url:
            message['media_url'] = media_url
        if media_mimetype:
            message['media_mimetype'] = media_mimetype
        if caption:
            message['caption'] = caption

        self.messages = self.messages + [message]
        self.last_message_at = datetime.utcnow()
        return message

    def find_message(self, message_id: str) -> dict:
        for msg in (self.messages or []):
            if msg.get('id') == message_id or msg.get('evolution_id') == message_id:
                return msg
        return None

    def update_message_status(self, message_id: str, status: str) -> dict:
        """Update the delivery/read status of a message, matched by its id or evolution_id."""
        self._lock_row()

        if not self.messages:
            return None

        updated = None
        new_messages = []
        for msg in self.messages:
            if msg.get('id') == message_id or msg.get('evolution_id') == message_id:
                msg = {**msg, 'status': status}
                updated = msg
            new_messages.append(msg)

        if updated:
            self.messages = new_messages

        return updated

    def set_evolution_id_for_last_message(self, evolution_id: str, role: str = None) -> dict:
        """
        Attach the real Evolution/WhatsApp message id to the most recently added
        message (optionally filtered by role). Used when a message is recorded
        before it's actually sent, so later ACK webhooks can match it.
        """
        if not evolution_id:
            return None

        self._lock_row()

        if not self.messages:
            return None

        new_messages = list(self.messages)
        for i in range(len(new_messages) - 1, -1, -1):
            msg = new_messages[i]
            if role and msg.get('role') != role:
                continue
            if msg.get('evolution_id'):
                break
            new_messages[i] = {**msg, 'evolution_id': evolution_id}
            self.messages = new_messages
            return new_messages[i]

        return None

    def to_dict(self, include_messages: bool = True, include_last_message_only: bool = False) -> dict:
        data = {
            'id': str(self.id),
            'clinic_id': str(self.clinic_id),
            'patient_id': str(self.patient_id) if self.patient_id else None,
            'patient': self.patient.to_dict() if self.patient else None,
            'phone_number': self.phone_number,
            'status': self.status,
            'last_message_at': self.last_message_at.isoformat() + 'Z' if self.last_message_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'deleted_at': self.deleted_at.isoformat() if self.deleted_at else None
        }
        if include_messages:
            data['messages'] = self.messages
            data['context'] = self.context
        elif include_last_message_only and self.messages:
            # Include only the last message for list views
            data['messages'] = [self.messages[-1]] if self.messages else []
        return data

    def __repr__(self) -> str:
        return f'<Conversation {self.id} - {self.phone_number}>'


# Create indexes
db.Index('ix_conversations_clinic_id', Conversation.clinic_id)
db.Index('ix_conversations_last_message_at', Conversation.last_message_at)
db.Index('ix_conversations_phone_number', Conversation.phone_number)
# Composite index for common queries
db.Index('ix_conversations_clinic_patient', Conversation.clinic_id, Conversation.patient_id)
