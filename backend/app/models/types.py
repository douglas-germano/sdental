"""
Portable column types.

Production runs on PostgreSQL, but the test suite runs on in-memory SQLite
(see TestingConfig), so PostgreSQL-only types need a cross-dialect fallback.
"""
import uuid as _uuid

from sqlalchemy import JSON
from sqlalchemy.dialects.postgresql import JSONB as PG_JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.types import CHAR, TypeDecorator

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
