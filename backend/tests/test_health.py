"""
Tests for health check endpoints.
"""
import pytest
from unittest.mock import patch
from redis.exceptions import AuthenticationError

from app.utils.rate_limiter import limiter


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

    @pytest.mark.parametrize('path', ['/api/health', '/api/health/live', '/api/health/ready'])
    def test_health_does_not_access_rate_limit_storage(self, client, path):
        with patch.object(limiter.storage, 'incr', side_effect=AuthenticationError('bad test credentials')) as increment:
            assert client.get(path).status_code == 200
            increment.assert_not_called()

    def test_readiness_still_reports_database_failure(self, client):
        with patch('app.routes.health.check_database', return_value={'healthy': False, 'message': 'Database connection failed'}):
            response = client.get('/api/health/ready')
        assert response.status_code == 503
        assert response.get_json()['status'] == 'not_ready'

    def test_other_routes_still_use_rate_limit_storage(self, client):
        with patch.object(limiter.storage, 'incr', side_effect=AuthenticationError('bad test credentials')) as increment:
            response = client.post('/api/auth/login', json={})
            assert response.status_code == 500
            increment.assert_called()
