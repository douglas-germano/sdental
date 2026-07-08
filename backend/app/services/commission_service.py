"""
Professional commissions: rules (how much a professional earns per completed
appointment) and payouts (money actually paid out to them).

Commission earned is computed on the fly from completed appointments plus the
active rules - it isn't persisted as a ledger, so changing a rule never
rewrites history the way it would if amounts were snapshotted per
appointment. `get_commission_summary` gives the running balance (all-time
earned minus all-time paid) clinics need to know how much they still owe
each professional.
"""
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Optional

from app.models import (
    Appointment, AppointmentStatus, CommissionPayout, CommissionRule, Professional,
)
from app import db


class CommissionService:
    """Commission rule CRUD, computation, and payout tracking for a clinic."""

    def __init__(self, clinic):
        self.clinic = clinic

    # -- Rules ---------------------------------------------------------

    def list_rules(self, active_only: bool = False):
        query = CommissionRule.query.filter_by(clinic_id=self.clinic.id)
        if active_only:
            query = query.filter_by(active=True)
        return query.order_by(CommissionRule.created_at.desc()).all()

    def create_rule(
        self, professional_id: Optional[str] = None, service_name: Optional[str] = None,
        percentage: Optional[float] = None, fixed_amount: Optional[float] = None,
    ) -> tuple[Optional[CommissionRule], Optional[str]]:
        if (percentage is None) == (fixed_amount is None):
            return None, 'Informe percentual OU valor fixo, não ambos'

        if professional_id:
            professional = Professional.query.filter_by(
                id=professional_id, clinic_id=self.clinic.id
            ).first()
            if not professional:
                return None, 'Profissional não encontrado'

        rule = CommissionRule(
            clinic_id=self.clinic.id,
            professional_id=professional_id or None,
            service_name=(service_name or '').strip() or None,
            percentage=Decimal(str(percentage)) if percentage is not None else None,
            fixed_amount=Decimal(str(fixed_amount)) if fixed_amount is not None else None,
        )
        db.session.add(rule)
        db.session.commit()
        return rule, None

    def update_rule(self, rule_id: str, **fields) -> tuple[Optional[CommissionRule], Optional[str]]:
        rule = CommissionRule.query.filter_by(id=rule_id, clinic_id=self.clinic.id).first()
        if not rule:
            return None, 'Regra não encontrada'

        if 'percentage' in fields or 'fixed_amount' in fields:
            percentage = fields.get('percentage', rule.percentage)
            fixed_amount = fields.get('fixed_amount', rule.fixed_amount)
            if (percentage is None) == (fixed_amount is None):
                return None, 'Informe percentual OU valor fixo, não ambos'

        for key in ('professional_id', 'service_name', 'percentage', 'fixed_amount', 'active'):
            if key in fields:
                value = fields[key]
                if key in ('percentage', 'fixed_amount') and value is not None:
                    value = Decimal(str(value))
                setattr(rule, key, value)

        db.session.commit()
        return rule, None

    def delete_rule(self, rule_id: str) -> tuple[bool, Optional[str]]:
        rule = CommissionRule.query.filter_by(id=rule_id, clinic_id=self.clinic.id).first()
        if not rule:
            return False, 'Regra não encontrada'
        db.session.delete(rule)
        db.session.commit()
        return True, None

    def _resolve_rule(self, rules: list, professional_id, service_name: Optional[str]) -> Optional[CommissionRule]:
        service_name = (service_name or '').strip().lower() or None
        best = None
        best_score = -1
        for rule in rules:
            if not rule.active:
                continue
            if rule.professional_id and str(rule.professional_id) != str(professional_id):
                continue
            rule_service = (rule.service_name or '').strip().lower() or None
            if rule_service and rule_service != service_name:
                continue
            score = (2 if rule.professional_id else 0) + (1 if rule_service else 0)
            if score > best_score:
                best_score = score
                best = rule
        return best

    def _commission_for_appointment(self, appointment: Appointment, rules: list) -> float:
        if not appointment.professional_id:
            return 0.0
        rule = self._resolve_rule(rules, appointment.professional_id, appointment.service_name)
        if not rule:
            return 0.0
        price = float(appointment.price) if appointment.price is not None else 0.0
        if rule.percentage is not None:
            return round(price * float(rule.percentage) / 100, 2)
        return round(float(rule.fixed_amount), 2)

    # -- Reporting -------------------------------------------------------

    def get_commission_summary(self, days: int = 30) -> list[dict]:
        """Per-professional: earned in the period, all-time earned, all-time
        paid, and outstanding balance (all-time earned - all-time paid)."""
        rules = self.list_rules()
        professionals = Professional.query.filter_by(clinic_id=self.clinic.id).all()

        days = max(1, min(days, 365))
        period_start = datetime.utcnow() - timedelta(days=days)

        all_completed = Appointment.query.filter(
            Appointment.clinic_id == self.clinic.id,
            Appointment.status == AppointmentStatus.COMPLETED,
            Appointment.professional_id.isnot(None),
        ).all()

        payouts = CommissionPayout.query.filter_by(clinic_id=self.clinic.id).all()

        by_professional: dict = {
            str(p.id): {
                'professional_id': str(p.id), 'professional_name': p.name,
                'earned_period': 0.0, 'earned_total': 0.0, 'paid_total': 0.0, 'balance': 0.0,
            }
            for p in professionals
        }

        for appt in all_completed:
            pid = str(appt.professional_id)
            entry = by_professional.get(pid)
            if entry is None:
                continue
            amount = self._commission_for_appointment(appt, rules)
            entry['earned_total'] += amount
            if appt.scheduled_datetime and appt.scheduled_datetime >= period_start:
                entry['earned_period'] += amount

        for payout in payouts:
            pid = str(payout.professional_id)
            entry = by_professional.get(pid)
            if entry is None:
                continue
            entry['paid_total'] += float(payout.amount)

        results = []
        for entry in by_professional.values():
            entry['earned_period'] = round(entry['earned_period'], 2)
            entry['earned_total'] = round(entry['earned_total'], 2)
            entry['paid_total'] = round(entry['paid_total'], 2)
            entry['balance'] = round(entry['earned_total'] - entry['paid_total'], 2)
            if entry['earned_total'] > 0 or entry['paid_total'] > 0:
                results.append(entry)

        results.sort(key=lambda r: r['balance'], reverse=True)
        return results

    # -- Payouts -----------------------------------------------------------

    def list_payouts(self, professional_id: Optional[str] = None):
        query = CommissionPayout.query.filter_by(clinic_id=self.clinic.id)
        if professional_id:
            query = query.filter_by(professional_id=professional_id)
        return query.order_by(CommissionPayout.paid_at.desc()).all()

    def create_payout(
        self, professional_id: str, period_start: date, period_end: date,
        amount: float, notes: Optional[str] = None,
    ) -> tuple[Optional[CommissionPayout], Optional[str]]:
        professional = Professional.query.filter_by(
            id=professional_id, clinic_id=self.clinic.id
        ).first()
        if not professional:
            return None, 'Profissional não encontrado'

        if amount is None or amount <= 0:
            return None, 'O valor deve ser maior que zero'

        if period_start > period_end:
            return None, 'Data inicial deve ser anterior à data final'

        payout = CommissionPayout(
            clinic_id=self.clinic.id,
            professional_id=professional_id,
            period_start=period_start,
            period_end=period_end,
            amount=Decimal(str(amount)),
            notes=notes,
        )
        db.session.add(payout)
        db.session.commit()
        return payout, None
