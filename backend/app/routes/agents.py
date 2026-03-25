from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import Clinic
from app import db

bp = Blueprint('agents', __name__, url_prefix='/api/agents')

@bp.route('/config', methods=['PUT'])
@jwt_required()
def update_agent_config():
    current_user_id = get_jwt_identity()
    clinic = Clinic.query.get(current_user_id)

    if not clinic:
        return jsonify({'error': 'Clinic not found'}), 404

    data = request.get_json()

    if 'name' in data:
        clinic.agent_name = data['name']
    if 'temperature' in data:
        clinic.agent_temperature = float(data['temperature'])
    if 'system_prompt' in data:
        clinic.agent_system_prompt = data['system_prompt']
    if 'context' in data:
        clinic.agent_context = data['context']

    db.session.commit()

    return jsonify({
        'message': 'Agent configuration updated successfully',
        'config': {
            'name': clinic.agent_name,
            'model': current_app.config.get('CLAUDE_MODEL', 'claude-sonnet-4-20250514'),
            'temperature': clinic.agent_temperature,
            'system_prompt': clinic.agent_system_prompt,
            'context': clinic.agent_context
        }
    }), 200

@bp.route('/config', methods=['GET'])
@jwt_required()
def get_agent_config():
    current_user_id = get_jwt_identity()
    clinic = Clinic.query.get(current_user_id)

    if not clinic:
        return jsonify({'error': 'Clinic not found'}), 404

    return jsonify({
        'name': clinic.agent_name or 'Assistente SDental',
        'model': current_app.config.get('CLAUDE_MODEL', 'claude-sonnet-4-20250514'),
        'temperature': clinic.agent_temperature if clinic.agent_temperature is not None else 0.7,
        'system_prompt': clinic.agent_system_prompt or '',
        'context': clinic.agent_context or ''
    }), 200

@bp.route('/test', methods=['POST'])
@jwt_required()
def test_agent():
    current_user_id = get_jwt_identity()
    clinic = Clinic.query.get(current_user_id)

    if not clinic:
        return jsonify({'error': 'Clinic not found'}), 404

    data = request.get_json()
    message = data.get('message')

    if not message:
        return jsonify({'error': 'Message is required'}), 400

    try:
        from app.services.conversation_service import ConversationService
        from app.services.claude_service import ClaudeService

        test_phone = f"TEST-{str(clinic.id)[:8]}"

        conversation_service = ConversationService(clinic)
        conversation = conversation_service.get_or_create_conversation(test_phone)

        claude_service = ClaudeService(clinic)
        response_text = claude_service.process_message(conversation, message)

        return jsonify({
            'response': response_text
        }), 200

    except Exception as e:
        print(f"Error testing agent: {e}")
        return jsonify({'error': str(e)}), 500
