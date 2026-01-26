"""
Pytest fixtures and configuration.
"""
import pytest
from flask_jwt_extended import create_access_token

from app import create_app, db
from app.models import Clinic, Patient, Appointment, AppointmentStatus


@pytest.fixture(scope='session')
def app():
    """Create application for testing."""
    app = create_app('testing')
    app.config['TESTING'] = True
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
    app.config['JWT_SECRET_KEY'] = 'test-secret-key'

    with app.app_context():
        db.create_all()
        yield app
        db.drop_all()


@pytest.fixture(scope='function')
def client(app):
    """Create a test client."""
    return app.test_client()


@pytest.fixture(scope='function')
def db_session(app):
    """Create a database session for testing."""
    with app.app_context():
        connection = db.engine.connect()
        transaction = connection.begin()

        # Use a scoped session for testing
        db.session.begin_nested()

        yield db.session

        db.session.rollback()
        transaction.rollback()
        connection.close()


@pytest.fixture
def sample_clinic(app, db_session):
    """Create a sample clinic for testing."""
    with app.app_context():
        clinic = Clinic(
            name='Test Clinic',
            email='test@clinic.com',
            phone='5511999999999'
        )
        clinic.set_password('TestPass123')
        clinic.business_hours = {
            '0': {'start': '08:00', 'end': '18:00', 'active': True},
            '1': {'start': '08:00', 'end': '18:00', 'active': True},
            '2': {'start': '08:00', 'end': '18:00', 'active': True},
            '3': {'start': '08:00', 'end': '18:00', 'active': True},
            '4': {'start': '08:00', 'end': '18:00', 'active': True},
            '5': {'start': '08:00', 'end': '12:00', 'active': False},
            '6': {'start': '08:00', 'end': '12:00', 'active': False}
        }
        clinic.services = [
            {'name': 'Consulta Geral', 'duration': 30},
            {'name': 'Retorno', 'duration': 15}
        ]

        db.session.add(clinic)
        db.session.commit()

        yield clinic

        # Cleanup
        db.session.delete(clinic)
        db.session.commit()


@pytest.fixture
def auth_headers(app, sample_clinic):
    """Create authentication headers with JWT token."""
    with app.app_context():
        access_token = create_access_token(identity=str(sample_clinic.id))
        return {'Authorization': f'Bearer {access_token}'}


@pytest.fixture
def sample_patient(app, db_session, sample_clinic):
    """Create a sample patient for testing."""
    with app.app_context():
        patient = Patient(
            clinic_id=sample_clinic.id,
            name='Test Patient',
            phone='5511888888888',
            email='patient@test.com'
        )
        db.session.add(patient)
        db.session.commit()

        yield patient

        # Cleanup
        if not patient.is_deleted:
            db.session.delete(patient)
            db.session.commit()


@pytest.fixture
def sample_appointment(app, db_session, sample_clinic, sample_patient):
    """Create a sample appointment for testing."""
    from datetime import datetime, timedelta

    with app.app_context():
        appointment = Appointment(
            clinic_id=sample_clinic.id,
            patient_id=sample_patient.id,
            service_name='Consulta Geral',
            scheduled_datetime=datetime.utcnow() + timedelta(days=1),
            duration_minutes=30,
            status=AppointmentStatus.CONFIRMED
        )
        db.session.add(appointment)
        db.session.commit()

        yield appointment

        # Cleanup
        db.session.delete(appointment)
        db.session.commit()
