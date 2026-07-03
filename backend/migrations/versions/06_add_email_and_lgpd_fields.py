"""add password reset token fields to clinics and LGPD consent fields to patients

Revision ID: 06_email_lgpd_fields
Revises: 05_remove_agent_model
Create Date: 2026-07-03
"""
from alembic import op
import sqlalchemy as sa


revision = '06_email_lgpd_fields'
down_revision = '05_remove_agent_model'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('clinics', schema=None) as batch_op:
        batch_op.add_column(sa.Column('password_reset_token_hash', sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column('password_reset_expires_at', sa.DateTime(), nullable=True))

    with op.batch_alter_table('patients', schema=None) as batch_op:
        batch_op.add_column(sa.Column('data_consent_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('data_consent_source', sa.String(length=30), nullable=True))


def downgrade():
    with op.batch_alter_table('patients', schema=None) as batch_op:
        batch_op.drop_column('data_consent_source')
        batch_op.drop_column('data_consent_at')

    with op.batch_alter_table('clinics', schema=None) as batch_op:
        batch_op.drop_column('password_reset_expires_at')
        batch_op.drop_column('password_reset_token_hash')
