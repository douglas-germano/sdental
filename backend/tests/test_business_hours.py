"""
Tests for lunch-break support in business_hours: the shared parsing helper
(app.utils.business_hours), the slot-generation/availability-check logic in
AppointmentService, the public booking availability endpoint, and how the
WhatsApp AI agent (ClaudeService) surfaces/enforces it.
"""
import json
from datetime import datetime, timedelta, time

from app.utils.datetime_utils import utcnow
from app import db
from app.models import Professional
from app.services.appointment_service import AppointmentService
from app.services.claude_service import ClaudeService
from app.utils.business_hours import get_working_ranges, is_within_working_ranges


def _future_weekday_date(days_ahead: int = 10):
    """A date far enough in the future to avoid 'today' edge cases."""
    return (utcnow() + timedelta(days=days_ahead)).date()


class TestGetWorkingRanges:
    def test_closed_day_returns_empty(self):
        assert get_working_ranges({'active': False, 'start': '08:00', 'end': '18:00'}) == []

    def test_missing_config_returns_empty(self):
        assert get_working_ranges({}) == []
        assert get_working_ranges(None) == []

    def test_no_break_returns_single_range(self):
        ranges = get_working_ranges({'active': True, 'start': '08:00', 'end': '18:00'})
        assert ranges == [(time(8, 0), time(18, 0))]

    def test_with_break_splits_into_two_ranges(self):
        ranges = get_working_ranges({
            'active': True, 'start': '08:00', 'end': '18:00',
            'break_start': '12:00', 'break_end': '13:00',
        })
        assert ranges == [(time(8, 0), time(12, 0)), (time(13, 0), time(18, 0))]

    def test_invalid_break_outside_hours_ignored(self):
        # break_end (07:00) is before start (08:00) - not a valid sub-range,
        # so the day should behave as if there was no break at all.
        ranges = get_working_ranges({
            'active': True, 'start': '08:00', 'end': '18:00',
            'break_start': '06:00', 'break_end': '07:00',
        })
        assert ranges == [(time(8, 0), time(18, 0))]

    def test_malformed_start_end_returns_empty(self):
        assert get_working_ranges({'active': True, 'start': 'bad', 'end': '18:00'}) == []


class TestIsWithinWorkingRanges:
    def test_slot_inside_range(self):
        ranges = [(time(8, 0), time(12, 0)), (time(13, 0), time(18, 0))]
        assert is_within_working_ranges(ranges, time(9, 0), time(9, 30)) is True

    def test_slot_spanning_break_rejected(self):
        ranges = [(time(8, 0), time(12, 0)), (time(13, 0), time(18, 0))]
        assert is_within_working_ranges(ranges, time(11, 30), time(12, 30)) is False

    def test_slot_inside_break_rejected(self):
        ranges = [(time(8, 0), time(12, 0)), (time(13, 0), time(18, 0))]
        assert is_within_working_ranges(ranges, time(12, 15), time(12, 45)) is False


class TestAppointmentServiceLunchBreak:
    def test_get_available_slots_skips_break_window(self, app, sample_clinic):
        with app.app_context():
            future_date = _future_weekday_date()
            day_idx = future_date.weekday()
            sample_clinic.business_hours = {
                str(day_idx): {
                    'start': '08:00', 'end': '18:00', 'active': True,
                    'break_start': '12:00', 'break_end': '13:00',
                }
            }
            db.session.commit()

            slots = AppointmentService(sample_clinic).get_available_slots(future_date)
            start_times = {s['start_time'] for s in slots}

            assert '11:30' in start_times
            assert '13:00' in start_times
            assert '12:00' not in start_times
            assert '12:30' not in start_times

    def test_is_slot_available_rejects_break_time(self, app, sample_clinic):
        with app.app_context():
            future_date = _future_weekday_date()
            day_idx = future_date.weekday()
            sample_clinic.business_hours = {
                str(day_idx): {
                    'start': '08:00', 'end': '18:00', 'active': True,
                    'break_start': '12:00', 'break_end': '13:00',
                }
            }
            db.session.commit()

            service = AppointmentService(sample_clinic)
            during_break = datetime.combine(future_date, time(12, 15))
            before_break = datetime.combine(future_date, time(11, 0))

            assert service.is_slot_available(during_break, duration_minutes=30) is False
            assert service.is_slot_available(before_break, duration_minutes=30) is True

    def test_professional_override_with_break(self, app, sample_clinic):
        with app.app_context():
            future_date = _future_weekday_date()
            day_idx = future_date.weekday()
            professional = Professional(
                clinic_id=sample_clinic.id,
                name='Dr. Break',
                business_hours={
                    str(day_idx): {
                        'start': '09:00', 'end': '17:00', 'active': True,
                        'break_start': '12:00', 'break_end': '14:00',
                    }
                },
            )
            db.session.add(professional)
            db.session.commit()

            slots = AppointmentService(sample_clinic).get_available_slots(
                future_date, professional_id=professional.id
            )
            start_times = {s['start_time'] for s in slots}
            assert '11:30' in start_times
            assert '14:00' in start_times
            assert '12:30' not in start_times

            db.session.delete(professional)
            db.session.commit()


class TestPublicAvailabilityLunchBreak:
    def test_availability_endpoint_skips_break(self, app, client, sample_clinic):
        with app.app_context():
            future_date = _future_weekday_date()
            day_idx = future_date.weekday()
            sample_clinic.slug = 'clinica-teste-almoco'
            sample_clinic.active = True
            sample_clinic.booking_enabled = True
            sample_clinic.business_hours = {
                str(day_idx): {
                    'start': '08:00', 'end': '18:00', 'active': True,
                    'break_start': '12:00', 'break_end': '13:00',
                }
            }
            db.session.commit()
            slug = sample_clinic.slug
            date_str = future_date.strftime('%Y-%m-%d')

        response = client.get(f'/api/public/clinic/{slug}/availability?date={date_str}')
        assert response.status_code == 200
        times = {s['time'] for s in response.get_json()['available_slots']}
        assert '11:30' in times
        assert '13:00' in times
        assert '12:00' not in times


class TestClaudeServiceLunchBreak:
    def test_format_business_hours_includes_break(self, app, sample_clinic):
        with app.app_context():
            sample_clinic.openrouter_api_key = 'test-key'
            sample_clinic.business_hours = {
                '0': {'start': '08:00', 'end': '18:00', 'active': True, 'break_start': '12:00', 'break_end': '13:00'},
            }
            service = ClaudeService(sample_clinic)
            text = service._format_business_hours()
            assert 'pausa para almoço 12:00-13:00' in text

    def test_create_appointment_rejects_lunch_break_time(self, app, sample_clinic):
        with app.app_context():
            future_date = _future_weekday_date()
            day_idx = future_date.weekday()
            sample_clinic.openrouter_api_key = 'test-key'
            sample_clinic.business_hours = {
                str(day_idx): {
                    'start': '08:00', 'end': '18:00', 'active': True,
                    'break_start': '12:00', 'break_end': '13:00',
                }
            }
            db.session.commit()

            service = ClaudeService(sample_clinic)
            dt_str = datetime.combine(future_date, time(12, 30)).strftime('%Y-%m-%dT%H:%M')
            result = service._tool_create_appointment(
                {'patient_name': 'Fulano', 'datetime': dt_str, 'service': 'Consulta Geral'},
                conversation=None,
            )
            assert 'almoço' in result.lower()

    def test_create_appointment_none_business_hours_does_not_crash(self, app, sample_clinic):
        with app.app_context():
            future_date = _future_weekday_date()
            sample_clinic.openrouter_api_key = 'test-key'
            sample_clinic.business_hours = None
            db.session.commit()

            service = ClaudeService(sample_clinic)
            dt_str = datetime.combine(future_date, time(10, 0)).strftime('%Y-%m-%dT%H:%M')
            result = service._tool_create_appointment(
                {'patient_name': 'Fulano', 'datetime': dt_str, 'service': 'Consulta Geral'},
                conversation=None,
            )
            # Should hit the "day not active" branch instead of raising AttributeError.
            assert 'não funciona' in result
