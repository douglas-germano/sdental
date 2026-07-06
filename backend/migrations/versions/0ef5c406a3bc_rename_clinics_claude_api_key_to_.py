"""rename clinics.claude_api_key to openrouter_api_key

Revision ID: 0ef5c406a3bc
Revises: f69f0d4f83a4
Create Date: 2026-07-06 12:37:32.473954

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0ef5c406a3bc'
down_revision = 'f69f0d4f83a4'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('clinics', schema=None) as batch_op:
        batch_op.alter_column('claude_api_key', new_column_name='openrouter_api_key')


def downgrade():
    with op.batch_alter_table('clinics', schema=None) as batch_op:
        batch_op.alter_column('openrouter_api_key', new_column_name='claude_api_key')
