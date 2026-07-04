"""Add autonomous agent: agent_actions table, proactive/automation config,
patient WhatsApp opt-out, and bot_transfer AI summary.

Revision ID: 09_autonomous_agent
Revises: 08_agent_extensions
Create Date: 2026-07-04
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = '09_autonomous_agent'
down_revision = '08_agent_extensions'
branch_labels = None
depends_on = None


def upgrade():
    # --- agent_actions: audit trail + guardrail source for proactive actions ---
    op.create_table(
        'agent_actions',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('clinic_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('patient_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('conversation_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('appointment_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('action_type', sa.String(length=40), nullable=False),
        sa.Column('channel', sa.String(length=20), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='sent'),
        sa.Column('detail', sa.Text(), nullable=True),
        sa.Column('meta', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['clinic_id'], ['clinics.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['conversation_id'], ['conversations.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_agent_actions_clinic_id', 'agent_actions', ['clinic_id'])
    op.create_index('ix_agent_actions_patient_id', 'agent_actions', ['patient_id'])
    op.create_index('ix_agent_actions_type_created', 'agent_actions', ['action_type', 'created_at'])

    # --- clinics: proactive / automation configuration ---
    op.add_column('clinics', sa.Column('proactive_outreach_enabled', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('clinics', sa.Column('noshow_recovery_enabled', sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column('clinics', sa.Column('waitlist_enabled', sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column('clinics', sa.Column('recall_enabled', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('clinics', sa.Column('recall_inactive_days', sa.Integer(), nullable=False, server_default='180'))
    op.add_column('clinics', sa.Column('funnel_automation_enabled', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('clinics', sa.Column('weekly_report_enabled', sa.Boolean(), nullable=False, server_default=sa.false()))

    # --- patients: WhatsApp proactive-outreach opt-out ---
    op.add_column('patients', sa.Column('whatsapp_opt_out', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('patients', sa.Column('whatsapp_opt_out_at', sa.DateTime(), nullable=True))

    # --- bot_transfers: AI-generated handoff summary ---
    op.add_column('bot_transfers', sa.Column('summary', sa.Text(), nullable=True))


def downgrade():
    op.drop_column('bot_transfers', 'summary')

    op.drop_column('patients', 'whatsapp_opt_out_at')
    op.drop_column('patients', 'whatsapp_opt_out')

    op.drop_column('clinics', 'weekly_report_enabled')
    op.drop_column('clinics', 'funnel_automation_enabled')
    op.drop_column('clinics', 'recall_inactive_days')
    op.drop_column('clinics', 'recall_enabled')
    op.drop_column('clinics', 'waitlist_enabled')
    op.drop_column('clinics', 'noshow_recovery_enabled')
    op.drop_column('clinics', 'proactive_outreach_enabled')

    op.drop_index('ix_agent_actions_type_created', table_name='agent_actions')
    op.drop_index('ix_agent_actions_patient_id', table_name='agent_actions')
    op.drop_index('ix_agent_actions_clinic_id', table_name='agent_actions')
    op.drop_table('agent_actions')
