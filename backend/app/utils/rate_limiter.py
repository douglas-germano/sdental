"""
Rate limiting configuration for the application.
"""
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

# storage_uri/strategy/default_limits are intentionally left unset here -
# Limiter's constructor args take precedence over app.config, so passing
# storage_uri="memory://" would silently ignore RATELIMIT_STORAGE_URI (Redis
# in production) even when REDIS_URL is configured, letting each Gunicorn
# worker keep its own independent (and much weaker) counter. They're picked
# up from app.config (RATELIMIT_STORAGE_URI/RATELIMIT_STRATEGY/RATELIMIT_DEFAULT
# in config.py) inside init_limiter() -> limiter.init_app(app) instead.
limiter = Limiter(key_func=get_remote_address)


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
