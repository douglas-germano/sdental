"""
Custom exceptions for the application.
Provides consistent error handling across all routes and services.
"""


class AppError(Exception):
    """Base application error."""
    status_code = 500

    def __init__(self, message: str, status_code: int = None, payload: dict = None):
        super().__init__(message)
        self.message = message
        if status_code is not None:
            self.status_code = status_code
        self.payload = payload

    def to_dict(self) -> dict:
        rv = {'error': self.message}
        if self.payload:
            rv['details'] = self.payload
        return rv


class ValidationError(AppError):
    """Validation error (400)."""
    status_code = 400


class AuthenticationError(AppError):
    """Authentication error (401)."""
    status_code = 401


class AuthorizationError(AppError):
    """Authorization/permission error (403)."""
    status_code = 403


class NotFoundError(AppError):
    """Resource not found error (404)."""
    status_code = 404


class ConflictError(AppError):
    """Conflict error (409) - e.g., duplicate resource."""
    status_code = 409


class ServiceUnavailableError(AppError):
    """External service unavailable (503)."""
    status_code = 503


class RateLimitError(AppError):
    """Rate limit exceeded (429)."""
    status_code = 429
