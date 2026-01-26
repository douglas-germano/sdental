"""
Pagination utilities for consistent API responses.
"""
from typing import Callable, Any
from flask import request


def paginate(
    query,
    page: int = None,
    per_page: int = None,
    max_per_page: int = 100,
    serializer: Callable = None
) -> dict:
    """
    Paginate a SQLAlchemy query and return a standardized response.

    Args:
        query: SQLAlchemy query object
        page: Page number (1-indexed). Defaults to request param or 1.
        per_page: Items per page. Defaults to request param or 20.
        max_per_page: Maximum allowed items per page.
        serializer: Optional function to serialize items. Defaults to to_dict().

    Returns:
        Dictionary with items, total, pages, current_page, has_next, has_prev
    """
    if page is None:
        page = request.args.get('page', 1, type=int)
    if per_page is None:
        per_page = request.args.get('per_page', 20, type=int)

    # Enforce limits
    page = max(1, page)
    per_page = min(max(1, per_page), max_per_page)

    # Execute pagination
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    # Serialize items
    if serializer:
        items = [serializer(item) for item in pagination.items]
    else:
        items = [item.to_dict() if hasattr(item, 'to_dict') else item for item in pagination.items]

    return {
        'items': items,
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': page,
        'per_page': per_page,
        'has_next': pagination.has_next,
        'has_prev': pagination.has_prev
    }


def get_pagination_params() -> tuple[int, int]:
    """
    Get pagination parameters from request.

    Returns:
        Tuple of (page, per_page)
    """
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)

    # Enforce limits
    page = max(1, page)
    per_page = min(max(1, per_page), 100)

    return page, per_page
