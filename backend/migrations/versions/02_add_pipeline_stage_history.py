"""add pipeline stage history table

Revision ID: 02_pipeline_history
Revises: 01cfd18a3e9e
Create Date: 2026-01-29 15:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision = '02_pipeline_history'
down_revision = '01cfd18a3e9e'
branch_labels = None
depends_on = None


def upgrade():
    # Create pipeline_stage_history table
    op.create_table(
        'pipeline_stage_history',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('patient_id', UUID(as_uuid=True), nullable=False),
        sa.Column('clinic_id', UUID(as_uuid=True), nullable=False),
        sa.Column('from_stage_id', UUID(as_uuid=True), nullable=True),
        sa.Column('to_stage_id', UUID(as_uuid=True), nullable=False),
        sa.Column('changed_by', UUID(as_uuid=True), nullable=True),
        sa.Column('changed_at', sa.DateTime, nullable=False),
    )

    # Create foreign keys
    op.create_foreign_key(
        'fk_pipeline_stage_history_patient',
        'pipeline_stage_history', 'patients',
        ['patient_id'], ['id']
    )

    op.create_foreign_key(
        'fk_pipeline_stage_history_clinic',
        'pipeline_stage_history', 'clinics',
        ['clinic_id'], ['id']
    )

    op.create_foreign_key(
        'fk_pipeline_stage_history_from_stage',
        'pipeline_stage_history', 'pipeline_stages',
        ['from_stage_id'], ['id']
    )

    op.create_foreign_key(
        'fk_pipeline_stage_history_to_stage',
        'pipeline_stage_history', 'pipeline_stages',
        ['to_stage_id'], ['id']
    )

    # Create indexes for better performance
    op.create_index(
        'ix_pipeline_stage_history_patient_id',
        'pipeline_stage_history',
        ['patient_id']
    )

    op.create_index(
        'ix_pipeline_stage_history_clinic_id',
        'pipeline_stage_history',
        ['clinic_id']
    )

    op.create_index(
        'ix_pipeline_stage_history_changed_at',
        'pipeline_stage_history',
        ['changed_at']
    )


def downgrade():
    # Drop indexes
    op.drop_index('ix_pipeline_stage_history_changed_at', table_name='pipeline_stage_history')
    op.drop_index('ix_pipeline_stage_history_clinic_id', table_name='pipeline_stage_history')
    op.drop_index('ix_pipeline_stage_history_patient_id', table_name='pipeline_stage_history')

    # Drop foreign keys
    op.drop_constraint('fk_pipeline_stage_history_to_stage', 'pipeline_stage_history', type_='foreignkey')
    op.drop_constraint('fk_pipeline_stage_history_from_stage', 'pipeline_stage_history', type_='foreignkey')
    op.drop_constraint('fk_pipeline_stage_history_clinic', 'pipeline_stage_history', type_='foreignkey')
    op.drop_constraint('fk_pipeline_stage_history_patient', 'pipeline_stage_history', type_='foreignkey')

    # Drop table
    op.drop_table('pipeline_stage_history')
