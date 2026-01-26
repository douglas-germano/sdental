"""
Marshmallow schemas for request validation and serialization.
"""
from .auth import RegisterSchema, LoginSchema
from .patient import PatientCreateSchema, PatientUpdateSchema
from .appointment import AppointmentCreateSchema, AppointmentUpdateSchema
from .clinic import ClinicUpdateSchema, BusinessHoursSchema, ServiceSchema

__all__ = [
    'RegisterSchema',
    'LoginSchema',
    'PatientCreateSchema',
    'PatientUpdateSchema',
    'AppointmentCreateSchema',
    'AppointmentUpdateSchema',
    'ClinicUpdateSchema',
    'BusinessHoursSchema',
    'ServiceSchema',
]
