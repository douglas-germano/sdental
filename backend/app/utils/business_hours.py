"""
Shared helpers for interpreting a clinic's (or professional's) per-day
business_hours JSONB config.

Day config shape:
    {
        'active': bool,
        'start': 'HH:MM',
        'end': 'HH:MM',
        'break_start': 'HH:MM',  # optional - lunch break
        'break_end': 'HH:MM',    # optional - lunch break
    }

break_start/break_end are optional; when both are present and fall strictly
inside [start, end], the working day is split in two ranges around the break.
"""
from datetime import time
from typing import List, Optional, Tuple


def parse_time(value: str) -> time:
    hour, minute = map(int, value.split(':'))
    return time(hour, minute)


def get_working_ranges(day_config: Optional[dict]) -> List[Tuple[time, time]]:
    """
    Return the list of open time ranges for a day. Splits around a lunch
    break when break_start/break_end are set and valid; otherwise a single
    range. Returns an empty list when the day is closed or misconfigured.
    """
    if not day_config or not day_config.get('active'):
        return []

    try:
        start = parse_time(day_config['start'])
        end = parse_time(day_config['end'])
    except (KeyError, ValueError, TypeError, AttributeError):
        return []

    if start >= end:
        return []

    break_start_raw = day_config.get('break_start')
    break_end_raw = day_config.get('break_end')
    if break_start_raw and break_end_raw:
        try:
            break_start = parse_time(break_start_raw)
            break_end = parse_time(break_end_raw)
        except (ValueError, TypeError, AttributeError):
            break_start = break_end = None

        if break_start and break_end and start < break_start < break_end < end:
            return [(start, break_start), (break_end, end)]

    return [(start, end)]


def is_within_working_ranges(ranges: List[Tuple[time, time]], slot_start: time, slot_end: time) -> bool:
    """True if [slot_start, slot_end] fits entirely inside one contiguous open range."""
    return any(slot_start >= r_start and slot_end <= r_end for r_start, r_end in ranges)
