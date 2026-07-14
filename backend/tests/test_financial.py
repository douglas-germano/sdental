"""
Tests for the revenue forecast / financial module: price snapshotting on
Appointment (both the AI/public booking path via AppointmentService and the
manual staff-creation route), and FinancialService's summary/timeseries/
breakdown calculations plus their HTTP routes.
"""
from datetime import timedelta

from app.utils.datetime_utils import utcnow
from app import db
from app.models import Appointment, AppointmentStatus, AppointmentReminder, Clinic, Professional
from app.services.appointment_service import AppointmentService
from app.services.financial_service import FinancialService


def _set_services_with_price(clinic, price=150):
    clinic.services = [
        {'name': 'Consulta Geral', 'duration': 30, 'price': price},
        {'name': 'Retorno', 'duration': 15, 'price': price / 2},
    ]
    db.session.commit()


def _delete_appointment_and_reminders(appointment):
    """AppointmentService.create_appointment also schedules reminders - clear
    those first so deleting the appointment doesn't hit their NOT NULL FK."""
    AppointmentReminder.query.filter_by(appointment_id=appointment.id).delete()
    db.session.delete(appointment)
    db.session.commit()


class TestPriceSnapshot:
    def test_get_service_price_matches_by_name_case_insensitive(self, app, sample_clinic):
        with app.app_context():
            _set_services_with_price(sample_clinic, price=200)
            service = AppointmentService(sample_clinic)
            assert service.get_service_price('consulta geral') == 200
            assert service.get_service_price('RETORNO') == 100
            assert service.get_service_price('Nao Existe') is None
            assert service.get_service_price(None) is None

    def test_create_appointment_snapshots_price(self, app, sample_clinic):
        with app.app_context():
            _set_services_with_price(sample_clinic, price=180)
            service = AppointmentService(sample_clinic)
            future_dt = utcnow().replace(hour=10, minute=0, second=0, microsecond=0) + timedelta(days=14)
            # Ensure a weekday so default business hours (Mon-Fri) apply
            while future_dt.weekday() > 4:
                future_dt += timedelta(days=1)

            appointment, error = service.create_appointment(
                patient_name='Fulano de Tal',
                patient_phone='5511999990000',
                scheduled_datetime=future_dt,
                service_name='Consulta Geral',
            )
            assert error is None
            assert appointment is not None
            assert float(appointment.price) == 180.0

            _delete_appointment_and_reminders(appointment)

    def test_create_appointment_price_survives_later_service_price_change(self, app, sample_clinic):
        """Booking snapshots the price; changing clinic.services afterward must not alter it."""
        with app.app_context():
            _set_services_with_price(sample_clinic, price=100)
            service = AppointmentService(sample_clinic)
            future_dt = utcnow().replace(hour=9, minute=0, second=0, microsecond=0) + timedelta(days=15)
            while future_dt.weekday() > 4:
                future_dt += timedelta(days=1)

            appointment, error = service.create_appointment(
                patient_name='Ciclana',
                patient_phone='5511999990001',
                scheduled_datetime=future_dt,
                service_name='Consulta Geral',
            )
            assert error is None
            assert float(appointment.price) == 100.0

            # Clinic raises its price later - the already-booked appointment keeps the old one.
            _set_services_with_price(sample_clinic, price=999)
            refreshed = db.session.get(Appointment, appointment.id)
            assert float(refreshed.price) == 100.0

            _delete_appointment_and_reminders(refreshed)

    def test_manual_route_creation_snapshots_price(self, app, client, auth_headers, sample_clinic, sample_patient):
        with app.app_context():
            clinic = db.session.get(Clinic, sample_clinic.id)
            _set_services_with_price(clinic, price=250)

        # Ensure a weekday within default business hours (Mon-Fri), same as
        # the other price-snapshot tests above - otherwise this test is flaky
        # depending on what time of day/week it happens to run.
        future_dt = utcnow().replace(hour=10, minute=0, second=0, microsecond=0) + timedelta(days=20)
        while future_dt.weekday() > 4:
            future_dt += timedelta(days=1)
        future_date = future_dt.isoformat()
        response = client.post('/api/appointments', headers=auth_headers, json={
            'patient_id': str(sample_patient.id),
            'service_name': 'Consulta Geral',
            'scheduled_datetime': future_date,
            'duration_minutes': 30,
        })
        assert response.status_code == 201
        assert response.get_json()['appointment']['price'] == 250.0


class TestFinancialServiceSummary:
    def test_summary_splits_realized_forecast_lost(self, app, sample_clinic, sample_patient):
        with app.app_context():
            _set_services_with_price(sample_clinic, price=100)
            now = utcnow()

            realized = Appointment(
                clinic_id=sample_clinic.id, patient_id=sample_patient.id,
                service_name='Consulta Geral', scheduled_datetime=now - timedelta(days=5),
                status=AppointmentStatus.COMPLETED, price=100,
            )
            forecast = Appointment(
                clinic_id=sample_clinic.id, patient_id=sample_patient.id,
                service_name='Consulta Geral', scheduled_datetime=now + timedelta(days=5),
                status=AppointmentStatus.CONFIRMED, price=100,
            )
            lost = Appointment(
                clinic_id=sample_clinic.id, patient_id=sample_patient.id,
                service_name='Consulta Geral', scheduled_datetime=now - timedelta(days=2),
                status=AppointmentStatus.NO_SHOW, price=100,
            )
            db.session.add_all([realized, forecast, lost])
            db.session.commit()

            summary = FinancialService(sample_clinic).get_summary(days=30)
            assert summary['realized_revenue'] == 100
            assert summary['realized_count'] == 1
            assert summary['forecast_revenue'] == 100
            assert summary['forecast_count'] == 1
            assert summary['lost_revenue'] == 100
            assert summary['lost_count'] == 1

            for a in (realized, forecast, lost):
                db.session.delete(a)
            db.session.commit()

    def test_summary_falls_back_to_current_service_price_for_legacy_rows(self, app, sample_clinic, sample_patient):
        with app.app_context():
            _set_services_with_price(sample_clinic, price=75)
            now = utcnow()

            legacy = Appointment(
                clinic_id=sample_clinic.id, patient_id=sample_patient.id,
                service_name='Consulta Geral', scheduled_datetime=now - timedelta(days=1),
                status=AppointmentStatus.COMPLETED, price=None,
            )
            db.session.add(legacy)
            db.session.commit()

            summary = FinancialService(sample_clinic).get_summary(days=30)
            assert summary['realized_revenue'] == 75

            db.session.delete(legacy)
            db.session.commit()

    def test_summary_zero_when_no_appointments(self, app, sample_clinic):
        with app.app_context():
            summary = FinancialService(sample_clinic).get_summary(days=30)
            assert summary['realized_revenue'] == 0
            assert summary['forecast_revenue'] == 0
            assert summary['lost_revenue'] == 0


class TestFinancialServiceTimeseries:
    def test_timeseries_buckets_by_week(self, app, sample_clinic, sample_patient):
        with app.app_context():
            now = utcnow()
            completed = Appointment(
                clinic_id=sample_clinic.id, patient_id=sample_patient.id,
                service_name='Consulta Geral', scheduled_datetime=now - timedelta(days=3),
                status=AppointmentStatus.COMPLETED, price=120,
            )
            upcoming = Appointment(
                clinic_id=sample_clinic.id, patient_id=sample_patient.id,
                service_name='Consulta Geral', scheduled_datetime=now + timedelta(days=3),
                status=AppointmentStatus.PENDING, price=120,
            )
            db.session.add_all([completed, upcoming])
            db.session.commit()

            series = FinancialService(sample_clinic).get_revenue_timeseries(
                past_days=30, future_days=30, group_by='week'
            )
            assert len(series) >= 1
            totals_realized = sum(p['realized'] for p in series)
            totals_forecast = sum(p['forecast'] for p in series)
            assert totals_realized == 120
            assert totals_forecast == 120

            db.session.delete(completed)
            db.session.delete(upcoming)
            db.session.commit()

    def test_timeseries_empty_when_no_appointments(self, app, sample_clinic):
        with app.app_context():
            series = FinancialService(sample_clinic).get_revenue_timeseries()
            assert series == []


class TestFinancialServiceBreakdown:
    def test_breakdown_by_service(self, app, sample_clinic, sample_patient):
        with app.app_context():
            now = utcnow()
            a1 = Appointment(
                clinic_id=sample_clinic.id, patient_id=sample_patient.id,
                service_name='Consulta Geral', scheduled_datetime=now - timedelta(days=1),
                status=AppointmentStatus.COMPLETED, price=100,
            )
            a2 = Appointment(
                clinic_id=sample_clinic.id, patient_id=sample_patient.id,
                service_name='Retorno', scheduled_datetime=now + timedelta(days=1),
                status=AppointmentStatus.CONFIRMED, price=50,
            )
            db.session.add_all([a1, a2])
            db.session.commit()

            breakdown = FinancialService(sample_clinic).get_breakdown_by_service(days=30)
            names = {b['name'] for b in breakdown}
            assert 'Consulta Geral' in names
            assert 'Retorno' in names

            db.session.delete(a1)
            db.session.delete(a2)
            db.session.commit()

    def test_breakdown_by_professional_groups_unassigned(self, app, sample_clinic, sample_patient):
        with app.app_context():
            professional = Professional(clinic_id=sample_clinic.id, name='Dr. Fin')
            db.session.add(professional)
            db.session.commit()

            now = utcnow()
            assigned = Appointment(
                clinic_id=sample_clinic.id, patient_id=sample_patient.id,
                professional_id=professional.id,
                service_name='Consulta Geral', scheduled_datetime=now - timedelta(days=1),
                status=AppointmentStatus.COMPLETED, price=100,
            )
            unassigned = Appointment(
                clinic_id=sample_clinic.id, patient_id=sample_patient.id,
                service_name='Consulta Geral', scheduled_datetime=now - timedelta(days=1),
                status=AppointmentStatus.COMPLETED, price=100,
            )
            db.session.add_all([assigned, unassigned])
            db.session.commit()

            breakdown = FinancialService(sample_clinic).get_breakdown_by_professional(days=30)
            names = {b['name'] for b in breakdown}
            assert 'Dr. Fin' in names
            assert 'Sem profissional' in names

            db.session.delete(assigned)
            db.session.delete(unassigned)
            db.session.delete(professional)
            db.session.commit()


class TestFinancialRoutes:
    def test_summary_requires_auth(self, client):
        response = client.get('/api/financial/summary')
        assert response.status_code == 401

    def test_summary_route(self, client, auth_headers):
        response = client.get('/api/financial/summary?days=30', headers=auth_headers)
        assert response.status_code == 200
        data = response.get_json()
        assert 'realized_revenue' in data
        assert 'forecast_revenue' in data
        assert 'lost_revenue' in data

    def test_timeseries_route(self, client, auth_headers):
        response = client.get('/api/financial/timeseries?group_by=month', headers=auth_headers)
        assert response.status_code == 200
        data = response.get_json()
        assert data['group_by'] == 'month'
        assert 'series' in data

    def test_breakdown_route_defaults_to_service(self, client, auth_headers):
        response = client.get('/api/financial/breakdown', headers=auth_headers)
        assert response.status_code == 200
        data = response.get_json()
        assert data['by'] == 'service'

    def test_breakdown_route_by_professional(self, client, auth_headers):
        response = client.get('/api/financial/breakdown?by=professional', headers=auth_headers)
        assert response.status_code == 200
        assert response.get_json()['by'] == 'professional'
