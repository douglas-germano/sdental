import uuid

from app import db
from app.models.types import JSONB, UUID
from .mixins import TimestampMixin


class KiwifyWebhookEvent(db.Model, TimestampMixin):
    """
    Durable audit log of every inbound Kiwify webhook call, stored before any
    interpretation is attempted. Kiwify's payload schema for order/subscription
    events isn't fully covered by public docs, so keeping the raw request lets
    us fix field mapping later (in BillingService) without losing data.
    """
    __tablename__ = 'kiwify_webhook_events'

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    headers = db.Column(JSONB, nullable=True)
    query_params = db.Column(JSONB, nullable=True)
    payload = db.Column(JSONB, nullable=True)
    verified = db.Column(db.Boolean, default=False, nullable=False)
    processed = db.Column(db.Boolean, default=False, nullable=False)
    processing_error = db.Column(db.Text, nullable=True)

    def to_dict(self) -> dict:
        return {
            'id': str(self.id),
            'verified': self.verified,
            'processed': self.processed,
            'processing_error': self.processing_error,
            'payload': self.payload,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self) -> str:
        return f'<KiwifyWebhookEvent {self.id} processed={self.processed}>'
