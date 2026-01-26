import re
from typing import Optional


def validate_email(email: str) -> bool:
    """Validate email format."""
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return bool(re.match(pattern, email))


def validate_phone(phone: str) -> bool:
    """Validate phone number format (Brazilian format: 5511999999999)."""
    # Remove non-numeric characters
    cleaned = re.sub(r'\D', '', phone)
    # Brazilian phone: country code (55) + area code (2 digits) + number (8-9 digits)
    return len(cleaned) >= 10 and len(cleaned) <= 13


def normalize_phone(phone: str) -> str:
    """Normalize phone number to standard format."""
    # Remove non-numeric characters
    cleaned = re.sub(r'\D', '', phone)

    # Add country code if missing
    if len(cleaned) == 10 or len(cleaned) == 11:
        cleaned = '55' + cleaned

    return cleaned


def validate_password(password: str) -> tuple[bool, Optional[str]]:
    """
    Validate password strength.
    Returns (is_valid, error_message).
    """
    if len(password) < 8:
        return False, 'Password must be at least 8 characters long'

    if not re.search(r'[A-Za-z]', password):
        return False, 'Password must contain at least one letter'

    if not re.search(r'\d', password):
        return False, 'Password must contain at least one number'

    return True, None
