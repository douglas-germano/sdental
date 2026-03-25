import os
import logging
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


class Config:
    """Base configuration."""
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret-key-change-in-production')

    # Database
    SQLALCHEMY_DATABASE_URI = os.getenv(
        'DATABASE_URL',
        'postgresql://postgres:postgres@localhost:5432/chatbot_clinicas'
    )
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,
        "pool_recycle": 300,
        "pool_size": 10,
        "max_overflow": 20,
    }
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # JWT
    JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY', 'jwt-secret-key-change-in-production')
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=24)
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=30)

    # Claude API
    CLAUDE_API_KEY = os.getenv('CLAUDE_API_KEY')
    CLAUDE_MODEL = os.getenv('CLAUDE_MODEL', 'claude-sonnet-4-20250514')

    # Evolution API (default - can be overridden per clinic)
    EVOLUTION_API_URL = os.getenv('EVOLUTION_API_URL')
    EVOLUTION_API_KEY = os.getenv('EVOLUTION_API_KEY')

    # Webhook authentication
    WEBHOOK_SECRET = os.getenv('WEBHOOK_SECRET')

    # Base URL for webhook configuration
    BASE_URL = os.getenv('BASE_URL')

    # CORS - Allowed origins (comma-separated)
    ALLOWED_ORIGINS = [
        origin.strip()
        for origin in os.getenv('ALLOWED_ORIGINS', 'http://localhost:3000').split(',')
        if origin.strip()
    ]

    # Rate limiting
    RATELIMIT_STORAGE_URI = os.getenv('REDIS_URL', 'memory://')
    RATELIMIT_STRATEGY = 'fixed-window'
    RATELIMIT_DEFAULT = "200 per day;50 per hour"

    # Cache
    CACHE_TYPE = os.getenv('CACHE_TYPE', 'simple')
    CACHE_DEFAULT_TIMEOUT = 300
    REDIS_URL = os.getenv('REDIS_URL')

    # Sentry (optional)
    SENTRY_DSN = os.getenv('SENTRY_DSN')


class DevelopmentConfig(Config):
    """Development configuration."""
    DEBUG = True


class ProductionConfig(Config):
    """Production configuration."""
    DEBUG = False


class TestingConfig(Config):
    """Testing configuration."""
    TESTING = True
    SQLALCHEMY_DATABASE_URI = os.getenv(
        'TEST_DATABASE_URL',
        'postgresql://localhost:5432/sdental_test'
    )


config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
}


def validate_config(app):
    """Validate critical configuration on startup. Fail-fast in production."""
    errors = []
    warnings = []

    # Skip validation in testing
    if app.config.get('TESTING'):
        return

    # Critical: secrets must be changed from defaults in production
    if app.config['SECRET_KEY'] == 'dev-secret-key-change-in-production':
        errors.append('SECRET_KEY ainda esta com o valor padrao. Defina um valor seguro.')

    if app.config['JWT_SECRET_KEY'] == 'jwt-secret-key-change-in-production':
        errors.append('JWT_SECRET_KEY ainda esta com o valor padrao. Defina um valor seguro.')

    # Recommended: services that won't work without these
    if not app.config.get('CLAUDE_API_KEY'):
        warnings.append('CLAUDE_API_KEY nao definida. Chatbot IA nao funcionara.')

    if not app.config.get('EVOLUTION_API_URL'):
        warnings.append('EVOLUTION_API_URL nao definida. Integracao WhatsApp nao funcionara.')

    if not app.config.get('EVOLUTION_API_KEY'):
        warnings.append('EVOLUTION_API_KEY nao definida. Integracao WhatsApp nao funcionara.')

    if not app.config.get('BASE_URL'):
        warnings.append('BASE_URL nao definida. Configuracao automatica de webhook nao funcionara.')

    if not app.config.get('WEBHOOK_SECRET'):
        warnings.append('WEBHOOK_SECRET nao definida. Webhooks sem autenticacao.')

    # Log warnings
    for w in warnings:
        logger.warning('CONFIG WARNING: %s', w)

    # In production, fail fast on critical errors
    if errors and os.getenv('FLASK_ENV') == 'production':
        for e in errors:
            logger.error('CONFIG ERROR: %s', e)
        raise RuntimeError(
            'Erros criticos de configuracao detectados:\n' + '\n'.join(errors)
        )
    elif errors:
        for e in errors:
            logger.warning('CONFIG WARNING (dev): %s', e)
