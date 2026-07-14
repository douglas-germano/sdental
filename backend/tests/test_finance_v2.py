"""
Tests for the "robust" financial layer added on top of the appointment-based
forecast: real payments received, expenses/accounts payable, professional
commissions, cash flow, and revenue goals.
"""
from datetime import date, datetime, timedelta

from app.utils.datetime_utils import utcnow
from app import db
from app.models import (
    Appointment, AppointmentStatus, AppointmentReminder, CommissionPayout,
    CommissionRule, Expense, ExpenseCategory, ExpenseStatus, Payment,
    PaymentMethod, PaymentStatus, Professional,
)
from app.services.commission_service import CommissionService
from app.services.expense_service import ExpenseService
from app.services.financial_service import FinancialService
from app.services.payment_service import PaymentService


def _cleanup(*objs):
    for obj in objs:
        fresh = db.session.get(type(obj), obj.id)
        if fresh:
            db.session.delete(fresh)
    db.session.commit()


class TestPaymentService:
    def test_create_single_payment_pending(self, app, sample_clinic, sample_patient):
        with app.app_context():
            service = PaymentService(sample_clinic)
            payments, error = service.create_payment(
                patient_id=str(sample_patient.id), amount=200, method=PaymentMethod.PIX,
            )
            assert error is None
            assert len(payments) == 1
            assert payments[0].status == PaymentStatus.PENDING
            assert float(payments[0].amount) == 200.0
            _cleanup(*payments)

    def test_create_payment_unknown_patient_fails(self, app, sample_clinic):
        with app.app_context():
            service = PaymentService(sample_clinic)
            payments, error = service.create_payment(patient_id='00000000-0000-0000-0000-000000000000', amount=100)
            assert payments is None
            assert error == 'Paciente não encontrado'

    def test_create_installments_splits_amount_and_dates(self, app, sample_clinic, sample_patient):
        with app.app_context():
            service = PaymentService(sample_clinic)
            payments, error = service.create_payment(
                patient_id=str(sample_patient.id), amount=100, installments=3,
                due_date=date(2026, 1, 15),
            )
            assert error is None
            assert len(payments) == 3
            total = sum(float(p.amount) for p in payments)
            assert total == 100.0
            assert payments[0].due_date == date(2026, 1, 15)
            assert payments[1].due_date == date(2026, 2, 15)
            assert payments[2].due_date == date(2026, 3, 15)
            assert payments[0].installment_group_id == payments[1].installment_group_id
            _cleanup(*payments)

    def test_register_payment_partial_then_full(self, app, sample_clinic, sample_patient):
        with app.app_context():
            service = PaymentService(sample_clinic)
            payments, _ = service.create_payment(patient_id=str(sample_patient.id), amount=100)
            payment = payments[0]

            updated, error = service.register_payment(str(payment.id), paid_amount=40)
            assert error is None
            assert updated.status == PaymentStatus.PARTIAL
            assert float(updated.paid_amount) == 40.0

            updated, error = service.register_payment(str(payment.id), paid_amount=60)
            assert error is None
            assert updated.status == PaymentStatus.PAID
            assert float(updated.paid_amount) == 100.0

            _cleanup(payment)

    def test_get_receivables_splits_overdue_and_upcoming(self, app, sample_clinic, sample_patient):
        with app.app_context():
            overdue = Payment(
                clinic_id=sample_clinic.id, patient_id=sample_patient.id, amount=50,
                status=PaymentStatus.PENDING, due_date=date.today() - timedelta(days=5),
            )
            upcoming = Payment(
                clinic_id=sample_clinic.id, patient_id=sample_patient.id, amount=80,
                status=PaymentStatus.PENDING, due_date=date.today() + timedelta(days=5),
            )
            db.session.add_all([overdue, upcoming])
            db.session.commit()

            receivables = PaymentService(sample_clinic).get_receivables(days=30)
            assert receivables['overdue_count'] == 1
            assert receivables['overdue_total'] == 50.0
            assert receivables['upcoming_count'] == 1
            assert receivables['upcoming_total'] == 80.0

            _cleanup(overdue, upcoming)


class TestExpenseService:
    def test_create_expense_pending(self, app, sample_clinic):
        with app.app_context():
            expenses, error = ExpenseService(sample_clinic).create_expense(
                description='Aluguel', amount=1500, category=ExpenseCategory.RENT,
            )
            assert error is None
            assert len(expenses) == 1
            assert expenses[0].status == ExpenseStatus.PENDING
            _cleanup(*expenses)

    def test_repeat_months_creates_multiple_occurrences(self, app, sample_clinic):
        with app.app_context():
            expenses, error = ExpenseService(sample_clinic).create_expense(
                description='Assinatura software', amount=99, category=ExpenseCategory.OTHER,
                due_date=date(2026, 1, 10), repeat_months=3,
            )
            assert error is None
            assert len(expenses) == 3
            assert [e.due_date for e in expenses] == [date(2026, 1, 10), date(2026, 2, 10), date(2026, 3, 10)]
            _cleanup(*expenses)

    def test_mark_paid(self, app, sample_clinic):
        with app.app_context():
            expenses, _ = ExpenseService(sample_clinic).create_expense(
                description='Material', amount=300, category=ExpenseCategory.SUPPLIES,
            )
            expense = expenses[0]
            updated, error = ExpenseService(sample_clinic).mark_paid(str(expense.id))
            assert error is None
            assert updated.status == ExpenseStatus.PAID
            assert updated.paid_at is not None
            _cleanup(expense)

    def test_get_payables(self, app, sample_clinic):
        with app.app_context():
            overdue = Expense(
                clinic_id=sample_clinic.id, description='Conta atrasada', amount=120,
                category=ExpenseCategory.UTILITIES, status=ExpenseStatus.PENDING,
                due_date=date.today() - timedelta(days=3),
            )
            db.session.add(overdue)
            db.session.commit()

            payables = ExpenseService(sample_clinic).get_payables(days=30)
            assert payables['overdue_count'] == 1
            assert payables['overdue_total'] == 120.0

            _cleanup(overdue)


class TestCommissionService:
    def test_percentage_rule_computes_expected_amount(self, app, sample_clinic, sample_patient):
        with app.app_context():
            professional = Professional(clinic_id=sample_clinic.id, name='Dr. Comissao')
            db.session.add(professional)
            db.session.commit()

            rule, error = CommissionService(sample_clinic).create_rule(
                professional_id=str(professional.id), percentage=20,
            )
            assert error is None

            appt = Appointment(
                clinic_id=sample_clinic.id, patient_id=sample_patient.id,
                professional_id=professional.id, service_name='Consulta Geral',
                scheduled_datetime=utcnow() - timedelta(days=1),
                status=AppointmentStatus.COMPLETED, price=200,
            )
            db.session.add(appt)
            db.session.commit()

            summary = CommissionService(sample_clinic).get_commission_summary(days=30)
            entry = next(e for e in summary if e['professional_id'] == str(professional.id))
            assert entry['earned_total'] == 40.0
            assert entry['balance'] == 40.0

            _cleanup(appt, rule, professional)

    def test_rule_requires_exactly_one_kind(self, app, sample_clinic):
        with app.app_context():
            rule, error = CommissionService(sample_clinic).create_rule(percentage=10, fixed_amount=5)
            assert rule is None
            assert 'percentual OU valor fixo' in error

    def test_payout_reduces_balance(self, app, sample_clinic, sample_patient):
        with app.app_context():
            professional = Professional(clinic_id=sample_clinic.id, name='Dr. Payout')
            db.session.add(professional)
            db.session.commit()

            rule, _ = CommissionService(sample_clinic).create_rule(
                professional_id=str(professional.id), fixed_amount=30,
            )
            appt = Appointment(
                clinic_id=sample_clinic.id, patient_id=sample_patient.id,
                professional_id=professional.id, service_name='Consulta Geral',
                scheduled_datetime=utcnow() - timedelta(days=1),
                status=AppointmentStatus.COMPLETED, price=100,
            )
            db.session.add(appt)
            db.session.commit()

            payout, error = CommissionService(sample_clinic).create_payout(
                professional_id=str(professional.id),
                period_start=date.today() - timedelta(days=30),
                period_end=date.today(),
                amount=30,
            )
            assert error is None

            summary = CommissionService(sample_clinic).get_commission_summary(days=30)
            entry = next(e for e in summary if e['professional_id'] == str(professional.id))
            assert entry['earned_total'] == 30.0
            assert entry['paid_total'] == 30.0
            assert entry['balance'] == 0.0

            _cleanup(appt, payout, rule, professional)

    def test_appointment_without_rule_earns_nothing(self, app, sample_clinic, sample_patient):
        with app.app_context():
            professional = Professional(clinic_id=sample_clinic.id, name='Dr. SemRegra')
            db.session.add(professional)
            db.session.commit()

            appt = Appointment(
                clinic_id=sample_clinic.id, patient_id=sample_patient.id,
                professional_id=professional.id, service_name='Consulta Geral',
                scheduled_datetime=utcnow() - timedelta(days=1),
                status=AppointmentStatus.COMPLETED, price=100,
            )
            db.session.add(appt)
            db.session.commit()

            summary = CommissionService(sample_clinic).get_commission_summary(days=30)
            assert all(e['professional_id'] != str(professional.id) for e in summary)

            _cleanup(appt, professional)


class TestFinancialServiceCashFlowAndGoals:
    def test_cash_flow_nets_payments_against_expenses_and_payouts(self, app, sample_clinic, sample_patient):
        with app.app_context():
            professional = Professional(clinic_id=sample_clinic.id, name='Dr. Fluxo')
            db.session.add(professional)
            db.session.commit()

            payment = Payment(
                clinic_id=sample_clinic.id, patient_id=sample_patient.id, amount=100,
                paid_amount=100, status=PaymentStatus.PAID, paid_at=utcnow(),
            )
            expense = Expense(
                clinic_id=sample_clinic.id, description='Insumos', amount=30,
                category=ExpenseCategory.SUPPLIES, status=ExpenseStatus.PAID, paid_at=utcnow(),
            )
            payout = CommissionPayout(
                clinic_id=sample_clinic.id, professional_id=professional.id,
                period_start=date.today() - timedelta(days=30), period_end=date.today(),
                amount=20, paid_at=utcnow(),
            )
            db.session.add_all([payment, expense, payout])
            db.session.commit()

            cash_flow = FinancialService(sample_clinic).get_cash_flow(days=30)
            assert cash_flow['cash_in'] == 100.0
            assert cash_flow['cash_out'] == 50.0
            assert cash_flow['net_cash_flow'] == 50.0

            _cleanup(payment, expense, payout, professional)

    def test_goal_progress_without_goal(self, app, sample_clinic):
        with app.app_context():
            progress = FinancialService(sample_clinic).get_goal_progress(period='2026-01')
            assert progress['has_goal'] is False
            assert progress['target_amount'] is None
            assert progress['progress_pct'] is None

    def test_set_goal_and_progress(self, app, sample_clinic, sample_patient):
        with app.app_context():
            goal = FinancialService(sample_clinic).set_goal(period='2026-03', target_amount=1000)
            assert float(goal.target_amount) == 1000.0

            appt = Appointment(
                clinic_id=sample_clinic.id, patient_id=sample_patient.id,
                service_name='Consulta Geral', scheduled_datetime=datetime(2026, 3, 10),
                status=AppointmentStatus.COMPLETED, price=250,
            )
            db.session.add(appt)
            db.session.commit()

            progress = FinancialService(sample_clinic).get_goal_progress(period='2026-03')
            assert progress['has_goal'] is True
            assert progress['target_amount'] == 1000.0
            assert progress['realized_revenue'] == 250.0
            assert progress['progress_pct'] == 25.0

            _cleanup(appt, goal)


class TestFinanceRoutes:
    def test_payments_routes_full_flow(self, app, client, auth_headers, sample_patient):
        create_resp = client.post('/api/financial/payments', headers=auth_headers, json={
            'patient_id': str(sample_patient.id), 'amount': 150, 'method': 'pix',
        })
        assert create_resp.status_code == 201
        payment_id = create_resp.get_json()['payments'][0]['id']

        register_resp = client.post(
            f'/api/financial/payments/{payment_id}/register', headers=auth_headers, json={'paid_amount': 150},
        )
        assert register_resp.status_code == 200
        assert register_resp.get_json()['payment']['status'] == 'paid'

        list_resp = client.get('/api/financial/payments', headers=auth_headers)
        assert list_resp.status_code == 200
        assert list_resp.get_json()['total'] >= 1

        with app.app_context():
            payment = db.session.get(Payment, payment_id)
            _cleanup(payment)

    def test_create_payment_requires_auth(self, client):
        response = client.post('/api/financial/payments', json={'patient_id': 'x', 'amount': 10})
        assert response.status_code == 401

    def test_expenses_routes_full_flow(self, app, client, auth_headers):
        create_resp = client.post('/api/financial/expenses', headers=auth_headers, json={
            'description': 'Manutenção', 'amount': 200, 'category': 'equipment',
        })
        assert create_resp.status_code == 201
        expense_id = create_resp.get_json()['expenses'][0]['id']

        pay_resp = client.post(f'/api/financial/expenses/{expense_id}/pay', headers=auth_headers)
        assert pay_resp.status_code == 200
        assert pay_resp.get_json()['expense']['status'] == 'paid'

        with app.app_context():
            expense = db.session.get(Expense, expense_id)
            _cleanup(expense)

    def test_commission_rule_route_rejects_both_kinds(self, client, auth_headers):
        response = client.post('/api/financial/commission-rules', headers=auth_headers, json={
            'percentage': 10, 'fixed_amount': 5,
        })
        assert response.status_code == 400

    def test_goal_route_rejects_bad_period(self, client, auth_headers):
        response = client.post('/api/financial/goals', headers=auth_headers, json={
            'period': '2026-13', 'target_amount': 100,
        })
        assert response.status_code == 400

    def test_cash_flow_route(self, client, auth_headers):
        response = client.get('/api/financial/cash-flow', headers=auth_headers)
        assert response.status_code == 200
        data = response.get_json()
        assert 'cash_in' in data and 'cash_out' in data and 'net_cash_flow' in data
