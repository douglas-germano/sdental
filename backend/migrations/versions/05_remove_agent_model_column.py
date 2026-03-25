"""remove agent_model column - model is now env-only config

Revision ID: 05_remove_agent_model
Revises: 04_add_conversations_soft_delete
Create Date: 2026-03-25

The LLM model is a system-level config (CLAUDE_MODEL env var),
not a per-clinic setting. Removes unused agent_model column.
"""
from alembic import op
import sqlalchemy as sa


revision = '05_remove_agent_model'
down_revision = '04_add_conversations_soft_delete'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('clinics', schema=None) as batch_op:
        batch_op.drop_column('agent_model')


def downgrade():
    with op.batch_alter_table('clinics', schema=None) as batch_op:
        batch_op.add_column(sa.Column('agent_model', sa.String(length=100), nullable=True))
