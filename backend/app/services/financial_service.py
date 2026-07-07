"""
Revenue forecasting and reporting.

Foundation for the clinic's financial module: turns booked appointments into
money figures by combining each appointment's snapshotted `price` (captured
at booking time - see Appointment.price and AppointmentService.get_service_price)
with its status:

  - COMPLETED                      -> realized revenue (money already earned)
  - PENDING / CONFIRMED (future)   -> forecasted revenue (money expected)
  - CANCELLED / NO_SHOW            -> lost revenue (money that slipped away)

Appointments booked before the `price` column existed have no snapshot, so
`_price_for` falls back to the service's current price in clinic.services.
"""
from collections import OrderedDict
from datetime import datetime, timedelta
from typing import Callable

from app.models import Appointment, AppointmentStatus

REALIZED = 'realized'
FORECAST = 'forecast'


class FinancialService:
    """Revenue reporting for a single clinic, derived from its appointments."""

    def __init__(self, clinic):
        self.clinic = clinic

    def _price_for(self, appointment: Appointment) -> float:
        if appointment.price is not None:
            return float(appointment.price)
        for s in (self.clinic.services or []):
            if (s.get('name') or '').strip().lower() == (appointment.service_name or '').strip().lower():
                price = s.get('price')
                return float(price) if price is not None else 0.0
        return 0.0

    def get_summary(self, days: int = 30) -> dict:
        """
        Realized revenue for the past `days`, forecasted revenue for the next
        `days` (same window length, so the two are directly comparable), and
        lost revenue (cancellations/no-shows) for the past `days`.
        """
        days = max(1, min(days, 365))
        now = datetime.utcnow()
        past_start = now - timedelta(days=days)
        future_end = now + timedelta(days=days)

        realized_appts = Appointment.query.filter(
            Appointment.clinic_id == self.clinic.id,
            Appointment.status == AppointmentStatus.COMPLETED,
            Appointment.scheduled_datetime >= past_start,
            Appointment.scheduled_datetime <= now,
        ).all()

        forecast_appts = Appointment.query.filter(
            Appointment.clinic_id == self.clinic.id,
            Appointment.status.in_([AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED]),
            Appointment.scheduled_datetime >= now,
            Appointment.scheduled_datetime <= future_end,
        ).all()

        lost_appts = Appointment.query.filter(
            Appointment.clinic_id == self.clinic.id,
            Appointment.status.in_([AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW]),
            Appointment.scheduled_datetime >= past_start,
            Appointment.scheduled_datetime <= now,
        ).all()

        realized = sum(self._price_for(a) for a in realized_appts)
        forecast = sum(self._price_for(a) for a in forecast_appts)
        lost = sum(self._price_for(a) for a in lost_appts)

        return {
            'period_days': days,
            'realized_revenue': round(realized, 2),
            'realized_count': len(realized_appts),
            'forecast_revenue': round(forecast, 2),
            'forecast_count': len(forecast_appts),
            'lost_revenue': round(lost, 2),
            'lost_count': len(lost_appts),
        }

    @staticmethod
    def _period_key(dt: datetime, group_by: str) -> str:
        if group_by == 'day':
            return dt.date().isoformat()
        if group_by == 'month':
            return dt.strftime('%Y-%m')
        iso_year, iso_week, _ = dt.isocalendar()
        return f"{iso_year}-W{iso_week:02d}"

    def get_revenue_timeseries(
        self, past_days: int = 90, future_days: int = 60, group_by: str = 'week'
    ) -> list[dict]:
        """Realized vs. forecasted revenue bucketed by day/week/month, for charting."""
        if group_by not in ('day', 'week', 'month'):
            group_by = 'week'
        past_days = max(0, min(past_days, 730))
        future_days = max(0, min(future_days, 365))

        now = datetime.utcnow()
        start = now - timedelta(days=past_days)
        end = now + timedelta(days=future_days)

        appointments = Appointment.query.filter(
            Appointment.clinic_id == self.clinic.id,
            Appointment.scheduled_datetime >= start,
            Appointment.scheduled_datetime <= end,
            Appointment.status.in_([
                AppointmentStatus.COMPLETED, AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED
            ]),
        ).order_by(Appointment.scheduled_datetime).all()

        buckets: OrderedDict = OrderedDict()
        for appt in appointments:
            key = self._period_key(appt.scheduled_datetime, group_by)
            bucket = buckets.setdefault(key, {'period': key, REALIZED: 0.0, FORECAST: 0.0})
            bucket_key = REALIZED if appt.status == AppointmentStatus.COMPLETED else FORECAST
            bucket[bucket_key] += self._price_for(appt)

        return [
            {'period': b['period'], 'realized': round(b[REALIZED], 2), 'forecast': round(b[FORECAST], 2)}
            for b in buckets.values()
        ]

    def _breakdown(self, days: int, key_fn: Callable[[Appointment], str]) -> list[dict]:
        days = max(1, min(days, 365))
        now = datetime.utcnow()
        start = now - timedelta(days=days)
        end = now + timedelta(days=days)

        appointments = Appointment.query.filter(
            Appointment.clinic_id == self.clinic.id,
            Appointment.scheduled_datetime >= start,
            Appointment.scheduled_datetime <= end,
            Appointment.status.in_([
                AppointmentStatus.COMPLETED, AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED
            ]),
        ).all()

        breakdown: dict = {}
        for appt in appointments:
            bucket_key = REALIZED if appt.status == AppointmentStatus.COMPLETED else FORECAST
            key = key_fn(appt)
            entry = breakdown.setdefault(key, {'name': key, REALIZED: 0.0, FORECAST: 0.0, 'count': 0})
            entry[bucket_key] += self._price_for(appt)
            entry['count'] += 1

        results = [
            {'name': v['name'], 'realized': round(v[REALIZED], 2), 'forecast': round(v[FORECAST], 2), 'count': v['count']}
            for v in breakdown.values()
        ]
        results.sort(key=lambda r: r['realized'] + r['forecast'], reverse=True)
        return results

    def get_breakdown_by_service(self, days: int = 30) -> list[dict]:
        return self._breakdown(days, lambda a: a.service_name or 'Sem serviço')

    def get_breakdown_by_professional(self, days: int = 30) -> list[dict]:
        return self._breakdown(days, lambda a: a.professional.name if a.professional else 'Sem profissional')
