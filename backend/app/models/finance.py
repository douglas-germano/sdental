"""
Financial models: real money movement (payments received, expenses paid),
professional commissions, and monthly revenue goals.

These sit alongside FinancialService (which projects revenue from
Appointment.price/status) rather than replacing it - Payment/Expense track
money that actually moved, so the two together give both a forecast and a
real cash position.
"""
import uuid
from datetime import datetime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import validates

from app import db
from .mixins import SoftDeleteMixin, TimestampMixin


class PaymentMethod:
    CASH = 'cash'
    PIX = 'pix'
    CREDIT_CARD = 'credit_card'
    DEBIT_CARD = 'debit_card'
    BANK_TRANSFER = 'bank_transfer'
    HEALTH_INSURANCE = 'health_insurance'
    OTHER = 'other'

    ALL = [CASH, PIX, CREDIT_CARD, DEBIT_CARD, BANK_TRANSFER, HEALTH_INSURANCE, OTHER]


class PaymentStatus:
    PENDING = 'pending'
    PARTIAL = 'partial'
    PAID = 'paid'
    REFUNDED = 'refunded'
    CANCELLED = 'cancelled'

    ALL = [PENDING, PARTIAL, PAID, REFUNDED, CANCELLED]


class Payment(db.Model, SoftDeleteMixin, TimestampMixin):
    """A charge against a patient (optionally tied to an appointment), and
    what has actually been received against it so far."""
    __tablename__ = 'payments'

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clinic_id = db.Column(UUID(as_uuid=True), db.ForeignKey('clinics.id', ondelete='CASCADE'), nullable=False)
    patient_id = db.Column(UUID(as_uuid=True), db.ForeignKey('patients.id'), nullable=False)
    appointment_id = db.Column(
        UUID(as_uuid=True), db.ForeignKey('appointments.id', ondelete='SET NULL'), nullable=True
    )

    # Total owed for this charge/installment.
    amount = db.Column(db.Numeric(10, 2), nullable=False)
    # How much of `amount` has actually been received (supports PARTIAL status).
    paid_amount = db.Column(db.Numeric(10, 2), nullable=False, default=0)

    method = db.Column(db.String(20), nullable=False, default=PaymentMethod.CASH)
    status = db.Column(db.String(20), nullable=False, default=PaymentStatus.PENDING)

    due_date = db.Column(db.Date, nullable=True)
    paid_at = db.Column(db.DateTime, nullable=True)

    # Installment plan bookkeeping: all installments of the same charge
    # share installment_group_id; installment_number is 1-indexed.
    installment_group_id = db.Column(UUID(as_uuid=True), nullable=True)
    installment_number = db.Column(db.Integer, nullable=False, default=1)
    installment_total = db.Column(db.Integer, nullable=False, default=1)

    notes = db.Column(db.Text, nullable=True)

    patient = db.relationship('Patient')
    appointment = db.relationship('Appointment')

    @validates('method')
    def validate_method(self, key, value):
        if value not in PaymentMethod.ALL:
            raise ValueError(f'Invalid payment method: {value}')
        return value

    @validates('status')
    def validate_status(self, key, value):
        if value not in PaymentStatus.ALL:
            raise ValueError(f'Invalid payment status: {value}')
        return value

    def to_dict(self) -> dict:
        return {
            'id': str(self.id),
            'clinic_id': str(self.clinic_id),
            'patient_id': str(self.patient_id),
            'patient_name': self.patient.name if self.patient else None,
            'appointment_id': str(self.appointment_id) if self.appointment_id else None,
            'amount': float(self.amount) if self.amount is not None else 0.0,
            'paid_amount': float(self.paid_amount) if self.paid_amount is not None else 0.0,
            'method': self.method,
            'status': self.status,
            'due_date': self.due_date.isoformat() if self.due_date else None,
            'paid_at': self.paid_at.isoformat() if self.paid_at else None,
            'installment_group_id': str(self.installment_group_id) if self.installment_group_id else None,
            'installment_number': self.installment_number,
            'installment_total': self.installment_total,
            'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self) -> str:
        return f'<Payment {self.id} {self.status} {self.amount}>'


class ExpenseCategory:
    RENT = 'rent'
    SUPPLIES = 'supplies'
    SALARIES = 'salaries'
    MARKETING = 'marketing'
    EQUIPMENT = 'equipment'
    TAXES = 'taxes'
    UTILITIES = 'utilities'
    OTHER = 'other'

    ALL = [RENT, SUPPLIES, SALARIES, MARKETING, EQUIPMENT, TAXES, UTILITIES, OTHER]


class ExpenseStatus:
    PENDING = 'pending'
    PAID = 'paid'
    CANCELLED = 'cancelled'

    ALL = [PENDING, PAID, CANCELLED]


class Expense(db.Model, SoftDeleteMixin, TimestampMixin):
    """A cost the clinic owes or has paid (contas a pagar / despesas)."""
    __tablename__ = 'expenses'

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clinic_id = db.Column(UUID(as_uuid=True), db.ForeignKey('clinics.id', ondelete='CASCADE'), nullable=False)
    professional_id = db.Column(
        UUID(as_uuid=True), db.ForeignKey('professionals.id', ondelete='SET NULL'), nullable=True
    )

    category = db.Column(db.String(20), nullable=False, default=ExpenseCategory.OTHER)
    description = db.Column(db.String(255), nullable=False)
    amount = db.Column(db.Numeric(10, 2), nullable=False)
    status = db.Column(db.String(20), nullable=False, default=ExpenseStatus.PENDING)

    due_date = db.Column(db.Date, nullable=True)
    paid_at = db.Column(db.DateTime, nullable=True)

    notes = db.Column(db.Text, nullable=True)

    professional = db.relationship('Professional')

    @validates('category')
    def validate_category(self, key, value):
        if value not in ExpenseCategory.ALL:
            raise ValueError(f'Invalid expense category: {value}')
        return value

    @validates('status')
    def validate_status(self, key, value):
        if value not in ExpenseStatus.ALL:
            raise ValueError(f'Invalid expense status: {value}')
        return value

    def to_dict(self) -> dict:
        return {
            'id': str(self.id),
            'clinic_id': str(self.clinic_id),
            'professional_id': str(self.professional_id) if self.professional_id else None,
            'professional_name': self.professional.name if self.professional else None,
            'category': self.category,
            'description': self.description,
            'amount': float(self.amount) if self.amount is not None else 0.0,
            'status': self.status,
            'due_date': self.due_date.isoformat() if self.due_date else None,
            'paid_at': self.paid_at.isoformat() if self.paid_at else None,
            'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self) -> str:
        return f'<Expense {self.id} {self.category} {self.amount}>'


class CommissionRule(db.Model, TimestampMixin):
    """
    Defines how much a professional earns per completed appointment.

    Resolution order (most specific wins): professional+service > professional
    only > service only > clinic-wide default (both null). Exactly one of
    percentage/fixed_amount is set.
    """
    __tablename__ = 'commission_rules'

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clinic_id = db.Column(UUID(as_uuid=True), db.ForeignKey('clinics.id', ondelete='CASCADE'), nullable=False)
    professional_id = db.Column(
        UUID(as_uuid=True), db.ForeignKey('professionals.id', ondelete='CASCADE'), nullable=True
    )
    service_name = db.Column(db.String(255), nullable=True)

    percentage = db.Column(db.Numeric(5, 2), nullable=True)
    fixed_amount = db.Column(db.Numeric(10, 2), nullable=True)
    active = db.Column(db.Boolean, default=True, nullable=False)

    professional = db.relationship('Professional')

    __table_args__ = (
        db.CheckConstraint(
            '(percentage IS NOT NULL) != (fixed_amount IS NOT NULL)',
            name='check_commission_exactly_one_kind'
        ),
    )

    def to_dict(self) -> dict:
        return {
            'id': str(self.id),
            'clinic_id': str(self.clinic_id),
            'professional_id': str(self.professional_id) if self.professional_id else None,
            'professional_name': self.professional.name if self.professional else None,
            'service_name': self.service_name,
            'percentage': float(self.percentage) if self.percentage is not None else None,
            'fixed_amount': float(self.fixed_amount) if self.fixed_amount is not None else None,
            'active': self.active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self) -> str:
        return f'<CommissionRule {self.id}>'


class CommissionPayout(db.Model, TimestampMixin):
    """A record of commission actually paid out to a professional for a period."""
    __tablename__ = 'commission_payouts'

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clinic_id = db.Column(UUID(as_uuid=True), db.ForeignKey('clinics.id', ondelete='CASCADE'), nullable=False)
    professional_id = db.Column(
        UUID(as_uuid=True), db.ForeignKey('professionals.id', ondelete='CASCADE'), nullable=False
    )

    period_start = db.Column(db.Date, nullable=False)
    period_end = db.Column(db.Date, nullable=False)
    amount = db.Column(db.Numeric(10, 2), nullable=False)
    paid_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    notes = db.Column(db.Text, nullable=True)

    professional = db.relationship('Professional')

    def to_dict(self) -> dict:
        return {
            'id': str(self.id),
            'clinic_id': str(self.clinic_id),
            'professional_id': str(self.professional_id),
            'professional_name': self.professional.name if self.professional else None,
            'period_start': self.period_start.isoformat() if self.period_start else None,
            'period_end': self.period_end.isoformat() if self.period_end else None,
            'amount': float(self.amount) if self.amount is not None else 0.0,
            'paid_at': self.paid_at.isoformat() if self.paid_at else None,
            'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self) -> str:
        return f'<CommissionPayout {self.id} {self.professional_id} {self.amount}>'


class FinancialGoal(db.Model, TimestampMixin):
    """A monthly revenue target for the clinic ("meta de faturamento")."""
    __tablename__ = 'financial_goals'

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clinic_id = db.Column(UUID(as_uuid=True), db.ForeignKey('clinics.id', ondelete='CASCADE'), nullable=False)
    # "YYYY-MM"
    period = db.Column(db.String(7), nullable=False)
    target_amount = db.Column(db.Numeric(10, 2), nullable=False)
    notes = db.Column(db.Text, nullable=True)

    __table_args__ = (
        db.UniqueConstraint('clinic_id', 'period', name='uq_financial_goals_clinic_period'),
    )

    @validates('period')
    def validate_period(self, key, value):
        import re
        if not re.match(r'^\d{4}-(0[1-9]|1[0-2])$', value or ''):
            raise ValueError('period must be in YYYY-MM format')
        return value

    def to_dict(self) -> dict:
        return {
            'id': str(self.id),
            'clinic_id': str(self.clinic_id),
            'period': self.period,
            'target_amount': float(self.target_amount) if self.target_amount is not None else 0.0,
            'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self) -> str:
        return f'<FinancialGoal {self.clinic_id} {self.period}>'


db.Index('ix_payments_clinic_id', Payment.clinic_id)
db.Index('ix_payments_patient_id', Payment.patient_id)
db.Index('ix_payments_appointment_id', Payment.appointment_id)
db.Index('ix_payments_clinic_status', Payment.clinic_id, Payment.status)
db.Index('ix_payments_due_date', Payment.due_date)

db.Index('ix_expenses_clinic_id', Expense.clinic_id)
db.Index('ix_expenses_clinic_status', Expense.clinic_id, Expense.status)
db.Index('ix_expenses_due_date', Expense.due_date)

db.Index('ix_commission_rules_clinic_id', CommissionRule.clinic_id)
db.Index('ix_commission_payouts_clinic_id', CommissionPayout.clinic_id)
db.Index('ix_commission_payouts_professional_id', CommissionPayout.professional_id)

db.Index('ix_financial_goals_clinic_id', FinancialGoal.clinic_id)
