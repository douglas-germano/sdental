"""
Authentication schemas.
"""
from marshmallow import fields, validate

from .base import BaseSchema, validate_email, validate_phone, validate_password


class RegisterSchema(BaseSchema):
    """Schema for clinic registration."""
    name = fields.Str(
        required=True,
        validate=validate.Length(min=2, max=255),
        error_messages={'required': 'Name is required'}
    )
    email = fields.Str(
        required=True,
        validate=validate_email,
        error_messages={'required': 'Email is required'}
    )
    phone = fields.Str(
        required=True,
        validate=validate_phone,
        error_messages={'required': 'Phone is required'}
    )
    password = fields.Str(
        required=True,
        validate=validate_password,
        load_only=True,
        error_messages={'required': 'Password is required'}
    )


class LoginSchema(BaseSchema):
    """Schema for login."""
    email = fields.Str(
        required=True,
        error_messages={'required': 'Email is required'}
    )
    password = fields.Str(
        required=True,
        load_only=True,
        error_messages={'required': 'Password is required'}
    )
