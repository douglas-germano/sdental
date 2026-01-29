"""Add soft delete to conversations table

Revision ID: 04_conversations_soft_delete
Revises: 03_model_improvements
Create Date: 2026-01-29 20:40:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '04_conversations_soft_delete'
down_revision = '03_model_improvements'
branch_labels = None
depends_on = None


def upgrade():
    # Add deleted_at column to conversations table
    op.add_column('conversations', sa.Column('deleted_at', sa.DateTime(), nullable=True))
    op.create_index('ix_conversations_deleted_at', 'conversations', ['deleted_at'], unique=False)


def downgrade():
    # Remove deleted_at column from conversations table
    op.drop_index('ix_conversations_deleted_at', table_name='conversations')
    op.drop_column('conversations', 'deleted_at')
