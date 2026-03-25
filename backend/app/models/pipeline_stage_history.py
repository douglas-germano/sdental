import uuid
from datetime import datetime
from sqlalchemy.dialects.postgresql import UUID

from app import db
from .mixins import SoftDeleteMixin


class PipelineStageHistory(db.Model, SoftDeleteMixin):
    """Tracks patient movements through pipeline stages for audit trail."""
    __tablename__ = 'pipeline_stage_history'

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id = db.Column(UUID(as_uuid=True), db.ForeignKey('patients.id'), nullable=False)
    clinic_id = db.Column(UUID(as_uuid=True), db.ForeignKey('clinics.id'), nullable=False)

    # Stage IDs (nullable because from_stage might be None for first assignment)
    from_stage_id = db.Column(UUID(as_uuid=True), db.ForeignKey('pipeline_stages.id'), nullable=True)
    to_stage_id = db.Column(UUID(as_uuid=True), db.ForeignKey('pipeline_stages.id'), nullable=False)

    # Optional: track who made the change
    changed_by = db.Column(UUID(as_uuid=True), nullable=True)  # Could be user_id if you have users table

    # Timestamp
    changed_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Relationships (using back_populates instead of backref to avoid circular dependencies)
    patient = db.relationship('Patient')
    from_stage = db.relationship(
        'PipelineStage',
        foreign_keys=[from_stage_id]
    )
    to_stage = db.relationship(
        'PipelineStage',
        foreign_keys=[to_stage_id]
    )

    def to_dict(self) -> dict:
        """Convert history record to dictionary."""
        from_stage_data = None
        if self.from_stage_id:
            from_stage_data = {
                'id': str(self.from_stage_id),
                'name': self.from_stage.name if self.from_stage else 'Removido',
                'color': self.from_stage.color if self.from_stage else '#999999',
            }

        to_stage_data = {
            'id': str(self.to_stage_id),
            'name': self.to_stage.name if self.to_stage else 'Removido',
            'color': self.to_stage.color if self.to_stage else '#999999',
        }

        return {
            'id': str(self.id),
            'patient_id': str(self.patient_id),
            'from_stage': from_stage_data,
            'to_stage': to_stage_data,
            'changed_by': str(self.changed_by) if self.changed_by else None,
            'changed_at': self.changed_at.isoformat() if self.changed_at else None,
            'deleted_at': self.deleted_at.isoformat() if self.deleted_at else None,
        }

    def __repr__(self) -> str:
        from_name = self.from_stage.name if self.from_stage else 'None'
        to_name = self.to_stage.name if self.to_stage else 'Removido'
        return f'<PipelineStageHistory {from_name} -> {to_name}>'


# Create indexes for better query performance
db.Index('ix_pipeline_stage_history_patient_id', PipelineStageHistory.patient_id)
db.Index('ix_pipeline_stage_history_clinic_id', PipelineStageHistory.clinic_id)
db.Index('ix_pipeline_stage_history_changed_at', PipelineStageHistory.changed_at)
# Composite index for common queries
db.Index('ix_pipeline_stage_history_patient_changed', PipelineStageHistory.patient_id, PipelineStageHistory.changed_at)
