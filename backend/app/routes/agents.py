import logging

from flask import Blueprint, request, jsonify, current_app
from app import db
from app.utils.auth import clinic_required

logger = logging.getLogger(__name__)

bp = Blueprint('agents', __name__, url_prefix='/api/agents')

@bp.route('/config', methods=['PUT'])
@clinic_required
def update_agent_config(current_clinic):
    data = request.get_json()

    if 'name' in data:
        current_clinic.agent_name = data['name']
    if 'temperature' in data:
        current_clinic.agent_temperature = float(data['temperature'])
    if 'system_prompt' in data:
        current_clinic.agent_system_prompt = data['system_prompt']
    if 'context' in data:
        current_clinic.agent_context = data['context']

    db.session.commit()

    return jsonify({
        'message': 'Agent configuration updated successfully',
        'config': {
            'name': current_clinic.agent_name,
            'model': current_app.config.get('OPENROUTER_MODEL', 'anthropic/claude-sonnet-4.5'),
            'temperature': current_clinic.agent_temperature,
            'system_prompt': current_clinic.agent_system_prompt,
            'context': current_clinic.agent_context
        }
    }), 200

@bp.route('/config', methods=['GET'])
@clinic_required
def get_agent_config(current_clinic):
    return jsonify({
        'name': current_clinic.agent_name or 'Assistente SDental',
        'model': current_app.config.get('OPENROUTER_MODEL', 'anthropic/claude-sonnet-4.5'),
        'temperature': current_clinic.agent_temperature if current_clinic.agent_temperature is not None else 0.7,
        'system_prompt': current_clinic.agent_system_prompt or '',
        'context': current_clinic.agent_context or ''
    }), 200

@bp.route('/test', methods=['POST'])
@clinic_required
def test_agent(current_clinic):
    data = request.get_json()
    message = data.get('message')

    if not message:
        return jsonify({'error': 'Message is required'}), 400

    try:
        from app.services.conversation_service import ConversationService, TEST_PHONE_PREFIX
        from app.services.claude_service import ClaudeService

        test_phone = f"{TEST_PHONE_PREFIX}{str(current_clinic.id)[:8]}"

        conversation_service = ConversationService(current_clinic)
        conversation = conversation_service.get_or_create_conversation(test_phone)

        claude_service = ClaudeService(current_clinic)
        response_text = claude_service.process_message(conversation, message)

        return jsonify({
            'response': response_text
        }), 200

    except Exception as e:
        logger.error('Error testing agent: %s', str(e))
        return jsonify({'error': str(e)}), 500
