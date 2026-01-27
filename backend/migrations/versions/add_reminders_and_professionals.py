"""Add reminders table and professional support

Revision ID: add_reminders_professionals
Revises: add_soft_delete
Create Date: 2026-01-27

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'add_reminders_professionals'
down_revision = 'add_soft_delete'
branch_labels = None
depends_on = None


def upgrade():
    # =====================================================
    # PHASE 2: Reminders
    # =====================================================

    # Create appointment_reminders table
    op.create_table(
        'appointment_reminders',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('appointment_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('reminder_type', sa.String(20), nullable=False),
        sa.Column('scheduled_for', sa.DateTime(), nullable=False),
        sa.Column('sent_at', sa.DateTime(), nullable=True),
        sa.Column('status', sa.String(20), server_default='pending'),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('attempts', sa.Integer(), server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['appointment_id'], ['appointments.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )

    # Create indexes for appointment_reminders
    op.create_index('ix_appointment_reminders_appointment_id', 'appointment_reminders', ['appointment_id'])
    op.create_index('ix_appointment_reminders_status', 'appointment_reminders', ['status'])
    op.create_index('ix_appointment_reminders_scheduled_for', 'appointment_reminders', ['scheduled_for'])

    # Add reminder configuration columns to clinics
    op.add_column('clinics', sa.Column('reminders_enabled', sa.Boolean(), server_default='true'))
    op.add_column('clinics', sa.Column('reminder_24h_enabled', sa.Boolean(), server_default='true'))
    op.add_column('clinics', sa.Column('reminder_1h_enabled', sa.Boolean(), server_default='true'))
    op.add_column('clinics', sa.Column('reminder_24h_message', sa.Text(), nullable=True))
    op.add_column('clinics', sa.Column('reminder_1h_message', sa.Text(), nullable=True))

    # =====================================================
    # PHASE 3: Multiple Professionals
    # =====================================================

    # Create professionals table
    op.create_table(
        'professionals',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('clinic_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('email', sa.String(255), nullable=True),
        sa.Column('phone', sa.String(20), nullable=True),
        sa.Column('specialty', sa.String(100), nullable=True),
        sa.Column('color', sa.String(7), nullable=True),
        sa.Column('active', sa.Boolean(), server_default='true'),
        sa.Column('is_default', sa.Boolean(), server_default='false'),
        sa.Column('business_hours', postgresql.JSONB(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['clinic_id'], ['clinics.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )

    # Create indexes for professionals
    op.create_index('ix_professionals_clinic_id', 'professionals', ['clinic_id'])
    op.create_index('ix_professionals_active', 'professionals', ['active'])

    # Add professional_id to appointments (nullable for backwards compatibility)
    op.add_column('appointments', sa.Column('professional_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        'fk_appointments_professional',
        'appointments', 'professionals',
        ['professional_id'], ['id'],
        ondelete='SET NULL'
    )
    op.create_index('ix_appointments_professional_id', 'appointments', ['professional_id'])

    # Add professional_id to availability_slots (nullable for backwards compatibility)
    op.add_column('availability_slots', sa.Column('professional_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        'fk_availability_slots_professional',
        'availability_slots', 'professionals',
        ['professional_id'], ['id'],
        ondelete='SET NULL'
    )
    op.create_index('ix_availability_slots_professional_id', 'availability_slots', ['professional_id'])


def downgrade():
    # =====================================================
    # Revert PHASE 3: Multiple Professionals
    # =====================================================

    # Remove professional_id from availability_slots
    op.drop_index('ix_availability_slots_professional_id', table_name='availability_slots')
    op.drop_constraint('fk_availability_slots_professional', 'availability_slots', type_='foreignkey')
    op.drop_column('availability_slots', 'professional_id')

    # Remove professional_id from appointments
    op.drop_index('ix_appointments_professional_id', table_name='appointments')
    op.drop_constraint('fk_appointments_professional', 'appointments', type_='foreignkey')
    op.drop_column('appointments', 'professional_id')

    # Drop professionals table
    op.drop_index('ix_professionals_active', table_name='professionals')
    op.drop_index('ix_professionals_clinic_id', table_name='professionals')
    op.drop_table('professionals')

    # =====================================================
    # Revert PHASE 2: Reminders
    # =====================================================

    # Remove reminder columns from clinics
    op.drop_column('clinics', 'reminder_1h_message')
    op.drop_column('clinics', 'reminder_24h_message')
    op.drop_column('clinics', 'reminder_1h_enabled')
    op.drop_column('clinics', 'reminder_24h_enabled')
    op.drop_column('clinics', 'reminders_enabled')

    # Drop appointment_reminders table
    op.drop_index('ix_appointment_reminders_scheduled_for', table_name='appointment_reminders')
    op.drop_index('ix_appointment_reminders_status', table_name='appointment_reminders')
    op.drop_index('ix_appointment_reminders_appointment_id', table_name='appointment_reminders')
    op.drop_table('appointment_reminders')
