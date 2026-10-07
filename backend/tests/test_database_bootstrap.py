"""Regression checks for fresh installs and protection of existing schemas."""
from pathlib import Path

import pytest
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import Column, Integer, MetaData, Table, create_engine, inspect, text

from bootstrap_database import bootstrap_empty_database


@pytest.fixture
def script():
    config = Config()
    config.set_main_option('script_location', str(Path(__file__).parents[1] / 'migrations'))
    return ScriptDirectory.from_config(config)


@pytest.fixture
def database():
    engine = create_engine('sqlite://')
    metadata = MetaData()
    Table('clinics', metadata, Column('id', Integer, primary_key=True))
    yield engine, metadata
    engine.dispose()


def test_empty_database_is_created_and_stamped(database, script):
    engine, metadata = database
    assert bootstrap_empty_database(engine, metadata, script)
    assert set(inspect(engine).get_table_names()) == {'clinics', 'alembic_version'}
    with engine.connect() as connection:
        assert MigrationContext.configure(connection).get_current_heads() == (script.get_current_head(),)


def test_restart_preserves_existing_data_and_version(database, script):
    engine, metadata = database
    bootstrap_empty_database(engine, metadata, script)
    with engine.begin() as connection:
        connection.execute(text('INSERT INTO clinics (id) VALUES (42)'))
    assert not bootstrap_empty_database(engine, metadata, script)
    with engine.connect() as connection:
        assert connection.execute(text('SELECT id FROM clinics')).scalar_one() == 42
        assert MigrationContext.configure(connection).get_current_heads() == (script.get_current_head(),)


def test_unversioned_existing_schema_is_not_stamped(database, script):
    engine, metadata = database
    with engine.begin() as connection:
        connection.execute(text('CREATE TABLE legacy_data (id INTEGER)'))
        connection.execute(text('INSERT INTO legacy_data VALUES (7)'))
    assert not bootstrap_empty_database(engine, metadata, script)
    assert inspect(engine).get_table_names() == ['legacy_data']
    with engine.connect() as connection:
        assert connection.execute(text('SELECT id FROM legacy_data')).scalar_one() == 7


def test_empty_version_table_from_failed_migration_can_be_initialized(database, script):
    engine, metadata = database
    with engine.begin() as connection:
        connection.execute(text('CREATE TABLE alembic_version (version_num VARCHAR(32) PRIMARY KEY)'))
    assert bootstrap_empty_database(engine, metadata, script)
    assert 'clinics' in inspect(engine).get_table_names()


def test_existing_revision_is_not_overwritten(database, script):
    engine, metadata = database
    with engine.begin() as connection:
        context = MigrationContext.configure(connection)
        context.stamp(script, '6d19eebd5915')
    assert not bootstrap_empty_database(engine, metadata, script)
    with engine.connect() as connection:
        assert MigrationContext.configure(connection).get_current_heads() == ('6d19eebd5915',)
    assert 'clinics' not in inspect(engine).get_table_names()


def test_missing_metadata_does_not_stamp(database, script):
    engine, _ = database
    with pytest.raises(RuntimeError, match='No models loaded'):
        bootstrap_empty_database(engine, MetaData(), script)
    assert not inspect(engine).get_table_names()
