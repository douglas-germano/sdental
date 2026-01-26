"""
Tests for patient endpoints.
"""
import pytest


class TestListPatients:
    """Tests for GET /api/patients"""

    def test_list_patients_success(self, client, auth_headers, sample_patient):
        """Test listing patients."""
        response = client.get('/api/patients', headers=auth_headers)

        assert response.status_code == 200
        data = response.get_json()
        assert 'patients' in data
        assert 'total' in data
        assert len(data['patients']) >= 1

    def test_list_patients_unauthenticated(self, client):
        """Test listing patients without authentication."""
        response = client.get('/api/patients')

        assert response.status_code == 401

    def test_list_patients_with_search(self, client, auth_headers, sample_patient):
        """Test listing patients with search filter."""
        response = client.get(
            f'/api/patients?search={sample_patient.name}',
            headers=auth_headers
        )

        assert response.status_code == 200
        data = response.get_json()
        assert len(data['patients']) >= 1


class TestCreatePatient:
    """Tests for POST /api/patients"""

    def test_create_patient_success(self, client, auth_headers):
        """Test creating a patient."""
        response = client.post('/api/patients', headers=auth_headers, json={
            'name': 'New Patient',
            'phone': '5511666666666',
            'email': 'newpatient@test.com'
        })

        assert response.status_code == 201
        data = response.get_json()
        assert data['patient']['name'] == 'New Patient'

    def test_create_patient_missing_fields(self, client, auth_headers):
        """Test creating a patient with missing fields."""
        response = client.post('/api/patients', headers=auth_headers, json={
            'name': 'Incomplete Patient'
        })

        assert response.status_code == 400

    def test_create_patient_duplicate_phone(self, client, auth_headers, sample_patient):
        """Test creating a patient with duplicate phone."""
        response = client.post('/api/patients', headers=auth_headers, json={
            'name': 'Duplicate Patient',
            'phone': sample_patient.phone
        })

        assert response.status_code == 409


class TestUpdatePatient:
    """Tests for PUT /api/patients/<id>"""

    def test_update_patient_success(self, client, auth_headers, sample_patient):
        """Test updating a patient."""
        response = client.put(
            f'/api/patients/{sample_patient.id}',
            headers=auth_headers,
            json={'name': 'Updated Name'}
        )

        assert response.status_code == 200
        data = response.get_json()
        assert data['patient']['name'] == 'Updated Name'

    def test_update_patient_not_found(self, client, auth_headers):
        """Test updating a non-existent patient."""
        response = client.put(
            '/api/patients/00000000-0000-0000-0000-000000000000',
            headers=auth_headers,
            json={'name': 'Updated Name'}
        )

        assert response.status_code == 404


class TestDeletePatient:
    """Tests for DELETE /api/patients/<id>"""

    def test_delete_patient_success(self, client, auth_headers, sample_patient):
        """Test soft deleting a patient."""
        response = client.delete(
            f'/api/patients/{sample_patient.id}',
            headers=auth_headers
        )

        assert response.status_code == 200

        # Verify patient is soft deleted (not visible in list)
        list_response = client.get('/api/patients', headers=auth_headers)
        patients = list_response.get_json()['patients']
        patient_ids = [p['id'] for p in patients]
        assert str(sample_patient.id) not in patient_ids

    def test_delete_patient_not_found(self, client, auth_headers):
        """Test deleting a non-existent patient."""
        response = client.delete(
            '/api/patients/00000000-0000-0000-0000-000000000000',
            headers=auth_headers
        )

        assert response.status_code == 404


class TestRestorePatient:
    """Tests for POST /api/patients/<id>/restore"""

    def test_restore_patient_success(self, client, auth_headers, sample_patient):
        """Test restoring a soft-deleted patient."""
        # First, delete the patient
        client.delete(f'/api/patients/{sample_patient.id}', headers=auth_headers)

        # Then restore
        response = client.post(
            f'/api/patients/{sample_patient.id}/restore',
            headers=auth_headers
        )

        assert response.status_code == 200
        data = response.get_json()
        assert data['patient']['deleted_at'] is None
