"""
Rate limiting configuration for the application.
"""
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

# Initialize limiter with remote address as key
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["200 per day", "50 per hour"],
    storage_uri="memory://",
    strategy="fixed-window"
)


def init_limiter(app):
    """Initialize the rate limiter with the Flask app."""
    limiter.init_app(app)

    # Configure exempt routes (health check, etc.)
    @app.after_request
    def inject_rate_limit_headers(response):
        """Inject rate limit headers into response."""
        try:
            # Add rate limit headers if available
            if hasattr(limiter, 'current_limit'):
                limit = limiter.current_limit
                if limit:
                    response.headers['X-RateLimit-Limit'] = str(limit.limit)
                    response.headers['X-RateLimit-Remaining'] = str(limit.remaining)
                    response.headers['X-RateLimit-Reset'] = str(limit.reset_at)
        except Exception:
            pass
        return response
