"""
Appointment schemas.
"""
from marshmallow import fields, validate, validates, ValidationError
from datetime import datetime

from .base import BaseSchema


class AppointmentCreateSchema(BaseSchema):
    """Schema for creating an appointment."""
    patient_id = fields.UUID(
        required=True,
        error_messages={'required': 'Patient ID is required'}
    )
    service_name = fields.Str(
        required=True,
        validate=validate.Length(min=1, max=255),
        error_messages={'required': 'Service name is required'}
    )
    scheduled_datetime = fields.DateTime(
        required=True,
        error_messages={'required': 'Scheduled datetime is required'}
    )
    duration_minutes = fields.Int(
        validate=validate.Range(min=15, max=480),
        load_default=30
    )
    notes = fields.Str(
        validate=validate.Length(max=2000),
        allow_none=True
    )
    status = fields.Str(
        validate=validate.OneOf(['pending', 'confirmed']),
        load_default='confirmed'
    )

    @validates('scheduled_datetime')
    def validate_future_date(self, value):
        """Ensure appointment is in the future."""
        if value < datetime.utcnow():
            raise ValidationError('Appointment must be scheduled in the future')


class AppointmentUpdateSchema(BaseSchema):
    """Schema for updating an appointment."""
    status = fields.Str(
        validate=validate.OneOf(['pending', 'confirmed', 'cancelled', 'completed', 'no_show'])
    )
    scheduled_datetime = fields.DateTime()
    notes = fields.Str(validate=validate.Length(max=2000), allow_none=True)
    duration_minutes = fields.Int(validate=validate.Range(min=15, max=480))
