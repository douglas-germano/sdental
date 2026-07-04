"""add per-type toggle for follow-up reminders

Revision ID: 09_follow_up_toggle
Revises: 08_agent_extensions
Create Date: 2026-07-04
"""
from alembic import op
import sqlalchemy as sa


revision = '09_follow_up_toggle'
down_revision = '08_agent_extensions'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('clinics', sa.Column('reminder_follow_up_enabled', sa.Boolean(), server_default='true'))


def downgrade():
    op.drop_column('clinics', 'reminder_follow_up_enabled')
