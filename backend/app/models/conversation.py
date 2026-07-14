import uuid
from datetime import datetime

from app.utils.datetime_utils import utcnow
from app import db
from app.models.types import JSONB, UUID
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
    last_message_at = db.Column(db.DateTime, default=utcnow)
    urgent = db.Column(db.Boolean, default=False, nullable=False)

    # Relationships
    bot_transfers = db.relationship(
        'BotTransfer', backref='conversation', lazy='dynamic',
        cascade='all, delete-orphan'
    )

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
        # Core selects bypass the session's autoflush (it only runs for ORM
        # statements), so push any pending local mutations first - otherwise
        # the read-back below would overwrite messages added earlier in this
        # same transaction with the stale committed value.
        db.session.flush()
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
        caption: str = None,
        sent_via: str = None
    ) -> dict:
        """
        Append a message to the conversation.

        `message_id` is our own stable identifier for the message (used by the
        frontend). `evolution_id` is the WhatsApp/Evolution message id, used to
        match later delivery/read ACK webhooks - it may be unknown at creation
        time (e.g. the bot composes a reply before it is actually sent).
        `sent_via` marks messages that didn't originate from this platform
        (e.g. 'whatsapp_app' for a staff member replying directly from the
        linked phone) - omitted for normal bot/dashboard-sent messages.
        """
        self._lock_row()

        if self.messages is None:
            self.messages = []

        message = {
            'id': message_id or uuid.uuid4().hex,
            'evolution_id': evolution_id,
            'role': role,
            'content': content,
            'timestamp': utcnow().isoformat() + 'Z',
            'status': status,
            'type': message_type
        }
        if media_url:
            message['media_url'] = media_url
        if media_mimetype:
            message['media_mimetype'] = media_mimetype
        if caption:
            message['caption'] = caption
        if sent_via:
            message['sent_via'] = sent_via

        self.messages = self.messages + [message]
        self.last_message_at = utcnow()
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

    def merge_history_messages(self, historical: list) -> int:
        """
        Merge messages fetched from Evolution API's chat history into this
        conversation, skipping any whose evolution_id we already have.

        `historical` items are normalized dicts as produced by
        `app.utils.whatsapp_message.normalize_raw_message`: {evolution_id,
        from_me, timestamp (datetime), content, message_type, media_url,
        media_mimetype, caption}. The merged list is re-sorted by timestamp so
        history stays chronological regardless of fetch/page order.

        Returns the number of messages actually added.
        """
        self._lock_row()

        existing = self.messages or []
        existing_evolution_ids = {m.get('evolution_id') for m in existing if m.get('evolution_id')}

        new_entries = []
        for h in historical:
            evo_id = h.get('evolution_id')
            if evo_id and evo_id in existing_evolution_ids:
                continue
            if evo_id:
                existing_evolution_ids.add(evo_id)

            from_me = bool(h.get('from_me'))
            message = {
                'id': uuid.uuid4().hex,
                'evolution_id': evo_id,
                'role': 'assistant' if from_me else 'user',
                'content': h['content'],
                'timestamp': h['timestamp'].isoformat() + 'Z',
                'status': MessageStatus.READ if from_me else MessageStatus.DELIVERED,
                'type': h.get('message_type', MessageType.TEXT),
            }
            if h.get('media_url'):
                message['media_url'] = h['media_url']
            if h.get('media_mimetype'):
                message['media_mimetype'] = h['media_mimetype']
            if h.get('caption'):
                message['caption'] = h['caption']
            if from_me:
                message['sent_via'] = 'whatsapp_app'
            new_entries.append(message)

        if not new_entries:
            return 0

        merged = existing + new_entries
        merged.sort(key=lambda m: m['timestamp'])
        self.messages = merged

        last_ts = datetime.fromisoformat(merged[-1]['timestamp'].replace('Z', '+00:00')).replace(tzinfo=None)
        if not self.last_message_at or last_ts > self.last_message_at:
            self.last_message_at = last_ts

        return len(new_entries)

    def to_dict(self, include_messages: bool = True, include_last_message_only: bool = False) -> dict:
        data = {
            'id': str(self.id),
            'clinic_id': str(self.clinic_id),
            'patient_id': str(self.patient_id) if self.patient_id else None,
            'patient': self.patient.to_dict() if self.patient else None,
            'phone_number': self.phone_number,
            'status': self.status,
            'urgent': self.urgent,
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
