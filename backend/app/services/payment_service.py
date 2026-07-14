"""
Payments actually received from patients (as opposed to FinancialService,
which projects revenue from appointment status/price).
"""
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from app.utils.datetime_utils import local_today, utcnow
from app import db
from app.models import Payment, PaymentMethod, PaymentStatus, Patient, Appointment


class PaymentService:
    """Payment CRUD and receivables reporting for a single clinic."""

    def __init__(self, clinic):
        self.clinic = clinic

    def _query(self):
        return Payment.query.filter_by(clinic_id=self.clinic.id)

    def get_payment(self, payment_id) -> Optional[Payment]:
        return self._query().filter_by(id=payment_id).first()

    def list_payments(
        self, status: Optional[str] = None, patient_id: Optional[str] = None,
        appointment_id: Optional[str] = None, page: int = 1, per_page: int = 20
    ):
        query = self._query()
        if status:
            query = query.filter_by(status=status)
        if patient_id:
            query = query.filter_by(patient_id=patient_id)
        if appointment_id:
            query = query.filter_by(appointment_id=appointment_id)
        query = query.order_by(Payment.due_date.is_(None), Payment.due_date, Payment.created_at.desc())
        return query.paginate(page=page, per_page=per_page, error_out=False)

    def create_payment(
        self, patient_id: str, amount: float, method: str = PaymentMethod.CASH,
        appointment_id: Optional[str] = None, due_date: Optional[date] = None,
        installments: int = 1, notes: Optional[str] = None,
        status: str = PaymentStatus.PENDING, paid_amount: float = 0.0,
    ) -> tuple[Optional[list], Optional[str]]:
        """Create a charge, optionally split into an installment plan.

        Returns (list_of_payments, error).
        """
        patient = Patient.query.filter_by(id=patient_id, clinic_id=self.clinic.id).first()
        if not patient:
            return None, 'Paciente não encontrado'

        if appointment_id:
            appointment = Appointment.query.filter_by(id=appointment_id, clinic_id=self.clinic.id).first()
            if not appointment:
                return None, 'Agendamento não encontrado'

        installments = max(1, min(installments, 24))
        total = Decimal(str(amount)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        if total <= 0:
            return None, 'O valor deve ser maior que zero'

        base_share = (total / installments).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        remainder = total - (base_share * installments)

        group_id = uuid.uuid4() if installments > 1 else None
        payments = []
        for i in range(installments):
            share = base_share + (remainder if i == installments - 1 else Decimal('0'))
            installment_due = None
            if due_date:
                # Installment n is due n-1 months after the first due date.
                month = due_date.month - 1 + i
                year = due_date.year + month // 12
                month = month % 12 + 1
                day = min(due_date.day, 28)
                installment_due = date(year, month, day)

            payment = Payment(
                clinic_id=self.clinic.id,
                patient_id=patient.id,
                appointment_id=appointment_id,
                amount=share,
                paid_amount=Decimal(str(paid_amount)) if installments == 1 else Decimal('0'),
                method=method,
                status=status if installments == 1 else PaymentStatus.PENDING,
                due_date=installment_due,
                installment_group_id=group_id,
                installment_number=i + 1,
                installment_total=installments,
                notes=notes,
            )
            db.session.add(payment)
            payments.append(payment)

        db.session.commit()
        return payments, None

    def register_payment(
        self, payment_id: str, paid_amount: float, method: Optional[str] = None,
        paid_at: Optional[datetime] = None,
    ) -> tuple[Optional[Payment], Optional[str]]:
        """Record money received against a charge, updating its status."""
        payment = self.get_payment(payment_id)
        if not payment:
            return None, 'Pagamento não encontrado'
        if payment.status in (PaymentStatus.CANCELLED, PaymentStatus.REFUNDED):
            return None, 'Este pagamento não pode receber novos valores'

        received = Decimal(str(paid_amount)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        if received <= 0:
            return None, 'O valor recebido deve ser maior que zero'

        payment.paid_amount = (payment.paid_amount or Decimal('0')) + received
        if method:
            payment.method = method
        payment.paid_at = paid_at or utcnow()

        if payment.paid_amount >= payment.amount:
            payment.status = PaymentStatus.PAID
        else:
            payment.status = PaymentStatus.PARTIAL

        db.session.commit()
        return payment, None

    def update_payment(self, payment_id: str, **fields) -> tuple[Optional[Payment], Optional[str]]:
        payment = self.get_payment(payment_id)
        if not payment:
            return None, 'Pagamento não encontrado'

        for key in ('method', 'due_date', 'notes', 'status'):
            if key in fields and fields[key] is not None:
                setattr(payment, key, fields[key])

        db.session.commit()
        return payment, None

    def cancel_payment(self, payment_id: str) -> tuple[bool, Optional[str]]:
        payment = self.get_payment(payment_id)
        if not payment:
            return False, 'Pagamento não encontrado'
        payment.status = PaymentStatus.CANCELLED
        db.session.commit()
        return True, None

    def get_receivables(self, days: int = 30) -> dict:
        """Pending/partial charges due within the next `days` (plus already overdue)."""
        days = max(1, min(days, 365))
        today = local_today()
        horizon = today + timedelta(days=days)

        pending = self._query().filter(
            Payment.status.in_([PaymentStatus.PENDING, PaymentStatus.PARTIAL]),
            db.or_(Payment.due_date.is_(None), Payment.due_date <= horizon),
        ).order_by(Payment.due_date.is_(None), Payment.due_date).all()

        overdue = [p for p in pending if p.due_date and p.due_date < today]
        upcoming = [p for p in pending if not (p.due_date and p.due_date < today)]

        def outstanding(p: Payment) -> float:
            return float((p.amount or Decimal('0')) - (p.paid_amount or Decimal('0')))

        return {
            'total': round(sum(outstanding(p) for p in pending), 2),
            'overdue_total': round(sum(outstanding(p) for p in overdue), 2),
            'overdue_count': len(overdue),
            'upcoming_total': round(sum(outstanding(p) for p in upcoming), 2),
            'upcoming_count': len(upcoming),
            'items': [{**p.to_dict(), 'outstanding': outstanding(p)} for p in pending],
        }
