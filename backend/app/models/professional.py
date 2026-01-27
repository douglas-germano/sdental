"""
Professional model for managing dentists/doctors in a clinic.
"""
import uuid
from datetime import datetime
from sqlalchemy.dialects.postgresql import UUID, JSONB

from app import db


class Professional(db.Model):
    """Model for professionals (dentists, doctors) in a clinic."""
    __tablename__ = 'professionals'

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clinic_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey('clinics.id', ondelete='CASCADE'),
        nullable=False
    )
    name = db.Column(db.String(255), nullable=False)
    email = db.Column(db.String(255), nullable=True)
    phone = db.Column(db.String(20), nullable=True)
    specialty = db.Column(db.String(100), nullable=True)  # e.g., "Ortodontia", "Implantes"
    color = db.Column(db.String(7), nullable=True)  # Hex color for calendar UI, e.g., "#3B82F6"
    active = db.Column(db.Boolean, default=True)
    is_default = db.Column(db.Boolean, default=False)  # Default professional for the clinic

    # Optional: Professional-specific business hours (overrides clinic hours)
    business_hours = db.Column(JSONB, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    appointments = db.relationship('Appointment', backref='professional', lazy='dynamic')

    def to_dict(self) -> dict:
        return {
            'id': str(self.id),
            'clinic_id': str(self.clinic_id),
            'name': self.name,
            'email': self.email,
            'phone': self.phone,
            'specialty': self.specialty,
            'color': self.color,
            'active': self.active,
            'is_default': self.is_default,
            'business_hours': self.business_hours,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

    def get_business_hours(self) -> dict:
        """
        Get business hours for this professional.
        Falls back to clinic hours if not set.
        """
        if self.business_hours:
            return self.business_hours
        return self.clinic.business_hours or {}

    def __repr__(self) -> str:
        return f'<Professional {self.name}>'


# Create indexes
db.Index('ix_professionals_clinic_id', Professional.clinic_id)
db.Index('ix_professionals_active', Professional.active)
