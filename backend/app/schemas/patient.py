"""
Patient schemas.
"""
from marshmallow import fields, validate

from .base import BaseSchema, validate_email, validate_phone


class PatientCreateSchema(BaseSchema):
    """Schema for creating a patient."""
    name = fields.Str(
        required=True,
        validate=validate.Length(min=2, max=255),
        error_messages={'required': 'Name is required'}
    )
    phone = fields.Str(
        required=True,
        validate=validate_phone,
        error_messages={'required': 'Phone is required'}
    )
    email = fields.Str(
        validate=validate_email,
        allow_none=True
    )
    notes = fields.Str(
        validate=validate.Length(max=2000),
        allow_none=True
    )


class PatientUpdateSchema(BaseSchema):
    """Schema for updating a patient."""
    name = fields.Str(validate=validate.Length(min=2, max=255))
    phone = fields.Str(validate=validate_phone)
    email = fields.Str(validate=validate_email, allow_none=True)
    notes = fields.Str(validate=validate.Length(max=2000), allow_none=True)
