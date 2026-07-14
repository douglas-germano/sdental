import hashlib
import secrets
import uuid
import re
from datetime import timedelta
from werkzeug.security import generate_password_hash, check_password_hash
from sqlalchemy.orm import validates

from app.utils.datetime_utils import utcnow
from app import db
from app.models.types import JSONB, UUID
from .mixins import TimestampMixin

PASSWORD_RESET_TOKEN_TTL = timedelta(hours=1)


class SubscriptionStatus:
    PENDING_PAYMENT = 'pending_payment'  # signed up, no confirmed payment yet
    ACTIVE = 'active'
    LATE = 'late'          # payment overdue, inside the grace period
    CANCELED = 'canceled'
    REFUNDED = 'refunded'
    CHARGEBACK = 'chargeback'


class Clinic(db.Model, TimestampMixin):
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

    # AI provider (OpenRouter) API key override (nullable - use global key by default)
    openrouter_api_key = db.Column(db.String(255), nullable=True)

    # Business configuration
    business_hours = db.Column(JSONB, default=dict)
    services = db.Column(JSONB, default=list)

    # AI Agent configuration
    agent_name = db.Column(db.String(100), default='Assistente IA')
    agent_temperature = db.Column(db.Float, default=0.7)
    agent_system_prompt = db.Column(db.Text, nullable=True)
    agent_context = db.Column(db.Text, nullable=True)
    agent_enabled = db.Column(db.Boolean, default=True)

    # Reminder configuration
    reminders_enabled = db.Column(db.Boolean, default=True)
    reminder_24h_enabled = db.Column(db.Boolean, default=True)
    reminder_1h_enabled = db.Column(db.Boolean, default=True)
    reminder_24h_message = db.Column(db.Text, nullable=True)  # Custom template
    reminder_1h_message = db.Column(db.Text, nullable=True)   # Custom template

    # Autonomous / proactive AI configuration.
    # proactive_outreach_enabled is the MASTER switch: off by default so no
    # clinic starts sending agent-initiated WhatsApp messages without opting in
    # (proactive messaging on an unofficial WhatsApp gateway carries a ban risk
    # and must be a deliberate choice). The per-feature flags below only take
    # effect when the master switch is on.
    proactive_outreach_enabled = db.Column(db.Boolean, default=False, nullable=False)
    noshow_recovery_enabled = db.Column(db.Boolean, default=True, nullable=False)
    waitlist_enabled = db.Column(db.Boolean, default=True, nullable=False)
    recall_enabled = db.Column(db.Boolean, default=False, nullable=False)
    recall_inactive_days = db.Column(db.Integer, default=180, nullable=False)
    funnel_automation_enabled = db.Column(db.Boolean, default=False, nullable=False)
    weekly_report_enabled = db.Column(db.Boolean, default=False, nullable=False)

    active = db.Column(db.Boolean, default=True)

    # Billing (Kiwify subscription)
    subscription_status = db.Column(
        db.String(20), default=SubscriptionStatus.PENDING_PAYMENT, nullable=False
    )
    subscription_period_end = db.Column(db.DateTime, nullable=True)
    # Set when a "subscription_late" webhook arrives; cleared on the next
    # successful payment. The scheduler suspends the clinic once this is
    # older than KIWIFY_GRACE_PERIOD_DAYS.
    subscription_late_since = db.Column(db.DateTime, nullable=True)
    kiwify_subscription_id = db.Column(db.String(100), nullable=True)

    # Password reset (hashed token, never store the raw token)
    password_reset_token_hash = db.Column(db.String(64), nullable=True)
    password_reset_expires_at = db.Column(db.DateTime, nullable=True)

    __table_args__ = (
        db.CheckConstraint('agent_temperature >= 0 AND agent_temperature <= 1', name='check_temperature_range'),
    )

    # Relationships
    patients = db.relationship('Patient', backref='clinic', lazy='dynamic', cascade='all, delete-orphan')
    appointments = db.relationship('Appointment', backref='clinic', lazy='dynamic', cascade='all, delete-orphan')
    conversations = db.relationship('Conversation', backref='clinic', lazy='dynamic', cascade='all, delete-orphan')
    availability_slots = db.relationship('AvailabilitySlot', backref='clinic', lazy='dynamic', cascade='all, delete-orphan')
    professionals = db.relationship('Professional', backref='clinic', lazy='dynamic', cascade='all, delete-orphan')

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
        if not email:
            raise ValueError("Email is required")

        pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        if not re.match(pattern, email):
            raise ValueError(f"Invalid email format: {email}")

        return email.lower()  # Normalize to lowercase

    @validates('slug')
    def validate_slug(self, key, slug):
        """Validate slug format (URL-friendly)."""
        if slug:
            pattern = r'^[a-z0-9\-]+$'
            if not re.match(pattern, slug):
                raise ValueError(
                    "Invalid slug format. Must contain only lowercase letters, numbers, and hyphens"
                )
        return slug

    @validates('agent_temperature')
    def validate_temperature(self, key, temperature):
        """Validate temperature is between 0 and 1."""
        if temperature is not None:
            if not (0 <= temperature <= 1):
                raise ValueError("Temperature must be between 0 and 1")
        return temperature

    def set_password(self, password: str) -> None:
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)

    def generate_password_reset_token(self) -> str:
        """Create a password reset token, store only its hash, and return the raw token to send by e-mail."""
        raw_token = secrets.token_urlsafe(32)
        self.password_reset_token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        self.password_reset_expires_at = utcnow() + PASSWORD_RESET_TOKEN_TTL
        return raw_token

    def verify_password_reset_token(self, token: str) -> bool:
        """Check a raw token against the stored hash and expiry, using a constant-time comparison."""
        if not token or not self.password_reset_token_hash or not self.password_reset_expires_at:
            return False
        if utcnow() > self.password_reset_expires_at:
            return False
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        return secrets.compare_digest(token_hash, self.password_reset_token_hash)

    def clear_password_reset_token(self) -> None:
        self.password_reset_token_hash = None
        self.password_reset_expires_at = None

    def to_dict(self, include_sensitive: bool = False) -> dict:
        data = {
            'id': str(self.id),
            'name': self.name,
            'email': self.email,
            'phone': self.phone,
            'slug': self.slug,
            'booking_enabled': self.booking_enabled,
            'agent_enabled': self.agent_enabled,
            'business_hours': self.business_hours,
            'services': self.services,
            'active': self.active,
            'subscription_status': self.subscription_status,
            'subscription_period_end': self.subscription_period_end.isoformat() if self.subscription_period_end else None,
            'proactive_outreach_enabled': self.proactive_outreach_enabled,
            'noshow_recovery_enabled': self.noshow_recovery_enabled,
            'waitlist_enabled': self.waitlist_enabled,
            'recall_enabled': self.recall_enabled,
            'recall_inactive_days': self.recall_inactive_days,
            'funnel_automation_enabled': self.funnel_automation_enabled,
            'weekly_report_enabled': self.weekly_report_enabled,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
        if include_sensitive:
            data['evolution_api_url'] = self.evolution_api_url
            data['evolution_instance_name'] = self.evolution_instance_name
            data['has_evolution_key'] = bool(self.evolution_api_key)
            data['has_openrouter_key'] = bool(self.openrouter_api_key)
        return data

    def __repr__(self) -> str:
        return f'<Clinic {self.name}>'


# Create index
db.Index('ix_clinics_email', Clinic.email)
