import uuid
from datetime import datetime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import validates

from app import db
from .mixins import SoftDeleteMixin, TimestampMixin


class AppointmentStatus:
    PENDING = 'pending'
    CONFIRMED = 'confirmed'
    CANCELLED = 'cancelled'
    COMPLETED = 'completed'
    NO_SHOW = 'no_show'


class Appointment(db.Model, SoftDeleteMixin, TimestampMixin):
    __tablename__ = 'appointments'

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clinic_id = db.Column(UUID(as_uuid=True), db.ForeignKey('clinics.id'), nullable=False)
    patient_id = db.Column(UUID(as_uuid=True), db.ForeignKey('patients.id'), nullable=False)
    professional_id = db.Column(UUID(as_uuid=True), db.ForeignKey('professionals.id'), nullable=True)
    service_name = db.Column(db.String(255), nullable=False)
    scheduled_datetime = db.Column(db.DateTime, nullable=False)
    duration_minutes = db.Column(db.Integer, default=30)
    status = db.Column(db.String(20), default=AppointmentStatus.PENDING)
    notes = db.Column(db.Text, nullable=True)
    cancelled_at = db.Column(db.DateTime, nullable=True)

    __table_args__ = (
        db.CheckConstraint('duration_minutes > 0 AND duration_minutes <= 1440', name='check_duration_range'),
    )

    @validates('duration_minutes')
    def validate_duration(self, key, duration):
        """Validate duration is positive and reasonable."""
        if duration is not None:
            if duration <= 0:
                raise ValueError("Duration must be positive")
            if duration > 1440:  # 24 hours
                raise ValueError("Duration cannot exceed 24 hours (1440 minutes)")
        return duration

    @validates('status')
    def validate_status(self, key, status):
        """Validate status is one of the allowed values."""
        allowed_statuses = [
            AppointmentStatus.PENDING,
            AppointmentStatus.CONFIRMED,
            AppointmentStatus.CANCELLED,
            AppointmentStatus.COMPLETED,
            AppointmentStatus.NO_SHOW
        ]
        if status not in allowed_statuses:
            raise ValueError(f"Invalid status: {status}. Must be one of {allowed_statuses}")
        return status

    def to_dict(self) -> dict:
        return {
            'id': str(self.id),
            'clinic_id': str(self.clinic_id),
            'patient_id': str(self.patient_id),
            'patient': self.patient.to_dict() if self.patient else None,
            'professional_id': str(self.professional_id) if self.professional_id else None,
            'professional': self.professional.to_dict() if self.professional else None,
            'service_name': self.service_name,
            'scheduled_datetime': self.scheduled_datetime.isoformat() if self.scheduled_datetime else None,
            'duration_minutes': self.duration_minutes,
            'status': self.status,
            'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'cancelled_at': self.cancelled_at.isoformat() if self.cancelled_at else None,
            'deleted_at': self.deleted_at.isoformat() if self.deleted_at else None
        }

    def cancel(self) -> None:
        self.status = AppointmentStatus.CANCELLED
        self.cancelled_at = datetime.utcnow()

    def __repr__(self) -> str:
        return f'<Appointment {self.id} - {self.service_name}>'


# Create indexes
db.Index('ix_appointments_clinic_id', Appointment.clinic_id)
db.Index('ix_appointments_scheduled_datetime', Appointment.scheduled_datetime)
db.Index('ix_appointments_status', Appointment.status)
# Composite indexes for common queries
db.Index('ix_appointments_clinic_patient', Appointment.clinic_id, Appointment.patient_id)
db.Index('ix_appointments_clinic_status', Appointment.clinic_id, Appointment.status)
