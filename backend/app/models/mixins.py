"""
Model mixins for common functionality.
"""
from datetime import datetime
from sqlalchemy import event
from sqlalchemy.orm import Query

from app import db


class SoftDeleteMixin:
    """
    Mixin that adds soft delete functionality to a model.

    Adds a deleted_at column and modifies delete behavior.
    """
    deleted_at = db.Column(db.DateTime, nullable=True, index=True)

    @property
    def is_deleted(self) -> bool:
        """Check if the record is soft deleted."""
        return self.deleted_at is not None

    def soft_delete(self) -> None:
        """Soft delete the record."""
        self.deleted_at = datetime.utcnow()

    def restore(self) -> None:
        """Restore a soft deleted record."""
        self.deleted_at = None


class SoftDeleteQuery(Query):
    """
    Custom query class that filters out soft deleted records by default.
    """

    def __new__(cls, *args, **kwargs):
        obj = super().__new__(cls)
        obj._with_deleted = kwargs.pop('_with_deleted', False)
        return obj

    def __init__(self, *args, **kwargs):
        kwargs.pop('_with_deleted', None)
        super().__init__(*args, **kwargs)

    def with_deleted(self):
        """Include soft deleted records in the query."""
        return self.__class__(
            self._raw_columns,
            session=self.session,
            _with_deleted=True
        )

    def _execute_clauseelement(self):
        """Filter out deleted records unless with_deleted is set."""
        if not self._with_deleted:
            for mapper in self._mappers_from_spec(self.column_descriptions):
                if hasattr(mapper.class_, 'deleted_at'):
                    self = self.filter(mapper.class_.deleted_at.is_(None))
        return super()._execute_clauseelement()


class TimestampMixin:
    """
    Mixin that adds created_at and updated_at timestamps.
    """
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(
        db.DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False
    )
