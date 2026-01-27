import os
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_jwt_extended import JWTManager
from flask_cors import CORS

from .config import config

db = SQLAlchemy()
migrate = Migrate()
jwt = JWTManager()


def create_app(config_name: str = None) -> Flask:
    """Application factory pattern."""
    if config_name is None:
        config_name = os.getenv('FLASK_ENV', 'development')

    app = Flask(__name__)
    app.config.from_object(config[config_name])

    # Initialize extensions
    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    CORS(app, resources={r"/api/*": {"origins": "*"}})

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

    from .routes import agents
    app.register_blueprint(agents.bp)

    return app
