"""
Clinic schemas.
"""
from marshmallow import fields, validate, validates_schema, ValidationError

from .base import BaseSchema, validate_email, validate_phone


class ServiceSchema(BaseSchema):
    """Schema for a clinic service."""
    name = fields.Str(
        required=True,
        validate=validate.Length(min=1, max=255)
    )
    duration = fields.Int(
        required=True,
        validate=validate.Range(min=15, max=480)
    )


class DayHoursSchema(BaseSchema):
    """Schema for a single day's business hours."""
    start = fields.Str(required=True)  # Format: "HH:MM"
    end = fields.Str(required=True)    # Format: "HH:MM"
    active = fields.Bool(load_default=True)

    @validates_schema
    def validate_hours(self, data, **kwargs):
        """Validate that start is before end."""
        if data.get('active', True):
            start = data.get('start', '00:00')
            end = data.get('end', '00:00')
            if start >= end:
                raise ValidationError('Start time must be before end time')


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
    agent_model = fields.Str(
        validate=validate.OneOf([
            'claude-3-5-sonnet-20240620',
            'claude-3-haiku-20240307',
            'claude-3-opus-20240229'
        ])
    )
    agent_temperature = fields.Float(validate=validate.Range(min=0.0, max=1.0))
    agent_system_prompt = fields.Str(validate=validate.Length(max=10000))
    agent_context = fields.Str(validate=validate.Length(max=5000))
