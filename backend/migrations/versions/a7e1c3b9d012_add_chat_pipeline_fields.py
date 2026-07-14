"""Add chat pipeline fields: connection state, quick replies, unread tracking, media assets

Revision ID: a7e1c3b9d012
Revises: c2cd9960a435
Create Date: 2026-07-14

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'a7e1c3b9d012'
down_revision = 'c2cd9960a435'
branch_labels = None
depends_on = None


def upgrade():
    # WhatsApp connection monitoring + per-clinic quick reply templates
    op.add_column('clinics', sa.Column('whatsapp_connection_state', sa.String(length=20), nullable=True))
    op.add_column('clinics', sa.Column('whatsapp_connection_updated_at', sa.DateTime(), nullable=True))
    op.add_column('clinics', sa.Column('quick_replies', postgresql.JSONB(astext_type=sa.Text()), nullable=True))

    # Unread tracking for the dashboard chat
    op.add_column('conversations', sa.Column('last_read_at', sa.DateTime(), nullable=True))

    # Own storage for WhatsApp media (CDN URLs are encrypted and expire)
    op.create_table(
        'media_assets',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('clinic_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('clinics.id'), nullable=False),
        sa.Column('mimetype', sa.String(length=120), nullable=False),
        sa.Column('filename', sa.String(length=255), nullable=True),
        sa.Column('data', sa.LargeBinary(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_media_assets_clinic_id', 'media_assets', ['clinic_id'])


def downgrade():
    op.drop_index('ix_media_assets_clinic_id', table_name='media_assets')
    op.drop_table('media_assets')
    op.drop_column('conversations', 'last_read_at')
    op.drop_column('clinics', 'quick_replies')
    op.drop_column('clinics', 'whatsapp_connection_updated_at')
    op.drop_column('clinics', 'whatsapp_connection_state')
