import uuid
import re
from datetime import datetime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import validates

from app import db
from .mixins import SoftDeleteMixin, TimestampMixin


class Patient(db.Model, SoftDeleteMixin, TimestampMixin):
    __tablename__ = 'patients'

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clinic_id = db.Column(UUID(as_uuid=True), db.ForeignKey('clinics.id'), nullable=False)
    name = db.Column(db.String(255), nullable=False)
    phone = db.Column(db.String(20), nullable=False)  # Format: 5511999999999
    email = db.Column(db.String(255), nullable=True)
    notes = db.Column(db.Text, nullable=True)

    # CRM / Pipeline
    pipeline_stage_id = db.Column(UUID(as_uuid=True), db.ForeignKey('pipeline_stages.id'), nullable=True)

    # Relationships
    appointments = db.relationship('Appointment', backref='patient', lazy='dynamic', cascade='all, delete-orphan')
    conversations = db.relationship('Conversation', backref=db.backref('patient', lazy='joined'), lazy='dynamic')

    __table_args__ = (
        db.UniqueConstraint('clinic_id', 'phone', name='uq_patient_clinic_phone'),
    )

    @validates('phone')
    def validate_phone(self, key, phone):
        """Validate phone number format (Brazilian format: 5511999999999)."""
        if not phone:
            raise ValueError("Phone number is required")

        # Remove common separators
        phone = re.sub(r'[\s\-\(\)]', '', phone)

        # Check if it matches Brazilian format (country code + DDD + number)
        if not re.match(r'^\d{12,13}$', phone):
            raise ValueError(
                "Invalid phone format. Expected format: 5511999999999 (country code + area code + number)"
            )

        return phone

    @validates('email')
    def validate_email(self, key, email):
        """Validate email format."""
        if email:  # Email is optional
            pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
            if not re.match(pattern, email):
                raise ValueError(f"Invalid email format: {email}")
        return email

    def to_dict(self) -> dict:
        return {
            'id': str(self.id),
            'clinic_id': str(self.clinic_id),
            'name': self.name,
            'phone': self.phone,
            'email': self.email,
            'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'deleted_at': self.deleted_at.isoformat() if self.deleted_at else None,
            'pipeline_stage_id': str(self.pipeline_stage_id) if self.pipeline_stage_id else None,
            'pipeline_stage': self.pipeline_stage.to_dict() if self.pipeline_stage else None
        }

    def __repr__(self) -> str:
        return f'<Patient {self.name}>'


# Create indexes
db.Index('ix_patients_clinic_id', Patient.clinic_id)
db.Index('ix_patients_phone', Patient.phone)
