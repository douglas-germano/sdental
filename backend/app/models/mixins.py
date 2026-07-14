"""
Model mixins for common functionality.
"""
from sqlalchemy import event
from sqlalchemy.orm import Session, with_loader_criteria

from app.utils.datetime_utils import utcnow
from app import db, SoftDeleteQuery  # noqa: F401  (re-exported for callers)


class SoftDeleteMixin:
    """
    Mixin that adds soft delete functionality to a model.

    Adds a deleted_at column and modifies delete behavior. Rows where
    deleted_at is set are hidden from every ORM SELECT by the
    `_apply_soft_delete_filter` listener below; use
    `Model.query.with_deleted()` to include them.
    """
    deleted_at = db.Column(db.DateTime, nullable=True, index=True)

    @property
    def is_deleted(self) -> bool:
        """Check if the record is soft deleted."""
        return self.deleted_at is not None

    def soft_delete(self) -> None:
        """Soft delete the record."""
        self.deleted_at = utcnow()

    def restore(self) -> None:
        """Restore a soft deleted record."""
        self.deleted_at = None


@event.listens_for(Session, 'do_orm_execute')
def _apply_soft_delete_filter(execute_state):
    """
    Hide soft-deleted rows from every ORM SELECT by default.

    Adds `deleted_at IS NULL` for every mapped class that uses
    SoftDeleteMixin, including joined/aliased entities. Opt out per query
    with `Model.query.with_deleted()` (or the `include_deleted` execution
    option on 2.0-style statements).

    Column refreshes and lazy relationship loads are exempt (standard
    SQLAlchemy recipe) so already-loaded objects can still traverse their
    full object graph - e.g. rendering a conversation whose patient was
    later soft-deleted.
    """
    if (
        execute_state.is_select
        and not execute_state.is_column_load
        and not execute_state.is_relationship_load
        and not execute_state.execution_options.get('include_deleted', False)
    ):
        execute_state.statement = execute_state.statement.options(
            with_loader_criteria(
                SoftDeleteMixin,
                lambda cls: cls.deleted_at.is_(None),
                include_aliases=True,
            )
        )


class TimestampMixin:
    """
    Mixin that adds created_at and updated_at timestamps.
    """
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)
    updated_at = db.Column(
        db.DateTime,
        default=utcnow,
        onupdate=utcnow,
        nullable=False
    )
