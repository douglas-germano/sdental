import logging

from flask import Blueprint, request, jsonify

from app import db
from app.models import AssistantConversation, AssistantMemory
from app.utils.auth import clinic_required

logger = logging.getLogger(__name__)

bp = Blueprint('assistant', __name__, url_prefix='/api/assistant')


def _get_or_create_conversation(clinic) -> AssistantConversation:
    conversation = AssistantConversation.query.filter_by(clinic_id=clinic.id).first()
    if not conversation:
        conversation = AssistantConversation(clinic_id=clinic.id, messages=[])
        db.session.add(conversation)
        db.session.commit()
    return conversation


@bp.route('/messages', methods=['GET'])
@clinic_required
def get_messages(current_clinic):
    conversation = _get_or_create_conversation(current_clinic)
    return jsonify(conversation.to_dict())


@bp.route('/messages', methods=['POST'])
@clinic_required
def send_message(current_clinic):
    data = request.get_json() or {}
    message = (data.get('message') or '').strip()
    if not message:
        return jsonify({'error': 'A mensagem é obrigatória'}), 400
    if len(message) > 2000:
        return jsonify({'error': 'Mensagem muito longa'}), 400

    from app.services.assistant_service import AssistantService

    conversation = _get_or_create_conversation(current_clinic)

    try:
        service = AssistantService(current_clinic)
        reply = service.process_message(conversation, message)
    except ValueError as e:
        # Claude API key not configured
        return jsonify({'error': str(e)}), 400
    except Exception:
        logger.exception('Assistant message failed')
        return jsonify({'error': 'Não foi possível gerar a resposta agora.'}), 500

    return jsonify({'reply': reply, 'conversation': conversation.to_dict()})


@bp.route('/messages', methods=['DELETE'])
@clinic_required
def clear_messages(current_clinic):
    conversation = _get_or_create_conversation(current_clinic)
    conversation.messages = []
    db.session.commit()
    return jsonify({'message': 'Histórico limpo com sucesso'})


@bp.route('/memories', methods=['GET'])
@clinic_required
def list_memories(current_clinic):
    limit = min(request.args.get('limit', 100, type=int), 200)
    memories = (
        AssistantMemory.query.filter_by(clinic_id=current_clinic.id)
        .order_by(AssistantMemory.created_at.desc())
        .limit(limit)
        .all()
    )
    return jsonify({'memories': [m.to_dict() for m in memories]})


@bp.route('/memories', methods=['POST'])
@clinic_required
def create_memory(current_clinic):
    data = request.get_json() or {}
    content = (data.get('content') or '').strip()
    if not content:
        return jsonify({'error': 'O conteúdo é obrigatório'}), 400
    if len(content) > 500:
        return jsonify({'error': 'Conteúdo muito longo (máx. 500 caracteres)'}), 400

    memory = AssistantMemory(clinic_id=current_clinic.id, content=content)
    db.session.add(memory)
    db.session.commit()
    return jsonify({'memory': memory.to_dict()}), 201


@bp.route('/memories/<memory_id>', methods=['PATCH'])
@clinic_required
def update_memory(current_clinic, memory_id):
    memory = AssistantMemory.query.filter_by(id=memory_id, clinic_id=current_clinic.id).first()
    if not memory:
        return jsonify({'error': 'Memória não encontrada'}), 404

    data = request.get_json() or {}
    content = (data.get('content') or '').strip()
    if not content:
        return jsonify({'error': 'O conteúdo é obrigatório'}), 400
    if len(content) > 500:
        return jsonify({'error': 'Conteúdo muito longo (máx. 500 caracteres)'}), 400

    memory.content = content
    db.session.commit()
    return jsonify({'memory': memory.to_dict()})


@bp.route('/memories/<memory_id>', methods=['DELETE'])
@clinic_required
def delete_memory(current_clinic, memory_id):
    memory = AssistantMemory.query.filter_by(id=memory_id, clinic_id=current_clinic.id).first()
    if not memory:
        return jsonify({'error': 'Memória não encontrada'}), 404

    db.session.delete(memory)
    db.session.commit()
    return jsonify({'message': 'Memória removida com sucesso'})
