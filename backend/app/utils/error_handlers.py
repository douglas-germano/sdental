"""
Global error handlers for the Flask application.
"""
import logging
from flask import jsonify
from werkzeug.exceptions import HTTPException

from .exceptions import AppError

logger = logging.getLogger(__name__)


def register_error_handlers(app):
    """Register all error handlers with the Flask app."""

    @app.errorhandler(AppError)
    def handle_app_error(error):
        """Handle custom application errors."""
        logger.warning(
            'app_error',
            extra={
                'error_type': error.__class__.__name__,
                'message': error.message,
                'status_code': error.status_code
            }
        )
        response = jsonify(error.to_dict())
        response.status_code = error.status_code
        return response

    @app.errorhandler(HTTPException)
    def handle_http_exception(error):
        """Handle Werkzeug HTTP exceptions."""
        logger.warning(
            'http_error',
            extra={
                'status_code': error.code,
                'description': error.description
            }
        )
        response = jsonify({'error': error.description})
        response.status_code = error.code
        return response

    @app.errorhandler(Exception)
    def handle_generic_exception(error):
        """Handle unexpected exceptions."""
        logger.exception('unexpected_error: %s', str(error))
        response = jsonify({'error': 'Internal server error'})
        response.status_code = 500
        return response
