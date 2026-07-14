import uuid
import re
from datetime import datetime
from app.models.types import UUID
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

    # LGPD - consent to process personal data
    data_consent_at = db.Column(db.DateTime, nullable=True)
    data_consent_source = db.Column(db.String(30), nullable=True)  # 'public_booking' | 'whatsapp' | 'manual'

    # WhatsApp proactive-outreach opt-out. When the patient replies "SAIR"
    # (or similar) to a proactive message, the AI must never contact them on
    # its own initiative again. Reactive replies to inbound messages are still
    # answered - this only blocks agent-initiated (proactive) messages.
    whatsapp_opt_out = db.Column(db.Boolean, default=False, nullable=False)
    whatsapp_opt_out_at = db.Column(db.DateTime, nullable=True)

    # Address
    address_zip_code = db.Column(db.String(9), nullable=True)
    address_street = db.Column(db.String(255), nullable=True)
    address_number = db.Column(db.String(20), nullable=True)
    address_complement = db.Column(db.String(255), nullable=True)
    address_neighborhood = db.Column(db.String(100), nullable=True)
    address_city = db.Column(db.String(100), nullable=True)
    address_state = db.Column(db.String(2), nullable=True)

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

    @validates('address_state')
    def validate_address_state(self, key, state):
        """Normalize the state (UF) to uppercase, e.g. 'sp' -> 'SP'."""
        return state.upper() if state else state

    def set_data_consent(self, source: str) -> None:
        """Record LGPD consent for processing this patient's personal data."""
        self.data_consent_at = datetime.utcnow()
        self.data_consent_source = source

    def opt_out_whatsapp(self) -> None:
        """Record that the patient asked to stop receiving proactive messages."""
        self.whatsapp_opt_out = True
        self.whatsapp_opt_out_at = datetime.utcnow()

    def opt_in_whatsapp(self) -> None:
        """Re-enable proactive messaging (e.g. patient replies to opt back in)."""
        self.whatsapp_opt_out = False
        self.whatsapp_opt_out_at = None

    def anonymize(self) -> None:
        """
        LGPD right to erasure (Art. 18, VI) - irreversibly scrub personal data.

        The row itself is kept (and soft-deleted) so clinic-side appointment
        history stays consistent, but nothing identifying the patient remains.
        """
        unique_suffix = str(self.id.int)[-11:].rjust(11, '0')
        self.name = 'Paciente removido (LGPD)'
        self.phone = f'99{unique_suffix}'
        self.email = None
        self.notes = None
        self.data_consent_at = None
        self.data_consent_source = None
        self.address_zip_code = None
        self.address_street = None
        self.address_number = None
        self.address_complement = None
        self.address_neighborhood = None
        self.address_city = None
        self.address_state = None
        self.soft_delete()

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
            'pipeline_stage': self.pipeline_stage.to_dict() if self.pipeline_stage else None,
            'data_consent_at': self.data_consent_at.isoformat() + 'Z' if self.data_consent_at else None,
            'data_consent_source': self.data_consent_source,
            'whatsapp_opt_out': self.whatsapp_opt_out,
            'address_zip_code': self.address_zip_code,
            'address_street': self.address_street,
            'address_number': self.address_number,
            'address_complement': self.address_complement,
            'address_neighborhood': self.address_neighborhood,
            'address_city': self.address_city,
            'address_state': self.address_state
        }

    def __repr__(self) -> str:
        return f'<Patient {self.name}>'


# Create indexes
db.Index('ix_patients_clinic_id', Patient.clinic_id)
db.Index('ix_patients_phone', Patient.phone)
