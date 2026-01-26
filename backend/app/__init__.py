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

    # Register blueprints
    from .routes import auth, clinics, patients, appointments, conversations, webhook, analytics

    app.register_blueprint(auth.bp)
    app.register_blueprint(clinics.bp)
    app.register_blueprint(patients.bp)
    app.register_blueprint(appointments.bp)
    app.register_blueprint(conversations.bp)
    app.register_blueprint(webhook.bp)

    app.register_blueprint(analytics.bp)
    from .routes import agents
    app.register_blueprint(agents.bp)

    # Health check endpoint
    @app.route('/health')
    def health():
        return {'status': 'healthy'}

    return app
