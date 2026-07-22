"""
Portable column types.

Production runs on PostgreSQL, but the test suite runs on in-memory SQLite
(see TestingConfig), so PostgreSQL-only types need a cross-dialect fallback.
"""
import base64
import hashlib
import logging
import os
import uuid as _uuid

from sqlalchemy import JSON
from sqlalchemy.dialects.postgresql import JSONB as PG_JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.types import CHAR, String, TypeDecorator

logger = logging.getLogger(__name__)

# JSONB on PostgreSQL (unchanged DDL in existing migrations), plain JSON on
# other dialects (the in-memory SQLite used by tests).
JSONB = JSON().with_variant(PG_JSONB(), 'postgresql')


class UUID(TypeDecorator):
    """
    Platform-independent UUID column.

    Native UUID on PostgreSQL (same DDL as before), CHAR(36) elsewhere.
    Coerces bind params, so callers may pass either uuid.UUID objects or
    strings (JWT identities and URL path params arrive as strings throughout
    the app) on every dialect.
    """
    impl = CHAR
    cache_ok = True

    def __init__(self, as_uuid=True):
        super().__init__(length=36)
        self.as_uuid = as_uuid

    def load_dialect_impl(self, dialect):
        if dialect.name == 'postgresql':
            return dialect.type_descriptor(PG_UUID(as_uuid=self.as_uuid))
        return dialect.type_descriptor(CHAR(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if not isinstance(value, _uuid.UUID):
            # Raises ValueError for malformed input, mirroring the DataError
            # PostgreSQL itself would raise for an invalid uuid literal.
            value = _uuid.UUID(str(value))
        return str(value)

    def process_result_value(self, value, dialect):
        if value is None or not self.as_uuid or isinstance(value, _uuid.UUID):
            return value
        return _uuid.UUID(value)


# Marks a value that has been encrypted at rest, so reads can tell an encrypted
# blob apart from a legacy plaintext value written before encryption was enabled.
_ENC_PREFIX = 'enc:v1:'


def _get_fernet():
    """
    Build a Fernet cipher from FIELD_ENCRYPTION_KEY, or return None when
    encryption isn't configured/available (then columns behave as plain text -
    the pre-existing behaviour, so nothing breaks without the env var).

    The env var may be any string; it's stretched to a valid 32-byte Fernet
    key via SHA-256, so operators don't have to generate a base64 key by hand.
    Read straight from the environment (not app.config) so it also works
    outside an application context, e.g. during Alembic migrations.
    """
    secret = os.getenv('FIELD_ENCRYPTION_KEY')
    if not secret:
        return None
    try:
        from cryptography.fernet import Fernet
    except ImportError:
        logger.warning(
            'FIELD_ENCRYPTION_KEY is set but the cryptography package is not '
            'installed; storing sensitive fields as plain text.'
        )
        return None
    digest = hashlib.sha256(secret.encode('utf-8')).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


class EncryptedString(TypeDecorator):
    """
    Transparently encrypts a string column at rest with Fernet (AES-128-CBC +
    HMAC) when FIELD_ENCRYPTION_KEY is configured.

    - Writes: encrypt and tag with `enc:v1:` (only when a key is configured and
      the value isn't already encrypted).
    - Reads: decrypt tagged values; pass through untagged (legacy plaintext)
      values unchanged, so enabling encryption doesn't require migrating rows.
    - No key configured: behaves exactly like a normal String column.

    Ciphertext is longer than the plaintext, so give these columns generous
    length (the underlying secrets - API keys - are short, but the base64 token
    plus prefix needs room).
    """
    impl = String
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None or value == '':
            return value
        if isinstance(value, str) and value.startswith(_ENC_PREFIX):
            return value  # already encrypted, don't double-encrypt
        fernet = _get_fernet()
        if fernet is None:
            return value  # encryption disabled -> store as-is
        token = fernet.encrypt(value.encode('utf-8')).decode('ascii')
        return f'{_ENC_PREFIX}{token}'

    def process_result_value(self, value, dialect):
        if not value or not isinstance(value, str) or not value.startswith(_ENC_PREFIX):
            return value  # legacy plaintext or empty -> return unchanged
        fernet = _get_fernet()
        if fernet is None:
            logger.error('Encrypted value found but FIELD_ENCRYPTION_KEY is unavailable; cannot decrypt.')
            return None
        try:
            from cryptography.fernet import InvalidToken
            return fernet.decrypt(value[len(_ENC_PREFIX):].encode('ascii')).decode('utf-8')
        except (InvalidToken, ValueError):
            logger.error('Failed to decrypt a stored value (wrong FIELD_ENCRYPTION_KEY?).')
            return None
