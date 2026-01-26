"""
Tests for appointment endpoints.
"""
import pytest
from datetime import datetime, timedelta


class TestListAppointments:
    """Tests for GET /api/appointments"""

    def test_list_appointments_success(self, client, auth_headers, sample_appointment):
        """Test listing appointments."""
        response = client.get('/api/appointments', headers=auth_headers)

        assert response.status_code == 200
        data = response.get_json()
        assert 'appointments' in data
        assert 'total' in data

    def test_list_appointments_unauthenticated(self, client):
        """Test listing appointments without authentication."""
        response = client.get('/api/appointments')

        assert response.status_code == 401

    def test_list_appointments_with_status_filter(self, client, auth_headers, sample_appointment):
        """Test listing appointments with status filter."""
        response = client.get(
            '/api/appointments?status=confirmed',
            headers=auth_headers
        )

        assert response.status_code == 200


class TestCreateAppointment:
    """Tests for POST /api/appointments"""

    def test_create_appointment_success(self, client, auth_headers, sample_patient):
        """Test creating an appointment."""
        future_date = (datetime.utcnow() + timedelta(days=2)).isoformat()

        response = client.post('/api/appointments', headers=auth_headers, json={
            'patient_id': str(sample_patient.id),
            'service_name': 'Consulta Geral',
            'scheduled_datetime': future_date,
            'duration_minutes': 30
        })

        assert response.status_code == 201
        data = response.get_json()
        assert data['appointment']['service_name'] == 'Consulta Geral'

    def test_create_appointment_missing_fields(self, client, auth_headers):
        """Test creating an appointment with missing fields."""
        response = client.post('/api/appointments', headers=auth_headers, json={
            'service_name': 'Consulta Geral'
        })

        assert response.status_code == 400

    def test_create_appointment_invalid_patient(self, client, auth_headers):
        """Test creating an appointment with invalid patient."""
        future_date = (datetime.utcnow() + timedelta(days=2)).isoformat()

        response = client.post('/api/appointments', headers=auth_headers, json={
            'patient_id': '00000000-0000-0000-0000-000000000000',
            'service_name': 'Consulta Geral',
            'scheduled_datetime': future_date
        })

        assert response.status_code == 404


class TestUpdateAppointment:
    """Tests for PUT /api/appointments/<id>"""

    def test_update_appointment_status(self, client, auth_headers, sample_appointment):
        """Test updating appointment status."""
        response = client.put(
            f'/api/appointments/{sample_appointment.id}',
            headers=auth_headers,
            json={'status': 'completed'}
        )

        assert response.status_code == 200
        data = response.get_json()
        assert data['appointment']['status'] == 'completed'

    def test_update_appointment_not_found(self, client, auth_headers):
        """Test updating a non-existent appointment."""
        response = client.put(
            '/api/appointments/00000000-0000-0000-0000-000000000000',
            headers=auth_headers,
            json={'status': 'completed'}
        )

        assert response.status_code == 404


class TestCancelAppointment:
    """Tests for DELETE /api/appointments/<id>"""

    def test_cancel_appointment_success(self, client, auth_headers, sample_appointment):
        """Test cancelling an appointment."""
        response = client.delete(
            f'/api/appointments/{sample_appointment.id}',
            headers=auth_headers
        )

        assert response.status_code == 200

    def test_cancel_appointment_not_found(self, client, auth_headers):
        """Test cancelling a non-existent appointment."""
        response = client.delete(
            '/api/appointments/00000000-0000-0000-0000-000000000000',
            headers=auth_headers
        )

        assert response.status_code == 404


class TestAvailability:
    """Tests for GET /api/appointments/availability"""

    def test_get_availability_success(self, client, auth_headers):
        """Test getting available slots."""
        future_date = (datetime.utcnow() + timedelta(days=1)).strftime('%Y-%m-%d')

        response = client.get(
            f'/api/appointments/availability?date={future_date}',
            headers=auth_headers
        )

        assert response.status_code == 200
        data = response.get_json()
        assert 'slots' in data

    def test_get_availability_missing_date(self, client, auth_headers):
        """Test getting availability without date."""
        response = client.get(
            '/api/appointments/availability',
            headers=auth_headers
        )

        assert response.status_code == 400
