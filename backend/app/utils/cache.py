"""
Simple caching utilities.
"""
from flask_caching import Cache

# Initialize cache
cache = Cache()


def init_cache(app):
    """Initialize cache with Flask app."""
    cache_config = {
        'CACHE_TYPE': app.config.get('CACHE_TYPE', 'simple'),
        'CACHE_DEFAULT_TIMEOUT': app.config.get('CACHE_DEFAULT_TIMEOUT', 300),
    }

    # Use Redis in production if configured
    redis_url = app.config.get('REDIS_URL')
    if redis_url:
        cache_config['CACHE_TYPE'] = 'redis'
        cache_config['CACHE_REDIS_URL'] = redis_url

    app.config.from_mapping(cache_config)
    cache.init_app(app)


def get_clinic_cache_key(clinic_id: str, suffix: str = '') -> str:
    """Generate a cache key for clinic-specific data."""
    return f"clinic:{clinic_id}:{suffix}" if suffix else f"clinic:{clinic_id}"


def invalidate_clinic_cache(clinic_id: str):
    """Invalidate all cache entries for a clinic."""
    # With simple cache, we need to delete specific keys
    # In production with Redis, we could use pattern matching
    keys_to_delete = [
        get_clinic_cache_key(clinic_id, 'settings'),
        get_clinic_cache_key(clinic_id, 'services'),
        get_clinic_cache_key(clinic_id, 'business_hours'),
    ]
    for key in keys_to_delete:
        cache.delete(key)
