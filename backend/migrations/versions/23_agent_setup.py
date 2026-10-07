"""Add optional assistant settings without changing existing prompts."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
revision = '23_agent_setup'
down_revision = '22_security_hardening'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('clinics', sa.Column('agent_settings', sa.JSON().with_variant(JSONB(), 'postgresql'), nullable=True))


def downgrade():
    op.drop_column('clinics', 'agent_settings')
