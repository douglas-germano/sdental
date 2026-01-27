import uuid
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
from sqlalchemy.dialects.postgresql import UUID, JSONB

from app import db


class Clinic(db.Model):
    __tablename__ = 'clinics'

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = db.Column(db.String(255), nullable=False)
    email = db.Column(db.String(255), unique=True, nullable=False)
    phone = db.Column(db.String(20), nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    
    # Public booking
    slug = db.Column(db.String(100), unique=True, nullable=True)  # URL-friendly identifier
    booking_enabled = db.Column(db.Boolean, default=True)

    # Evolution API configuration
    evolution_api_url = db.Column(db.String(500), nullable=True)
    evolution_api_key = db.Column(db.String(255), nullable=True)
    evolution_instance_name = db.Column(db.String(100), nullable=True)

    # Claude API (nullable - use global key by default)
    claude_api_key = db.Column(db.String(255), nullable=True)

    # Business configuration
    business_hours = db.Column(JSONB, default=dict)
    services = db.Column(JSONB, default=list)

    # AI Agent configuration
    agent_name = db.Column(db.String(100), default='Assistente IA')
    agent_model = db.Column(db.String(100), default='claude-3-5-sonnet-20240620')
    agent_temperature = db.Column(db.Float, default=0.7)
    agent_system_prompt = db.Column(db.Text, nullable=True)
    agent_context = db.Column(db.Text, nullable=True)

    active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    patients = db.relationship('Patient', backref='clinic', lazy='dynamic', cascade='all, delete-orphan')
    appointments = db.relationship('Appointment', backref='clinic', lazy='dynamic', cascade='all, delete-orphan')
    conversations = db.relationship('Conversation', backref='clinic', lazy='dynamic', cascade='all, delete-orphan')
    availability_slots = db.relationship('AvailabilitySlot', backref='clinic', lazy='dynamic', cascade='all, delete-orphan')

    def set_password(self, password: str) -> None:
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)

    def to_dict(self, include_sensitive: bool = False) -> dict:
        data = {
            'id': str(self.id),
            'name': self.name,
            'email': self.email,
            'phone': self.phone,
            'business_hours': self.business_hours,
            'services': self.services,
            'active': self.active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
        if include_sensitive:
            data['evolution_api_url'] = self.evolution_api_url
            data['evolution_instance_name'] = self.evolution_instance_name
            data['has_evolution_key'] = bool(self.evolution_api_key)
            data['has_claude_key'] = bool(self.claude_api_key)
        return data

    def __repr__(self) -> str:
        return f'<Clinic {self.name}>'


# Create index
db.Index('ix_clinics_email', Clinic.email)
