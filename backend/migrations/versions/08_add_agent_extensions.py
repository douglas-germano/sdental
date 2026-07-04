"""add urgent flags and patient confirmation timestamp for agent extensions

Revision ID: 08_agent_extensions
Revises: 07_patient_address_fields
Create Date: 2026-07-03
"""
from alembic import op
import sqlalchemy as sa


revision = '08_agent_extensions'
down_revision = '07_patient_address_fields'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('conversations', schema=None) as batch_op:
        batch_op.add_column(sa.Column('urgent', sa.Boolean(), nullable=False, server_default=sa.false()))

    with op.batch_alter_table('bot_transfers', schema=None) as batch_op:
        batch_op.add_column(sa.Column('urgent', sa.Boolean(), nullable=False, server_default=sa.false()))

    with op.batch_alter_table('appointments', schema=None) as batch_op:
        batch_op.add_column(sa.Column('patient_confirmed_at', sa.DateTime(), nullable=True))


def downgrade():
    with op.batch_alter_table('appointments', schema=None) as batch_op:
        batch_op.drop_column('patient_confirmed_at')

    with op.batch_alter_table('bot_transfers', schema=None) as batch_op:
        batch_op.drop_column('urgent')

    with op.batch_alter_table('conversations', schema=None) as batch_op:
        batch_op.drop_column('urgent')
