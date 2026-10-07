import logging
from uuid import UUID
from flask import Blueprint, request, jsonify, current_app
from app import db
from app.utils.auth import clinic_required
from app.services.agent_setup import AUTOMATION_FIELDS, settings_for, validate_config

logger = logging.getLogger(__name__)
bp = Blueprint('agents', __name__, url_prefix='/api/agents')


def config_for(clinic):
    return {
        'name': clinic.agent_name or 'Assistente SDental',
        'model': current_app.config.get('OPENROUTER_MODEL', 'anthropic/claude-sonnet-4.5'),
        'temperature': clinic.agent_temperature if clinic.agent_temperature is not None else 0.7,
        'system_prompt': clinic.agent_system_prompt or '', 'context': clinic.agent_context or '',
        'settings': settings_for(clinic), 'agent_enabled': bool(clinic.agent_enabled),
        'ai_configured': bool(clinic.openrouter_api_key or current_app.config.get('OPENROUTER_API_KEY')),
        'automation': {**{key: bool(getattr(clinic, key)) for key in AUTOMATION_FIELDS},
                       'recall_inactive_days': clinic.recall_inactive_days or 180},
    }


@bp.route('/config', methods=['PUT'])
@clinic_required
def update_agent_config(current_clinic):
    data = request.get_json(silent=True)
    try:
        validate_config(data)
    except ValueError as error:
        return jsonify(error=str(error)), 400
    if data.get('agent_enabled'):
        if not config_for(current_clinic)['ai_configured']:
            return jsonify(error='O assistente ainda não está disponível. Peça ao suporte para concluir a configuração.'), 409
        try:
            from app.services.evolution_service import EvolutionService
            connected = EvolutionService(current_clinic).get_instance_status().get('connected')
        except Exception:
            connected = False
        if not connected:
            return jsonify(error='Conecte o WhatsApp antes de ativar o atendimento.'), 409
    for key, attribute in [('name', 'agent_name'), ('system_prompt', 'agent_system_prompt'),
                           ('context', 'agent_context'), ('agent_enabled', 'agent_enabled')]:
        if key in data:
            setattr(current_clinic, attribute, data[key])
    if 'temperature' in data:
        current_clinic.agent_temperature = float(data['temperature'])
    if 'settings' in data:
        current_clinic.agent_settings = settings_for(current_clinic, data['settings'])
    for key, value in data.get('automation', {}).items():
        setattr(current_clinic, key, value)
    db.session.commit()
    return jsonify(message='Configuração publicada.', config=config_for(current_clinic)), 200


@bp.route('/config', methods=['GET'])
@clinic_required
def get_agent_config(current_clinic):
    return jsonify(config_for(current_clinic)), 200


@bp.route('/test', methods=['POST'])
@clinic_required
def test_agent(current_clinic):
    data = request.get_json(silent=True)
    try:
        validate_config(data)
        if not isinstance(data.get('message'), str) or not data['message'].strip() or len(data['message']) > 5000:
            raise ValueError('Escreva uma mensagem de até 5000 caracteres.')
        session = UUID(data['session_id']).hex if 'session_id' in data else None
    except (ValueError, TypeError, AttributeError) as error:
        return jsonify(error=str(error) if isinstance(error, ValueError) else 'Conversa de teste inválida.'), 400
    overrides = {key: data[key] for key in ('name', 'settings', 'system_prompt', 'context', 'temperature') if key in data}
    if 'temperature' in overrides:
        overrides['temperature'] = float(overrides['temperature'])
    try:
        from app.services.conversation_service import ConversationService, TEST_PHONE_PREFIX
        from app.services.claude_service import ClaudeService
        # Keep the synthetic number within VARCHAR(20); clinic scoping is
        # enforced by ConversationService. 60 random bits isolate test sessions.
        test_phone = f'{TEST_PHONE_PREFIX}{session[:15] if session else str(current_clinic.id)[:8]}'
        conversation = ConversationService(current_clinic).get_or_create_conversation(test_phone)
        response = ClaudeService(current_clinic, overrides=overrides).process_message(conversation, data['message'])
        return jsonify(response=response), 200
    except Exception:
        logger.exception('Error testing agent')
        return jsonify(error='Não foi possível responder agora. Tente novamente; se continuar, procure o suporte.'), 503
