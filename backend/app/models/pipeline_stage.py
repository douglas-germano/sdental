import uuid
import re
from datetime import datetime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy import event
from sqlalchemy.orm import validates

from app import db
from .mixins import TimestampMixin

class PipelineStage(db.Model, TimestampMixin):
    __tablename__ = 'pipeline_stages'

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clinic_id = db.Column(UUID(as_uuid=True), db.ForeignKey('clinics.id'), nullable=False)
    name = db.Column(db.String(50), nullable=False)
    description = db.Column(db.String(255), nullable=True)
    order = db.Column(db.Integer, default=0)
    color = db.Column(db.String(20), default='#3b82f6') # Default blue
    is_default = db.Column(db.Boolean, default=False)

    # Relationships
    patients = db.relationship('Patient', backref='pipeline_stage', lazy='dynamic')

    @validates('color')
    def validate_color(self, key, color):
        """Validate that color is a valid hex color code."""
        if not color:
            return '#3b82f6'  # Default blue

        # Check if it's a valid hex color (#RGB or #RRGGBB)
        pattern = r'^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$'
        if not re.match(pattern, color):
            raise ValueError(
                f"Invalid color format: {color}. Must be a valid hex color (e.g., #3b82f6 or #fff)"
            )

        return color

    def to_dict(self) -> dict:
        return {
            'id': str(self.id),
            'clinic_id': str(self.clinic_id),
            'name': self.name,
            'description': self.description,
            'order': self.order,
            'color': self.color,
            'is_default': self.is_default
        }

    def __repr__(self) -> str:
        return f'<PipelineStage {self.name}>'

# Create indexes
db.Index('ix_pipeline_stages_clinic_id', PipelineStage.clinic_id)
db.Index('ix_pipeline_stages_order', PipelineStage.order)
