from functools import wraps
from typing import Callable
from flask import jsonify
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity

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
