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


def normalize_phone(phone: Optional[str]) -> str:
    """Normalize phone number to standard format."""
    if not phone:
        return ''

    # Remove non-numeric characters
    cleaned = re.sub(r'\D', '', phone)

    # Add country code if missing
    if len(cleaned) == 10 or len(cleaned) == 11:
        cleaned = '55' + cleaned

    return cleaned


# Passwords that trivially pass the character-class rules but are among the most
# guessed - rejected outright so credential-stuffing lists lose their easy hits.
COMMON_PASSWORDS = frozenset({
    'password', 'password1', 'password123', 'senha123', 'senha1234',
    '12345678', '123456789', '1234567890', 'qwerty123', 'abc12345',
    'iloveyou1', 'admin123', 'welcome1', 'letmein1', 'mudar123', 'clinica123',
})

MIN_PASSWORD_LENGTH = 10


def validate_password(password: str) -> tuple[bool, Optional[str]]:
    """
    Validate password strength.
    Returns (is_valid, error_message).
    """
    if not password or len(password) < MIN_PASSWORD_LENGTH:
        return False, f'Password must be at least {MIN_PASSWORD_LENGTH} characters long'

    if not re.search(r'[A-Za-z]', password):
        return False, 'Password must contain at least one letter'

    if not re.search(r'\d', password):
        return False, 'Password must contain at least one number'

    if password.lower() in COMMON_PASSWORDS:
        return False, 'Password is too common. Choose a less predictable password'

    return True, None
