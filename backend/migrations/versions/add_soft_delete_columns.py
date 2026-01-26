"""Add soft delete columns to patients and appointments

Revision ID: add_soft_delete
Revises: 6d19eebd5915
Create Date: 2024-01-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_soft_delete'
down_revision = '6d19eebd5915'
branch_labels = None
depends_on = None


def upgrade():
    # Add deleted_at column to patients table
    op.add_column('patients', sa.Column('deleted_at', sa.DateTime(), nullable=True))
    op.create_index('ix_patients_deleted_at', 'patients', ['deleted_at'], unique=False)

    # Add deleted_at column to appointments table
    op.add_column('appointments', sa.Column('deleted_at', sa.DateTime(), nullable=True))
    op.create_index('ix_appointments_deleted_at', 'appointments', ['deleted_at'], unique=False)


def downgrade():
    # Remove deleted_at column from appointments table
    op.drop_index('ix_appointments_deleted_at', table_name='appointments')
    op.drop_column('appointments', 'deleted_at')

    # Remove deleted_at column from patients table
    op.drop_index('ix_patients_deleted_at', table_name='patients')
    op.drop_column('patients', 'deleted_at')
