"""Create the current schema only for a completely empty database.

The legacy migration history starts by altering existing tables. New installs
therefore use SQLAlchemy metadata and stamp that schema at the current head.
Existing databases continue through the normal Alembic upgrade path.
"""
import os
from pathlib import Path

from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import inspect, text


def bootstrap_empty_database(engine, metadata, script):
    """Create and stamp atomically; return False if the database already exists."""
    # Validate the migration graph before touching the database.
    head = script.get_current_head()
    if head is None:
        raise RuntimeError('No migration head found; refusing to initialize database.')
    if not metadata.tables:
        raise RuntimeError('No models loaded; refusing to initialize database.')

    with engine.begin() as connection:
        if connection.dialect.name == 'postgresql':
            # Serialize concurrent first deployments; released at transaction end.
            connection.execute(text('SELECT pg_advisory_xact_lock(734802190)'))
        context = MigrationContext.configure(connection)
        existing_tables = set(inspect(connection).get_table_names())
        if existing_tables - {'alembic_version'} or context.get_current_heads():
            return False

        metadata.create_all(connection)
        context.stamp(script, head)
        return True


def main():
    # Database preparation must not start any background jobs.
    os.environ['ENABLE_SCHEDULER'] = 'false'
    from app import create_app, db
    from app import models  # noqa: F401 - register the complete model metadata

    app = create_app()
    config = Config()
    config.set_main_option('script_location', str(Path(__file__).parent / 'migrations'))
    script = ScriptDirectory.from_config(config)
    with app.app_context():
        if bootstrap_empty_database(db.engine, db.metadata, script):
            print('Empty database initialized and stamped at migration head.', flush=True)
        else:
            print('Existing database detected; applying normal migrations.', flush=True)


if __name__ == '__main__':
    main()
