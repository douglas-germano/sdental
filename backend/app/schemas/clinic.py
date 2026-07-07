"""
Clinic schemas.
"""
import re

from marshmallow import fields, validate, validates_schema, ValidationError

from .base import BaseSchema, validate_email, validate_phone

_TIME_RE = re.compile(r'^([01]\d|2[0-3]):[0-5]\d$')


def validate_time_str(value: str) -> None:
    """Validate a "HH:MM" 24h time string."""
    if not _TIME_RE.match(value):
        raise ValidationError('Must be in HH:MM format (00:00-23:59)')


class ServiceSchema(BaseSchema):
    """Schema for a clinic service."""
    name = fields.Str(
        required=True,
        validate=validate.Length(min=1, max=255)
    )
    duration = fields.Int(
        load_default=30,
        validate=validate.Range(min=15, max=480)
    )
    price = fields.Float(
        allow_none=True,
        load_default=None,
        validate=validate.Range(min=0)
    )
    instructions = fields.Str(
        allow_none=True,
        load_default=None,
        validate=validate.Length(max=2000)
    )


class DayHoursSchema(BaseSchema):
    """Schema for a single day's business hours."""
    start = fields.Str(required=True, validate=validate_time_str)
    end = fields.Str(required=True, validate=validate_time_str)
    active = fields.Bool(load_default=True)
    # Optional lunch break - see app/utils/business_hours.py for how it
    # splits the working day when both are set.
    break_start = fields.Str(allow_none=True, load_default=None, validate=validate_time_str)
    break_end = fields.Str(allow_none=True, load_default=None, validate=validate_time_str)

    @validates_schema
    def validate_hours(self, data, **kwargs):
        """Validate that start is before end, and the break (if any) fits inside it."""
        if not data.get('active', True):
            return

        start = data.get('start', '00:00')
        end = data.get('end', '00:00')
        if start >= end:
            raise ValidationError('Start time must be before end time')

        break_start = data.get('break_start')
        break_end = data.get('break_end')
        if break_start and break_end and break_start >= break_end:
            raise ValidationError('break_start must be before break_end')


class BusinessHoursSchema(BaseSchema):
    """Schema for business hours configuration."""
    # Days 0-6 (Monday to Sunday)
    day_0 = fields.Nested(DayHoursSchema, data_key='0')
    day_1 = fields.Nested(DayHoursSchema, data_key='1')
    day_2 = fields.Nested(DayHoursSchema, data_key='2')
    day_3 = fields.Nested(DayHoursSchema, data_key='3')
    day_4 = fields.Nested(DayHoursSchema, data_key='4')
    day_5 = fields.Nested(DayHoursSchema, data_key='5')
    day_6 = fields.Nested(DayHoursSchema, data_key='6')


class ClinicUpdateSchema(BaseSchema):
    """Schema for updating clinic profile."""
    name = fields.Str(validate=validate.Length(min=2, max=255))
    phone = fields.Str(validate=validate_phone)
    email = fields.Str(validate=validate_email)


class AgentConfigSchema(BaseSchema):
    """Schema for agent configuration."""
    agent_name = fields.Str(validate=validate.Length(max=100))
    agent_temperature = fields.Float(validate=validate.Range(min=0.0, max=1.0))
    agent_system_prompt = fields.Str(validate=validate.Length(max=10000))
    agent_context = fields.Str(validate=validate.Length(max=5000))
