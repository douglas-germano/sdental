"""
Tests for health check endpoints.
"""
import pytest


class TestHealthCheck:
    """Tests for health check endpoints."""

    def test_health_basic(self, client):
        """Test basic health check."""
        response = client.get('/api/health')

        assert response.status_code == 200
        data = response.get_json()
        assert data['status'] == 'healthy'
        assert 'timestamp' in data

    def test_health_ready(self, client):
        """Test readiness check."""
        response = client.get('/api/health/ready')

        assert response.status_code == 200
        data = response.get_json()
        assert 'status' in data
        assert 'checks' in data
        assert 'database' in data['checks']

    def test_health_live(self, client):
        """Test liveness check."""
        response = client.get('/api/health/live')

        assert response.status_code == 200
        data = response.get_json()
        assert data['status'] == 'alive'
