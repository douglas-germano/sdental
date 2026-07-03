"""add address fields to patients

Revision ID: 07_patient_address_fields
Revises: 06_email_lgpd_fields
Create Date: 2026-07-03
"""
from alembic import op
import sqlalchemy as sa


revision = '07_patient_address_fields'
down_revision = '06_email_lgpd_fields'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('patients', schema=None) as batch_op:
        batch_op.add_column(sa.Column('address_zip_code', sa.String(length=9), nullable=True))
        batch_op.add_column(sa.Column('address_street', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column('address_number', sa.String(length=20), nullable=True))
        batch_op.add_column(sa.Column('address_complement', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column('address_neighborhood', sa.String(length=100), nullable=True))
        batch_op.add_column(sa.Column('address_city', sa.String(length=100), nullable=True))
        batch_op.add_column(sa.Column('address_state', sa.String(length=2), nullable=True))


def downgrade():
    with op.batch_alter_table('patients', schema=None) as batch_op:
        batch_op.drop_column('address_state')
        batch_op.drop_column('address_city')
        batch_op.drop_column('address_neighborhood')
        batch_op.drop_column('address_complement')
        batch_op.drop_column('address_number')
        batch_op.drop_column('address_street')
        batch_op.drop_column('address_zip_code')
