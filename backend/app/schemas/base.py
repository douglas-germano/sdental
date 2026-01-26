"""
Base schema with common functionality.
"""
import re
from marshmallow import Schema, ValidationError, EXCLUDE


class BaseSchema(Schema):
    """Base schema with common configuration."""

    class Meta:
        unknown = EXCLUDE  # Ignore unknown fields


def validate_email(value: str) -> None:
    """Validate email format."""
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    if not re.match(pattern, value):
        raise ValidationError('Invalid email format')


def validate_phone(value: str) -> None:
    """Validate phone number format (Brazilian format)."""
    cleaned = re.sub(r'\D', '', value)
    if len(cleaned) < 10 or len(cleaned) > 13:
        raise ValidationError('Phone must have 10-13 digits')


def validate_password(value: str) -> None:
    """Validate password strength."""
    if len(value) < 8:
        raise ValidationError('Password must be at least 8 characters long')
    if not re.search(r'[A-Za-z]', value):
        raise ValidationError('Password must contain at least one letter')
    if not re.search(r'\d', value):
        raise ValidationError('Password must contain at least one number')
