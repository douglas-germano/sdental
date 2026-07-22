"""security hardening: clinic token_version + widen encrypted secret columns

Adds clinics.token_version (JWT session invalidation) and widens the
evolution_api_key / openrouter_api_key columns so they can hold the Fernet
ciphertext produced when FIELD_ENCRYPTION_KEY is configured. Existing plaintext
values remain valid and are read back unchanged.

Revision ID: 22_security_hardening
Revises: a7e1c3b9d012
Create Date: 2026-07-22
"""
from alembic import op
import sqlalchemy as sa


revision = '22_security_hardening'
down_revision = 'a7e1c3b9d012'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('clinics', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('token_version', sa.Integer(), nullable=False, server_default='0')
        )
        batch_op.alter_column(
            'evolution_api_key',
            existing_type=sa.String(length=255),
            type_=sa.String(length=512),
            existing_nullable=True,
        )
        batch_op.alter_column(
            'openrouter_api_key',
            existing_type=sa.String(length=255),
            type_=sa.String(length=512),
            existing_nullable=True,
        )


def downgrade():
    with op.batch_alter_table('clinics', schema=None) as batch_op:
        batch_op.alter_column(
            'openrouter_api_key',
            existing_type=sa.String(length=512),
            type_=sa.String(length=255),
            existing_nullable=True,
        )
        batch_op.alter_column(
            'evolution_api_key',
            existing_type=sa.String(length=512),
            type_=sa.String(length=255),
            existing_nullable=True,
        )
        batch_op.drop_column('token_version')
