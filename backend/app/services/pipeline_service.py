import logging
import re
from typing import List, Optional
from uuid import UUID

from app import db
from app.models import PipelineStage, Patient

logger = logging.getLogger(__name__)


class PipelineService:
    """Service for pipeline-related operations."""

    def __init__(self, clinic):
        self.clinic = clinic

    def ensure_default_stages(self) -> List[PipelineStage]:
        """
        Ensure default pipeline stages exist for the clinic.
        If stages already exist, returns them. Otherwise creates default stages.

        This method is thread-safe and prevents race conditions by using
        a database-level check.

        Returns:
            List of PipelineStage objects
        """
        # Check if stages already exist
        stages = PipelineStage.query.filter_by(
            clinic_id=self.clinic.id
        ).order_by(PipelineStage.order).all()

        if stages:
            return stages

        # Create default stages
        defaults = [
            {'name': 'Novos Leads', 'order': 0, 'color': '#6366f1', 'is_default': True},
            {'name': 'Contatado', 'order': 1, 'color': '#3b82f6', 'is_default': False},
            {'name': 'Agendado', 'order': 2, 'color': '#eab308', 'is_default': False},
            {'name': 'Compareceu', 'order': 3, 'color': '#22c55e', 'is_default': False},
            {'name': 'Não Compareceu', 'order': 4, 'color': '#ef4444', 'is_default': False},
        ]

        try:
            stages = []
            for d in defaults:
                stage = PipelineStage(
                    clinic_id=self.clinic.id,
                    name=d['name'],
                    order=d['order'],
                    color=d['color'],
                    is_default=d['is_default']
                )
                db.session.add(stage)
                stages.append(stage)

            db.session.commit()
            logger.info(f"Created {len(stages)} default pipeline stages for clinic {self.clinic.id}")
            return stages

        except Exception as e:
            db.session.rollback()
            logger.error(f"Error creating default stages for clinic {self.clinic.id}: {str(e)}")

            # If commit failed due to race condition, try to fetch again
            stages = PipelineStage.query.filter_by(
                clinic_id=self.clinic.id
            ).order_by(PipelineStage.order).all()

            if stages:
                logger.info(f"Stages were created by another request, returning existing ones")
                return stages

            # If still no stages, re-raise the error
            raise

    def get_all_stages(self) -> List[PipelineStage]:
        """
        Get all pipeline stages for the clinic, ensuring defaults exist.

        Returns:
            List of PipelineStage objects
        """
        return self.ensure_default_stages()

    def update_stages(self, stages_data: List[dict]) -> List[PipelineStage]:
        """
        Update pipeline stages configuration.
        Supports creating, updating, and deleting stages.

        Args:
            stages_data: List of stage dicts with id (optional), name, color, order, etc.

        Returns:
            Updated list of PipelineStage objects
        """
        existing_stages = {str(s.id): s for s in PipelineStage.query.filter_by(
            clinic_id=self.clinic.id
        ).all()}

        updated_ids = set()
        result_stages = []

        for stage_data in stages_data:
            stage_id = stage_data.get('id')

            # Validate color format if provided
            color = stage_data.get('color')
            if color and not self._is_valid_hex_color(color):
                raise ValueError(f"Invalid color format: {color}. Must be a valid hex color (e.g., #3b82f6)")

            if stage_id and stage_id in existing_stages:
                # Update existing stage
                stage = existing_stages[stage_id]
                stage.name = stage_data.get('name', stage.name)
                stage.description = stage_data.get('description', stage.description)
                stage.order = stage_data.get('order', stage.order)
                stage.color = color or stage.color
                stage.is_default = stage_data.get('is_default', stage.is_default)

                updated_ids.add(stage_id)
                result_stages.append(stage)
            else:
                # Create new stage
                stage = PipelineStage(
                    clinic_id=self.clinic.id,
                    name=stage_data['name'],
                    description=stage_data.get('description'),
                    order=stage_data.get('order', 0),
                    color=color or '#3b82f6',
                    is_default=stage_data.get('is_default', False)
                )
                db.session.add(stage)
                result_stages.append(stage)

        # Delete stages that weren't in the update
        for stage_id, stage in existing_stages.items():
            if stage_id not in updated_ids:
                # Check if stage has patients
                patient_count = Patient.query.filter_by(
                    pipeline_stage_id=stage.id
                ).count()

                if patient_count > 0:
                    raise ValueError(
                        f"Cannot delete stage '{stage.name}' because it has {patient_count} patients. "
                        f"Please move the patients to another stage first."
                    )

                try:
                    db.session.delete(stage)
                except Exception as e:
                    # If deletion fails due to foreign key constraints (e.g., history table not created yet)
                    logger.warning(f"Could not delete stage {stage.id}: {str(e)}")
                    # Re-raise if it's not a foreign key issue
                    if "pipeline_stage_history" not in str(e):
                        raise

        db.session.commit()

        # Return stages ordered
        return sorted(result_stages, key=lambda s: s.order)

    def get_board_data(self, limit_per_stage: int = 50, offset: int = 0) -> List[dict]:
        """
        Get complete board data with stages and their patients.

        Args:
            limit_per_stage: Maximum patients per stage
            offset: Offset for pagination

        Returns:
            List of stage dicts with embedded patient lists
        """
        stages = self.ensure_default_stages()

        result = []
        for stage in stages:
            stage_data = stage.to_dict()

            # Get patients in this stage with pagination
            patients_query = stage.patients.filter(
                Patient.deleted_at.is_(None)
            ).order_by(Patient.updated_at.desc())

            # Get total count
            total_count = patients_query.count()

            # Apply pagination
            patients = patients_query.offset(offset).limit(limit_per_stage).all()

            stage_data['patients'] = [p.to_dict() for p in patients]
            stage_data['total_patients'] = total_count
            stage_data['has_more'] = total_count > (offset + limit_per_stage)

            result.append(stage_data)

        return result

    def move_patient(
        self,
        patient_id: UUID,
        target_stage_id: UUID,
        user_id: Optional[UUID] = None
    ) -> Patient:
        """
        Move a patient to a different pipeline stage.

        Args:
            patient_id: Patient UUID
            target_stage_id: Target stage UUID
            user_id: Optional user ID for audit trail

        Returns:
            Updated Patient object
        """
        # Verify patient belongs to clinic
        patient = Patient.query.filter_by(
            id=patient_id,
            clinic_id=self.clinic.id
        ).first()

        if not patient:
            raise ValueError("Patient not found")

        # Verify stage belongs to clinic
        target_stage = PipelineStage.query.filter_by(
            id=target_stage_id,
            clinic_id=self.clinic.id
        ).first()

        if not target_stage:
            raise ValueError("Stage not found")

        # Store previous stage for history
        previous_stage_id = patient.pipeline_stage_id

        # Update patient stage
        patient.pipeline_stage_id = target_stage.id

        # Create history record (will be implemented after model is created)
        try:
            from app.models import PipelineStageHistory

            history = PipelineStageHistory(
                patient_id=patient.id,
                from_stage_id=previous_stage_id,
                to_stage_id=target_stage.id,
                changed_by=user_id,
                clinic_id=self.clinic.id
            )
            db.session.add(history)
        except ImportError:
            # History model not yet created, skip
            pass

        db.session.commit()

        logger.info(
            f"Moved patient {patient.id} from stage {previous_stage_id} "
            f"to stage {target_stage.id}"
        )

        return patient

    def get_patient_history(self, patient_id: UUID) -> List[dict]:
        """
        Get pipeline stage history for a patient.

        Args:
            patient_id: Patient UUID

        Returns:
            List of history dicts
        """
        try:
            from app.models import PipelineStageHistory

            # Verify patient belongs to clinic
            patient = Patient.query.filter_by(
                id=patient_id,
                clinic_id=self.clinic.id
            ).first()

            if not patient:
                raise ValueError("Patient not found")

            history = PipelineStageHistory.query.filter_by(
                patient_id=patient_id
            ).order_by(PipelineStageHistory.changed_at.desc()).all()

            return [h.to_dict() for h in history]

        except ImportError:
            # History model not yet created
            return []

    @staticmethod
    def _is_valid_hex_color(color: str) -> bool:
        """
        Validate if a string is a valid hex color.

        Args:
            color: Color string to validate

        Returns:
            True if valid hex color, False otherwise
        """
        if not color:
            return False

        # Match #RGB or #RRGGBB format
        pattern = r'^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$'
        return bool(re.match(pattern, color))
