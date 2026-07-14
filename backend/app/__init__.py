import os
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_sqlalchemy.query import Query
from flask_migrate import Migrate
from flask_jwt_extended import JWTManager
from flask_cors import CORS

from .config import config


class SoftDeleteQuery(Query):
    """
    Query class registered on all models. Soft-deleted rows are hidden
    globally by the `do_orm_execute` listener in `app.models.mixins`;
    `with_deleted()` is the per-query opt-out.

    Defined here (not in models.mixins) because it must exist before `db`
    is constructed, and mixins imports `db` from this module.
    """

    def with_deleted(self):
        """Include soft-deleted records in this query."""
        return self.execution_options(include_deleted=True)


db = SQLAlchemy(query_class=SoftDeleteQuery)
migrate = Migrate()
jwt = JWTManager()


def create_app(config_name: str = None) -> Flask:
    """Application factory pattern."""
    if config_name is None:
        config_name = os.getenv('FLASK_ENV', 'development')

    app = Flask(__name__)
    app.config.from_object(config[config_name])

    from .config import validate_config
    validate_config(app)

    # Error monitoring - a solo operator finds out about 500s from Sentry,
    # not from customer complaints. No-op unless SENTRY_DSN is configured.
    if app.config.get('SENTRY_DSN'):
        import sentry_sdk
        sentry_sdk.init(
            dsn=app.config['SENTRY_DSN'],
            environment=config_name,
            send_default_pii=False,
            traces_sample_rate=float(os.getenv('SENTRY_TRACES_SAMPLE_RATE', '0')),
        )

    # Initialize extensions
    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    CORS(app, resources={r"/api/*": {"origins": app.config['ALLOWED_ORIGINS']}})

    # Initialize rate limiter
    from .utils.rate_limiter import init_limiter
    init_limiter(app)

    # Initialize cache
    from .utils.cache import init_cache
    init_cache(app)

    # Setup structured logging
    from .utils.logging_config import setup_logging
    setup_logging(app)

    # Register error handlers
    from .utils.error_handlers import register_error_handlers
    register_error_handlers(app)

    # Register blueprints
    from .routes import auth, clinics, patients, appointments, conversations, webhook, analytics, health, public

    app.register_blueprint(auth.bp)
    app.register_blueprint(clinics.bp)
    app.register_blueprint(patients.bp)
    app.register_blueprint(appointments.bp)
    app.register_blueprint(conversations.bp)
    app.register_blueprint(webhook.bp)
    app.register_blueprint(analytics.bp)
    app.register_blueprint(health.bp)
    app.register_blueprint(public.bp)

    from .routes import agents, professionals, pipeline, billing, assistant, financial, media
    app.register_blueprint(media.bp)
    app.register_blueprint(agents.bp)
    app.register_blueprint(professionals.bp)
    app.register_blueprint(pipeline.bp)
    app.register_blueprint(billing.bp)
    app.register_blueprint(assistant.bp)
    app.register_blueprint(financial.bp)

    # Initialize scheduler for background tasks (only in production or if explicitly enabled)
    if not app.config.get('TESTING', False) and os.getenv('ENABLE_SCHEDULER', 'true').lower() == 'true':
        from .scheduler import init_scheduler
        init_scheduler(app)

    return app
