"""
Tests for authentication endpoints.
"""
import pytest


class TestRegister:
    """Tests for POST /api/auth/register"""

    def test_register_success(self, client):
        """Test successful clinic registration."""
        response = client.post('/api/auth/register', json={
            'name': 'New Clinic',
            'email': 'new@clinic.com',
            'phone': '5511777777777',
            'password': 'SecurePass123'
        })

        assert response.status_code == 201
        data = response.get_json()
        assert 'access_token' in data
        assert 'refresh_token' in data
        assert data['clinic']['name'] == 'New Clinic'

    def test_register_missing_fields(self, client):
        """Test registration with missing required fields."""
        response = client.post('/api/auth/register', json={
            'name': 'New Clinic'
        })

        assert response.status_code == 400

    def test_register_invalid_email(self, client):
        """Test registration with invalid email format."""
        response = client.post('/api/auth/register', json={
            'name': 'New Clinic',
            'email': 'invalid-email',
            'phone': '5511777777777',
            'password': 'SecurePass123'
        })

        assert response.status_code == 400

    def test_register_weak_password(self, client):
        """Test registration with weak password."""
        response = client.post('/api/auth/register', json={
            'name': 'New Clinic',
            'email': 'weak@clinic.com',
            'phone': '5511777777777',
            'password': '123'
        })

        assert response.status_code == 400


class TestLogin:
    """Tests for POST /api/auth/login"""

    def test_login_success(self, client, sample_clinic):
        """Test successful login."""
        response = client.post('/api/auth/login', json={
            'email': sample_clinic.email,
            'password': 'TestPass123'
        })

        assert response.status_code == 200
        data = response.get_json()
        assert 'access_token' in data
        assert 'refresh_token' in data

    def test_login_invalid_password(self, client, sample_clinic):
        """Test login with invalid password."""
        response = client.post('/api/auth/login', json={
            'email': sample_clinic.email,
            'password': 'WrongPassword123'
        })

        assert response.status_code == 401

    def test_login_missing_credentials(self, client):
        """Test login with missing credentials."""
        response = client.post('/api/auth/login', json={})

        assert response.status_code == 400


class TestMe:
    """Tests for GET /api/auth/me"""

    def test_me_authenticated(self, client, auth_headers, sample_clinic):
        """Test getting current clinic info when authenticated."""
        response = client.get('/api/auth/me', headers=auth_headers)

        assert response.status_code == 200
        data = response.get_json()
        assert data['email'] == sample_clinic.email

    def test_me_unauthenticated(self, client):
        """Test getting current clinic info without authentication."""
        response = client.get('/api/auth/me')

        assert response.status_code == 401
