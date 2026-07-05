from functools import wraps
from typing import Callable
from flask import jsonify
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity
from flask_jwt_extended.exceptions import JWTExtendedException
from jwt.exceptions import PyJWTError

from app.models import Clinic


def get_current_clinic() -> Clinic:
    """Get the current authenticated clinic from JWT."""
    clinic_id = get_jwt_identity()
    return Clinic.query.get(clinic_id)


def clinic_required(fn: Callable) -> Callable:
    """
    Decorator that requires a valid JWT and returns the clinic.
    Adds 'current_clinic' to the function's kwargs.
    """
    @wraps(fn)
    def wrapper(*args, **kwargs):
        verify_jwt_in_request()
        clinic = get_current_clinic()
        if not clinic:
            return jsonify({'error': 'Clinic not found'}), 404
        if not clinic.active:
            return jsonify({'error': 'Clinic account is inactive'}), 403
        kwargs['current_clinic'] = clinic
        return fn(*args, **kwargs)
    return wrapper


def clinic_required_any_status(fn: Callable) -> Callable:
    """
    Like clinic_required, but does NOT reject inactive clinics.
    Only for endpoints an inactive (e.g. unpaid) clinic must still be able to
    reach - today that's just the billing status endpoint, so it can show
    the clinic why it's locked out and where to pay.
    """
    @wraps(fn)
    def wrapper(*args, **kwargs):
        verify_jwt_in_request()
        clinic = get_current_clinic()
        if not clinic:
            return jsonify({'error': 'Clinic not found'}), 404
        kwargs['current_clinic'] = clinic
        return fn(*args, **kwargs)
    return wrapper


def clinic_required_stream(fn: Callable) -> Callable:
    """
    Like clinic_required, but also accepts the JWT via a `?token=` query
    param (as `JWT_QUERY_STRING_NAME`). Needed for endpoints consumed by the
    browser's EventSource API, which cannot set custom request headers.
    """
    @wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            verify_jwt_in_request(locations=['headers'])
        except (JWTExtendedException, PyJWTError):
            verify_jwt_in_request(locations=['query_string'])
        clinic = get_current_clinic()
        if not clinic:
            return jsonify({'error': 'Clinic not found'}), 404
        if not clinic.active:
            return jsonify({'error': 'Clinic account is inactive'}), 403
        kwargs['current_clinic'] = clinic
        return fn(*args, **kwargs)
    return wrapper
