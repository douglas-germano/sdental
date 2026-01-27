"""
Appointment reminder model for tracking scheduled notifications.
"""
import uuid
from datetime import datetime
from sqlalchemy.dialects.postgresql import UUID

from app import db


class ReminderStatus:
    PENDING = 'pending'
    SENT = 'sent'
    FAILED = 'failed'
    CANCELLED = 'cancelled'


class ReminderType:
    REMINDER_24H = '24h'
    REMINDER_1H = '1h'
    CONFIRMATION = 'confirmation'


class AppointmentReminder(db.Model):
    """Model for tracking appointment reminders."""
    __tablename__ = 'appointment_reminders'

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    appointment_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey('appointments.id', ondelete='CASCADE'),
        nullable=False
    )
    reminder_type = db.Column(db.String(20), nullable=False)  # '24h', '1h', 'confirmation'
    scheduled_for = db.Column(db.DateTime, nullable=False)
    sent_at = db.Column(db.DateTime, nullable=True)
    status = db.Column(db.String(20), default=ReminderStatus.PENDING)
    error_message = db.Column(db.Text, nullable=True)
    attempts = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationship
    appointment = db.relationship('Appointment', backref=db.backref('reminders', lazy='dynamic'))

    def to_dict(self) -> dict:
        return {
            'id': str(self.id),
            'appointment_id': str(self.appointment_id),
            'reminder_type': self.reminder_type,
            'scheduled_for': self.scheduled_for.isoformat() if self.scheduled_for else None,
            'sent_at': self.sent_at.isoformat() if self.sent_at else None,
            'status': self.status,
            'error_message': self.error_message,
            'attempts': self.attempts,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

    def mark_sent(self) -> None:
        """Mark reminder as successfully sent."""
        self.status = ReminderStatus.SENT
        self.sent_at = datetime.utcnow()
        self.attempts += 1

    def mark_failed(self, error: str) -> None:
        """Mark reminder as failed with error message."""
        self.status = ReminderStatus.FAILED
        self.error_message = error
        self.attempts += 1

    def cancel(self) -> None:
        """Cancel the reminder."""
        self.status = ReminderStatus.CANCELLED

    def __repr__(self) -> str:
        return f'<AppointmentReminder {self.id} - {self.reminder_type}>'


# Create indexes
db.Index('ix_appointment_reminders_appointment_id', AppointmentReminder.appointment_id)
db.Index('ix_appointment_reminders_status', AppointmentReminder.status)
db.Index('ix_appointment_reminders_scheduled_for', AppointmentReminder.scheduled_for)
db.Index(
    'ix_appointment_reminders_pending_scheduled',
    AppointmentReminder.status,
    AppointmentReminder.scheduled_for,
    postgresql_where=(AppointmentReminder.status == ReminderStatus.PENDING)
)
