from flask import Blueprint, request, jsonify
from app import db
from app.models import PipelineStage, Patient
from app.utils.auth import clinic_required

bp = Blueprint('pipeline', __name__, url_prefix='/api/pipeline')

@bp.route('/stages', methods=['GET'])
@clinic_required
def list_stages(current_clinic):
    """List all pipeline stages for the clinic."""
    stages = PipelineStage.query.filter_by(
        clinic_id=current_clinic.id
    ).order_by(PipelineStage.order).all()
    
    # If no stages exist, create defaults
    if not stages:
        defaults = [
            {'name': 'Novos Leads', 'order': 0, 'color': '#6366f1', 'is_default': True},
            {'name': 'Contatado', 'order': 1, 'color': '#3b82f6', 'is_default': False},
            {'name': 'Agendado', 'order': 2, 'color': '#eab308', 'is_default': False},
            {'name': 'Compareceu', 'order': 3, 'color': '#22c55e', 'is_default': False},
            {'name': 'Não Compareceu', 'order': 4, 'color': '#ef4444', 'is_default': False},
        ]
        
        stages = []
        for d in defaults:
            stage = PipelineStage(
                clinic_id=current_clinic.id,
                name=d['name'],
                order=d['order'],
                color=d['color'],
                is_default=d['is_default']
            )
            db.session.add(stage)
            stages.append(stage)
        
        db.session.commit()
    
    return jsonify([s.to_dict() for s in stages])

@bp.route('/stages', methods=['POST'])
@clinic_required
def update_stages(current_clinic):
    """Update pipeline stages configuration."""
    data = request.get_json()
    
    # Simple implementation: delete all and recreate (or update existing)
    # For now, let's just support updating order and names of existing or creating new
    
    # This might be complex, let's start with just Listing and Moving patients
    return jsonify({'message': 'Not implemented yet'}), 501

@bp.route('/board', methods=['GET'])
@clinic_required
def get_board(current_clinic):
    """Get board data: stages and their patients."""
    stages = PipelineStage.query.filter_by(
        clinic_id=current_clinic.id
    ).order_by(PipelineStage.order).all()
    
    # Ensure stages exist
    # Ensure stages exist
    if not stages:
        defaults = [
            {'name': 'Novos Leads', 'order': 0, 'color': '#6366f1', 'is_default': True},
            {'name': 'Contatado', 'order': 1, 'color': '#3b82f6', 'is_default': False},
            {'name': 'Agendado', 'order': 2, 'color': '#eab308', 'is_default': False},
            {'name': 'Compareceu', 'order': 3, 'color': '#22c55e', 'is_default': False},
            {'name': 'Não Compareceu', 'order': 4, 'color': '#ef4444', 'is_default': False},
        ]
        
        stages = []
        for d in defaults:
            stage = PipelineStage(
                clinic_id=current_clinic.id,
                name=d['name'],
                order=d['order'],
                color=d['color'],
                is_default=d['is_default']
            )
            db.session.add(stage)
        
        db.session.commit()

        stages = PipelineStage.query.filter_by(
            clinic_id=current_clinic.id
        ).order_by(PipelineStage.order).all()
    
    result = []
    for stage in stages:
        stage_data = stage.to_dict()
        
        # Get patients in this stage
        # Limit to recent/active patients to avoid loading thousands
        patients = stage.patients.filter(
            Patient.deleted_at.is_(None)
        ).order_by(Patient.updated_at.desc()).limit(50).all()
        
        stage_data['patients'] = [p.to_dict() for p in patients]
        result.append(stage_data)
        
    return jsonify(result)

@bp.route('/move', methods=['PUT'])
@clinic_required
def move_patient(current_clinic):
    """Move a patient to a different stage."""
    data = request.get_json()
    patient_id = data.get('patient_id')
    stage_id = data.get('stage_id')
    
    if not patient_id or not stage_id:
        return jsonify({'error': 'Missing patient_id or stage_id'}), 400
        
    patient = Patient.query.filter_by(
        id=patient_id,
        clinic_id=current_clinic.id
    ).first()
    
    if not patient:
        return jsonify({'error': 'Patient not found'}), 404
        
    stage = PipelineStage.query.filter_by(
        id=stage_id,
        clinic_id=current_clinic.id
    ).first()
    
    if not stage:
        return jsonify({'error': 'Stage not found'}), 404
        
    patient.pipeline_stage_id = stage.id
    db.session.commit()
    
    return jsonify({
        'message': 'Patient moved successfully',
        'patient': patient.to_dict()
    })
