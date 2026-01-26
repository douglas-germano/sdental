"""
Health check endpoints.
"""
from datetime import datetime
from flask import Blueprint, jsonify
from sqlalchemy import text

from app import db

bp = Blueprint('health', __name__, url_prefix='/api')


@bp.route('/health', methods=['GET'])
def health_check():
    """
    Basic health check endpoint.
    Returns 200 if the service is running.
    """
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat() + 'Z'
    })


@bp.route('/health/ready', methods=['GET'])
def readiness_check():
    """
    Readiness check - verifies all dependencies are available.
    Returns 200 if ready to serve traffic, 503 otherwise.
    """
    checks = {
        'database': check_database(),
    }

    all_healthy = all(check['healthy'] for check in checks.values())

    response = {
        'status': 'ready' if all_healthy else 'not_ready',
        'timestamp': datetime.utcnow().isoformat() + 'Z',
        'checks': checks
    }

    return jsonify(response), 200 if all_healthy else 503


@bp.route('/health/live', methods=['GET'])
def liveness_check():
    """
    Liveness check - verifies the service is alive.
    Used by orchestrators to determine if the service should be restarted.
    """
    return jsonify({
        'status': 'alive',
        'timestamp': datetime.utcnow().isoformat() + 'Z'
    })


def check_database() -> dict:
    """Check database connectivity."""
    try:
        db.session.execute(text('SELECT 1'))
        return {
            'healthy': True,
            'message': 'Database connection successful'
        }
    except Exception as e:
        return {
            'healthy': False,
            'message': f'Database connection failed: {str(e)}'
        }
