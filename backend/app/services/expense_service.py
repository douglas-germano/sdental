"""
Expenses / accounts payable for a single clinic.
"""
from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from app import db
from app.models import Expense, ExpenseStatus, Professional


class ExpenseService:
    """Expense CRUD and payables reporting for a single clinic."""

    def __init__(self, clinic):
        self.clinic = clinic

    def _query(self):
        return Expense.query.filter_by(clinic_id=self.clinic.id)

    def get_expense(self, expense_id) -> Optional[Expense]:
        return self._query().filter_by(id=expense_id).first()

    def list_expenses(
        self, status: Optional[str] = None, category: Optional[str] = None,
        page: int = 1, per_page: int = 20
    ):
        query = self._query()
        if status:
            query = query.filter_by(status=status)
        if category:
            query = query.filter_by(category=category)
        query = query.order_by(Expense.due_date.is_(None), Expense.due_date, Expense.created_at.desc())
        return query.paginate(page=page, per_page=per_page, error_out=False)

    def create_expense(
        self, description: str, amount: float, category: str,
        due_date: Optional[date] = None, professional_id: Optional[str] = None,
        notes: Optional[str] = None, status: str = ExpenseStatus.PENDING,
        repeat_months: int = 1,
    ) -> tuple[Optional[list], Optional[str]]:
        """Create an expense, optionally expanded into `repeat_months` future
        occurrences (one row per month, same amount/category/description)."""
        if professional_id:
            professional = Professional.query.filter_by(
                id=professional_id, clinic_id=self.clinic.id
            ).first()
            if not professional:
                return None, 'Profissional não encontrado'

        value = Decimal(str(amount)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        if value <= 0:
            return None, 'O valor deve ser maior que zero'

        repeat_months = max(1, min(repeat_months, 24))
        expenses = []
        for i in range(repeat_months):
            occurrence_due = None
            if due_date:
                month = due_date.month - 1 + i
                year = due_date.year + month // 12
                month = month % 12 + 1
                day = min(due_date.day, 28)
                occurrence_due = date(year, month, day)

            expense = Expense(
                clinic_id=self.clinic.id,
                professional_id=professional_id,
                category=category,
                description=description,
                amount=value,
                status=status if i == 0 else ExpenseStatus.PENDING,
                due_date=occurrence_due,
                notes=notes,
            )
            db.session.add(expense)
            expenses.append(expense)

        db.session.commit()
        return expenses, None

    def update_expense(self, expense_id: str, **fields) -> tuple[Optional[Expense], Optional[str]]:
        expense = self.get_expense(expense_id)
        if not expense:
            return None, 'Despesa não encontrada'

        for key in ('description', 'amount', 'category', 'due_date', 'notes', 'professional_id'):
            if key in fields and fields[key] is not None:
                setattr(expense, key, fields[key])

        db.session.commit()
        return expense, None

    def mark_paid(self, expense_id: str, paid_at: Optional[datetime] = None) -> tuple[Optional[Expense], Optional[str]]:
        expense = self.get_expense(expense_id)
        if not expense:
            return None, 'Despesa não encontrada'
        expense.status = ExpenseStatus.PAID
        expense.paid_at = paid_at or datetime.utcnow()
        db.session.commit()
        return expense, None

    def cancel_expense(self, expense_id: str) -> tuple[bool, Optional[str]]:
        expense = self.get_expense(expense_id)
        if not expense:
            return False, 'Despesa não encontrada'
        expense.status = ExpenseStatus.CANCELLED
        db.session.commit()
        return True, None

    def delete_expense(self, expense_id: str) -> tuple[bool, Optional[str]]:
        expense = self.get_expense(expense_id)
        if not expense:
            return False, 'Despesa não encontrada'
        expense.soft_delete()
        db.session.commit()
        return True, None

    def get_payables(self, days: int = 30) -> dict:
        """Pending expenses due within the next `days` (plus already overdue)."""
        days = max(1, min(days, 365))
        today = date.today()
        horizon = today + timedelta(days=days)

        pending = self._query().filter(
            Expense.status == ExpenseStatus.PENDING,
            db.or_(Expense.due_date.is_(None), Expense.due_date <= horizon),
        ).order_by(Expense.due_date.is_(None), Expense.due_date).all()

        overdue = [e for e in pending if e.due_date and e.due_date < today]
        upcoming = [e for e in pending if not (e.due_date and e.due_date < today)]

        return {
            'total': round(sum(float(e.amount) for e in pending), 2),
            'overdue_total': round(sum(float(e.amount) for e in overdue), 2),
            'overdue_count': len(overdue),
            'upcoming_total': round(sum(float(e.amount) for e in upcoming), 2),
            'upcoming_count': len(upcoming),
            'items': [e.to_dict() for e in pending],
        }
