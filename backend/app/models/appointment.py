import uuid
from datetime import datetime
from sqlalchemy.dialects.postgresql import UUID

from app import db
from .mixins import SoftDeleteMixin


class AppointmentStatus:
    PENDING = 'pending'
    CONFIRMED = 'confirmed'
    CANCELLED = 'cancelled'
    COMPLETED = 'completed'
    NO_SHOW = 'no_show'


class Appointment(db.Model, SoftDeleteMixin):
    __tablename__ = 'appointments'

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clinic_id = db.Column(UUID(as_uuid=True), db.ForeignKey('clinics.id'), nullable=False)
    patient_id = db.Column(UUID(as_uuid=True), db.ForeignKey('patients.id'), nullable=False)
    service_name = db.Column(db.String(255), nullable=False)
    scheduled_datetime = db.Column(db.DateTime, nullable=False)
    duration_minutes = db.Column(db.Integer, default=30)
    status = db.Column(db.String(20), default=AppointmentStatus.PENDING)
    notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    cancelled_at = db.Column(db.DateTime, nullable=True)

    def to_dict(self) -> dict:
        return {
            'id': str(self.id),
            'clinic_id': str(self.clinic_id),
            'patient_id': str(self.patient_id),
            'patient': self.patient.to_dict() if self.patient else None,
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
