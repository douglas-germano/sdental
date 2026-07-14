"""
Datetime helpers.

Two time conventions coexist in this codebase, both stored as NAIVE
datetimes (the DateTime columns carry no timezone):

- System timestamps (created_at, updated_at, deleted_at, sent_at, audit
  rows, subscription bookkeeping): naive UTC. Use `utcnow()`.
- Business / clinic-facing times (Appointment.scheduled_datetime,
  business-hours and quiet-hours checks, "is this in the past?"
  validations, calendar-month analytics): naive America/Sao_Paulo local
  time. Use `local_now()` / `local_today()`. The product is Brazil-only
  (see the hardcoded phone format), and the AI agent and reminder engine
  already work in this timezone.

Mixing the two shifts results by the UTC offset (3h): e.g. validating a
scheduled_datetime (local) against utcnow() rejects bookings within the
next 3 hours as "in the past" on a UTC server.

`datetime.utcnow()` / `datetime.utcfromtimestamp()` are deprecated since
Python 3.12; the helpers here are drop-in, still-naive replacements.
"""
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

BR_TZ = ZoneInfo('America/Sao_Paulo')


def utcnow() -> datetime:
    """Current UTC time as a naive datetime (replacement for datetime.utcnow())."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def utcfromtimestamp(seconds: float) -> datetime:
    """Naive UTC datetime from a unix timestamp (replacement for datetime.utcfromtimestamp())."""
    return datetime.fromtimestamp(seconds, tz=timezone.utc).replace(tzinfo=None)


def local_now() -> datetime:
    """Current clinic-local (America/Sao_Paulo) time as a naive datetime."""
    return datetime.now(BR_TZ).replace(tzinfo=None)


def local_today() -> date:
    """Current clinic-local (America/Sao_Paulo) date."""
    return datetime.now(BR_TZ).date()
