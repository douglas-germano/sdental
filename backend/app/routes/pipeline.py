from flask import Blueprint, request, jsonify
from app.services import PipelineService
from app.utils.auth import clinic_required
import logging

logger = logging.getLogger(__name__)

bp = Blueprint('pipeline', __name__, url_prefix='/api/pipeline')


@bp.route('/stages', methods=['GET'])
@clinic_required
def list_stages(current_clinic):
    """List all pipeline stages for the clinic."""
    service = PipelineService(current_clinic)
    stages = service.get_all_stages()
    return jsonify([s.to_dict() for s in stages])


@bp.route('/stages', methods=['POST'])
@clinic_required
def update_stages(current_clinic):
    """Update pipeline stages configuration."""
    data = request.get_json()

    if not data or not isinstance(data, list):
        return jsonify({'error': 'Request body must be an array of stages'}), 400

    try:
        service = PipelineService(current_clinic)
        updated_stages = service.update_stages(data)
        return jsonify([s.to_dict() for s in updated_stages])

    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error updating stages: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@bp.route('/board', methods=['GET'])
@clinic_required
def get_board(current_clinic):
    """Get board data: stages and their patients."""
    # Get pagination parameters
    limit = request.args.get('limit', default=50, type=int)
    offset = request.args.get('offset', default=0, type=int)

    # Validate parameters
    if limit < 1 or limit > 100:
        return jsonify({'error': 'Limit must be between 1 and 100'}), 400

    if offset < 0:
        return jsonify({'error': 'Offset must be non-negative'}), 400

    try:
        service = PipelineService(current_clinic)
        board_data = service.get_board_data(limit_per_stage=limit, offset=offset)
        return jsonify(board_data)

    except Exception as e:
        logger.error(f"Error getting board data: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@bp.route('/move', methods=['PUT'])
@clinic_required
def move_patient(current_clinic):
    """Move a patient to a different stage."""
    data = request.get_json()
    patient_id = data.get('patient_id')
    stage_id = data.get('stage_id')

    if not patient_id or not stage_id:
        return jsonify({'error': 'Missing patient_id or stage_id'}), 400

    try:
        service = PipelineService(current_clinic)
        # TODO: Get user_id from auth context when user management is implemented
        patient = service.move_patient(patient_id, stage_id, user_id=None)

        return jsonify({
            'message': 'Patient moved successfully',
            'patient': patient.to_dict()
        })

    except ValueError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error moving patient: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@bp.route('/patients/<patient_id>/history', methods=['GET'])
@clinic_required
def get_patient_history(current_clinic, patient_id):
    """Get pipeline stage history for a patient."""
    try:
        service = PipelineService(current_clinic)
        history = service.get_patient_history(patient_id)
        return jsonify(history)

    except ValueError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        logger.error(f"Error getting patient history: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500
