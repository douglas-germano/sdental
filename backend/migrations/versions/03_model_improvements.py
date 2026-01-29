"""Model improvements: indexes, soft delete, timestamps, validations

Revision ID: 03_model_improvements
Revises: 02_add_pipeline_stage_history
Create Date: 2026-01-29

This migration applies comprehensive model improvements:
- Adds composite indexes for better query performance
- Adds soft delete support to Conversation, BotTransfer, PipelineStageHistory
- Adds timestamps (created_at, updated_at) to BotTransfer via TimestampMixin
- Adds check constraints for data validation
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '03_model_improvements'
down_revision = '02_pipeline_history'
branch_labels = None
depends_on = None


def upgrade():
    # Add deleted_at column to conversations (soft delete)
    op.add_column('conversations', sa.Column('deleted_at', sa.DateTime(), nullable=True))
    op.create_index('ix_conversations_deleted_at', 'conversations', ['deleted_at'])

    # Add deleted_at column to bot_transfers (soft delete)
    op.add_column('bot_transfers', sa.Column('deleted_at', sa.DateTime(), nullable=True))
    op.create_index('ix_bot_transfers_deleted_at', 'bot_transfers', ['deleted_at'])

    # Add deleted_at column to pipeline_stage_history (soft delete)
    op.add_column('pipeline_stage_history', sa.Column('deleted_at', sa.DateTime(), nullable=True))
    op.create_index('ix_pipeline_stage_history_deleted_at', 'pipeline_stage_history', ['deleted_at'])

    # Add created_at and updated_at to bot_transfers (TimestampMixin)
    op.add_column('bot_transfers', sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')))
    op.add_column('bot_transfers', sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')))

    # ========== COMPOSITE INDEXES ==========
    # Appointments composite indexes
    op.create_index('ix_appointments_clinic_patient', 'appointments', ['clinic_id', 'patient_id'])
    op.create_index('ix_appointments_clinic_status', 'appointments', ['clinic_id', 'status'])

    # Conversations composite indexes
    op.create_index('ix_conversations_clinic_patient', 'conversations', ['clinic_id', 'patient_id'])

    # Bot transfers indexes
    op.create_index('ix_bot_transfers_conversation_id', 'bot_transfers', ['conversation_id'])
    op.create_index('ix_bot_transfers_resolved', 'bot_transfers', ['resolved'])

    # Availability slots composite indexes
    op.create_index('ix_availability_slots_clinic_day', 'availability_slots', ['clinic_id', 'day_of_week'])

    # Pipeline stage history composite indexes
    op.create_index('ix_pipeline_stage_history_patient_changed', 'pipeline_stage_history', ['patient_id', 'changed_at'])

    # ========== CHECK CONSTRAINTS ==========
    # Appointments check constraints
    op.create_check_constraint(
        'check_duration_range',
        'appointments',
        'duration_minutes > 0 AND duration_minutes <= 1440'
    )

    # Availability slots check constraints
    op.create_check_constraint(
        'check_day_of_week_range',
        'availability_slots',
        'day_of_week >= 0 AND day_of_week <= 6'
    )
    op.create_check_constraint(
        'check_slot_duration_range',
        'availability_slots',
        'slot_duration_minutes > 0 AND slot_duration_minutes <= 1440'
    )

    # Appointment reminders check constraints
    op.create_check_constraint(
        'check_attempts_range',
        'appointment_reminders',
        'attempts >= 0 AND attempts <= 10'
    )

    # Clinics check constraints
    op.create_check_constraint(
        'check_temperature_range',
        'clinics',
        'agent_temperature >= 0 AND agent_temperature <= 1'
    )


def downgrade():
    # Drop check constraints
    op.drop_constraint('check_temperature_range', 'clinics', type_='check')
    op.drop_constraint('check_attempts_range', 'appointment_reminders', type_='check')
    op.drop_constraint('check_slot_duration_range', 'availability_slots', type_='check')
    op.drop_constraint('check_day_of_week_range', 'availability_slots', type_='check')
    op.drop_constraint('check_duration_range', 'appointments', type_='check')

    # Drop composite indexes
    op.drop_index('ix_pipeline_stage_history_patient_changed', table_name='pipeline_stage_history')
    op.drop_index('ix_availability_slots_clinic_day', table_name='availability_slots')
    op.drop_index('ix_bot_transfers_resolved', table_name='bot_transfers')
    op.drop_index('ix_bot_transfers_conversation_id', table_name='bot_transfers')
    op.drop_index('ix_conversations_clinic_patient', table_name='conversations')
    op.drop_index('ix_appointments_clinic_status', table_name='appointments')
    op.drop_index('ix_appointments_clinic_patient', table_name='appointments')

    # Drop BotTransfer timestamp columns
    op.drop_column('bot_transfers', 'updated_at')
    op.drop_column('bot_transfers', 'created_at')

    # Drop soft delete columns
    op.drop_index('ix_pipeline_stage_history_deleted_at', table_name='pipeline_stage_history')
    op.drop_column('pipeline_stage_history', 'deleted_at')

    op.drop_index('ix_bot_transfers_deleted_at', table_name='bot_transfers')
    op.drop_column('bot_transfers', 'deleted_at')

    op.drop_index('ix_conversations_deleted_at', table_name='conversations')
    op.drop_column('conversations', 'deleted_at')
