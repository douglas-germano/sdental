import logging
from typing import Optional, Tuple

from app import db
from app.models import Patient, PipelineStage

logger = logging.getLogger(__name__)


class PatientService:
    """Service for patient-related operations shared by the dashboard routes
    and the WhatsApp agent (find-or-create, default pipeline stage)."""

    def __init__(self, clinic):
        self.clinic = clinic

    def get_default_pipeline_stage(self) -> Optional[PipelineStage]:
        """Return the clinic's default pipeline stage, falling back to the
        first stage by order if none is marked as default."""
        return PipelineStage.query.filter_by(
            clinic_id=self.clinic.id,
            is_default=True
        ).first() or PipelineStage.query.filter_by(
            clinic_id=self.clinic.id
        ).order_by(PipelineStage.order).first()

    def find_or_create(
        self,
        name: str,
        phone: str,
        email: Optional[str] = None,
        notes: Optional[str] = None,
        pipeline_stage_id: Optional[str] = None,
        address: Optional[dict] = None
    ) -> Tuple[Patient, bool]:
        """
        Find a patient by phone (including soft-deleted ones, which are
        restored), or create a new one. Assigns the clinic's default
        pipeline stage when none is provided and the patient has none.

        Returns:
            (patient, created) - created is True if a new row was inserted.
        """
        patient = Patient.query.filter_by(
            clinic_id=self.clinic.id,
            phone=phone
        ).first()

        if patient:
            if patient.deleted_at is not None:
                patient.restore()

            patient.name = name
            if email:
                patient.email = email
            if notes:
                patient.notes = notes
            for field, value in (address or {}).items():
                if value:
                    setattr(patient, field, value)

            if pipeline_stage_id:
                stage = PipelineStage.query.filter_by(
                    id=pipeline_stage_id,
                    clinic_id=self.clinic.id
                ).first()
                if stage:
                    patient.pipeline_stage_id = pipeline_stage_id
            elif not patient.pipeline_stage_id:
                default_stage = self.get_default_pipeline_stage()
                if default_stage:
                    patient.pipeline_stage_id = default_stage.id

            return patient, False

        if pipeline_stage_id:
            stage = PipelineStage.query.filter_by(
                id=pipeline_stage_id,
                clinic_id=self.clinic.id
            ).first()
            pipeline_stage_id = stage.id if stage else None
        else:
            default_stage = self.get_default_pipeline_stage()
            pipeline_stage_id = default_stage.id if default_stage else None

        patient = Patient(
            clinic_id=self.clinic.id,
            name=name,
            phone=phone,
            email=email,
            notes=notes,
            pipeline_stage_id=pipeline_stage_id,
            **(address or {})
        )
        db.session.add(patient)
        db.session.flush()

        return patient, True
