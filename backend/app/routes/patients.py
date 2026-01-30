from flask import Blueprint, request, jsonify
from sqlalchemy import or_

from app import db
from app.models import Patient, PipelineStage
from app.utils.auth import clinic_required
from app.utils.validators import normalize_phone

bp = Blueprint('patients', __name__, url_prefix='/api/patients')


@bp.route('', methods=['GET'])
@clinic_required
def list_patients(current_clinic):
    """List all patients for the clinic."""
    # Get query parameters
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    search = request.args.get('search', '')

    # Build query (exclude soft deleted)
    query = Patient.query.filter_by(clinic_id=current_clinic.id).filter(
        Patient.deleted_at.is_(None)
    )

    # Apply search filter
    if search:
        query = query.filter(
            or_(
                Patient.name.ilike(f'%{search}%'),
                Patient.phone.ilike(f'%{search}%'),
                Patient.email.ilike(f'%{search}%')
            )
        )

    # Order by name
    query = query.order_by(Patient.name)

    # Paginate
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        'patients': [p.to_dict() for p in pagination.items],
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': page
    })


@bp.route('/<patient_id>', methods=['GET'])
@clinic_required
def get_patient(patient_id, current_clinic):
    """Get patient details."""
    patient = Patient.query.filter_by(
        id=patient_id,
        clinic_id=current_clinic.id
    ).filter(Patient.deleted_at.is_(None)).first()

    if not patient:
        return jsonify({'error': 'Patient not found'}), 404

    # Include appointments history
    patient_data = patient.to_dict()
    patient_data['appointments'] = [
        a.to_dict() for a in patient.appointments.order_by(
            db.desc('scheduled_datetime')
        ).limit(10)
    ]

    return jsonify(patient_data)


@bp.route('', methods=['POST'])
@clinic_required
def create_patient(current_clinic):
    """Create a new patient."""
    data = request.get_json()

    if not data.get('name') or not data.get('phone'):
        return jsonify({'error': 'Name and phone are required'}), 400

    phone = normalize_phone(data['phone'])

    # Check if patient already exists (including soft deleted)
    existing = Patient.query.filter_by(
        clinic_id=current_clinic.id,
        phone=phone
    ).first()

    if existing:
        # If soft deleted, restore and update
        if existing.deleted_at is not None:
            existing.restore()
            existing.name = data['name']
            if data.get('email'):
                existing.email = data['email']
            if data.get('notes'):
                existing.notes = data['notes']

            # Update pipeline stage if provided
            pipeline_stage_id = data.get('pipeline_stage_id')
            if pipeline_stage_id:
                stage = PipelineStage.query.filter_by(
                    id=pipeline_stage_id,
                    clinic_id=current_clinic.id
                ).first()
                if stage:
                    existing.pipeline_stage_id = pipeline_stage_id
            elif not existing.pipeline_stage_id:
                # Assign default stage if none
                default_stage = PipelineStage.query.filter_by(
                    clinic_id=current_clinic.id,
                    is_default=True
                ).first() or PipelineStage.query.filter_by(
                    clinic_id=current_clinic.id
                ).order_by(PipelineStage.order).first()
                if default_stage:
                    existing.pipeline_stage_id = default_stage.id

            db.session.commit()
            return jsonify({
                'message': 'Patient restored successfully',
                'patient': existing.to_dict()
            }), 201
        else:
            return jsonify({'error': 'Patient with this phone already exists'}), 409

    # Use provided pipeline_stage_id or find default
    pipeline_stage_id = data.get('pipeline_stage_id')

    if pipeline_stage_id:
        # Validate that the stage belongs to this clinic
        stage = PipelineStage.query.filter_by(
            id=pipeline_stage_id,
            clinic_id=current_clinic.id
        ).first()
        if not stage:
            return jsonify({'error': 'Invalid pipeline stage'}), 400
    else:
        # Find default pipeline stage
        default_stage = PipelineStage.query.filter_by(
            clinic_id=current_clinic.id,
            is_default=True
        ).first()

        # If no default set, get the first one by order
        if not default_stage:
            default_stage = PipelineStage.query.filter_by(
                clinic_id=current_clinic.id
            ).order_by(PipelineStage.order).first()

        pipeline_stage_id = default_stage.id if default_stage else None

    patient = Patient(
        clinic_id=current_clinic.id,
        name=data['name'],
        phone=phone,
        email=data.get('email'),
        notes=data.get('notes'),
        pipeline_stage_id=pipeline_stage_id
    )

    db.session.add(patient)
    db.session.commit()

    return jsonify({
        'message': 'Patient created successfully',
        'patient': patient.to_dict()
    }), 201


@bp.route('/<patient_id>', methods=['PUT'])
@clinic_required
def update_patient(patient_id, current_clinic):
    """Update patient information."""
    patient = Patient.query.filter_by(
        id=patient_id,
        clinic_id=current_clinic.id
    ).filter(Patient.deleted_at.is_(None)).first()

    if not patient:
        return jsonify({'error': 'Patient not found'}), 404

    data = request.get_json()

    if 'name' in data:
        patient.name = data['name']
    if 'email' in data:
        patient.email = data['email']
    if 'notes' in data:
        patient.notes = data['notes']
    if 'phone' in data:
        new_phone = normalize_phone(data['phone'])
        # Check if phone is already used by another patient (including soft deleted due to unique constraint)
        existing = Patient.query.filter_by(
            clinic_id=current_clinic.id,
            phone=new_phone
        ).first()
        if existing and existing.id != patient.id:
            # If the existing patient is soft deleted, we can't use this phone
            # because of the unique constraint on (clinic_id, phone)
            return jsonify({'error': 'Phone number already in use'}), 409
        patient.phone = new_phone

    if 'pipeline_stage_id' in data:
        patient.pipeline_stage_id = data['pipeline_stage_id']

    db.session.commit()

    return jsonify({
        'message': 'Patient updated successfully',
        'patient': patient.to_dict()
    })


@bp.route('/<patient_id>', methods=['DELETE'])
@clinic_required
def delete_patient(patient_id, current_clinic):
    """Soft delete a patient."""
    patient = Patient.query.filter_by(
        id=patient_id,
        clinic_id=current_clinic.id
    ).filter(Patient.deleted_at.is_(None)).first()

    if not patient:
        return jsonify({'error': 'Patient not found'}), 404

    # Soft delete instead of hard delete
    patient.soft_delete()
    db.session.commit()

    return jsonify({'message': 'Patient deleted successfully'})


@bp.route('/<patient_id>/restore', methods=['POST'])
@clinic_required
def restore_patient(patient_id, current_clinic):
    """Restore a soft-deleted patient."""
    patient = Patient.query.filter_by(
        id=patient_id,
        clinic_id=current_clinic.id
    ).filter(Patient.deleted_at.isnot(None)).first()

    if not patient:
        return jsonify({'error': 'Deleted patient not found'}), 404

    patient.restore()
    db.session.commit()

    return jsonify({
        'message': 'Patient restored successfully',
        'patient': patient.to_dict()
    })
