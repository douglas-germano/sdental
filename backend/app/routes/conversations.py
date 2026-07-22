import base64
import binascii
import logging

from flask import Blueprint, request, jsonify, Response, stream_with_context

from app import db
from app.models import Conversation, BotTransfer, ConversationStatus, Patient, MediaAsset
from app.services.conversation_service import ConversationService
from app.services.evolution_service import EvolutionService
from app.services.patient_service import PatientService
from app.services import realtime_service
from app.utils.auth import clinic_required, clinic_required_stream
from app.utils.datetime_utils import utcnow
from app.utils.pagination import get_pagination_params
from app.utils.validators import normalize_phone

bp = Blueprint('conversations', __name__, url_prefix='/api/conversations')
logger = logging.getLogger(__name__)

MAX_MEDIA_BYTES = 8 * 1024 * 1024  # 8MB, base64-decoded size
ALLOWED_MEDIA_TYPES = {'image', 'audio', 'document'}
# WhatsApp rejects text bodies longer than this
MAX_TEXT_LENGTH = 4096
MAX_QUICK_REPLIES = 50


@bp.route('/stream', methods=['GET'])
@clinic_required_stream
def stream_conversations(current_clinic):
    """
    Server-Sent Events stream of realtime conversation events for the clinic:
    new messages, status updates (delivered/read) and typing presence.

    Auth accepts either the normal Authorization header or a `?token=` query
    param, since the browser's EventSource API cannot set custom headers.
    """
    clinic_id = str(current_clinic.id)

    def event_stream():
        for chunk in realtime_service.subscribe(clinic_id):
            yield chunk

    return Response(
        stream_with_context(event_stream()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
            'Connection': 'keep-alive'
        }
    )


@bp.route('', methods=['GET'])
@clinic_required
def list_conversations(current_clinic):
    """List conversations with filters."""
    page, per_page = get_pagination_params()
    status = request.args.get('status')
    needs_attention = request.args.get('needs_attention', type=bool)
    search = request.args.get('search')

    query = Conversation.query.filter_by(clinic_id=current_clinic.id)

    if status:
        query = query.filter_by(status=status)

    if needs_attention:
        query = query.filter_by(status=ConversationStatus.TRANSFERRED_TO_HUMAN)

    if search:
        search_term = f'%{search}%'
        query = query.join(Patient, Conversation.patient_id == Patient.id, isouter=True).filter(
            db.or_(
                Patient.name.ilike(search_term),
                Conversation.phone_number.ilike(search_term),
                # Also match message content ("cadê aquela conversa sobre
                # clareamento?"). Casting the JSONB to text is a full scan,
                # acceptable at per-clinic volumes.
                db.cast(Conversation.messages, db.Text).ilike(search_term)
            )
        )

    query = query.order_by(Conversation.last_message_at.desc())

    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        'conversations': [c.to_dict(include_messages=False, include_last_message_only=True) for c in pagination.items],
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': page,
        'needs_attention_count': Conversation.query.filter_by(
            clinic_id=current_clinic.id,
            status=ConversationStatus.TRANSFERRED_TO_HUMAN
        ).count(),
        'whatsapp_connection_state': current_clinic.whatsapp_connection_state
    })


@bp.route('/sync-all-history', methods=['POST'])
@clinic_required
def sync_all_conversations_history(current_clinic):
    """
    Sync WhatsApp message history for every conversation of this clinic from
    Evolution API. Bounded by a time budget - call again to continue if
    `remaining` comes back non-zero.
    """
    try:
        result = ConversationService(current_clinic).sync_all_conversations_history()
    except Exception:
        logger.exception('Failed to sync all conversations history for clinic %s', current_clinic.id)
        return jsonify({'error': 'Falha ao sincronizar o histórico'}), 502

    return jsonify(result)


@bp.route('/<conversation_id>', methods=['GET'])
@clinic_required
def get_conversation(conversation_id, current_clinic):
    """Get conversation details with full message history."""
    conversation = Conversation.query.filter_by(
        id=conversation_id,
        clinic_id=current_clinic.id
    ).first()

    if not conversation:
        return jsonify({'error': 'Conversation not found'}), 404

    # Get bot transfers for this conversation
    transfers = BotTransfer.query.filter_by(
        conversation_id=conversation.id
    ).order_by(BotTransfer.transferred_at.desc()).all()

    data = conversation.to_dict(include_messages=True)
    data['transfers'] = [t.to_dict() for t in transfers]

    return jsonify(data)


@bp.route('/<conversation_id>/sync-history', methods=['POST'])
@clinic_required
def sync_conversation_history(conversation_id, current_clinic):
    """Fetch and merge this contact's WhatsApp message history from Evolution API."""
    conversation = Conversation.query.filter_by(
        id=conversation_id,
        clinic_id=current_clinic.id
    ).first()

    if not conversation:
        return jsonify({'error': 'Conversation not found'}), 404

    try:
        added = ConversationService(current_clinic).sync_history_from_whatsapp(conversation)
    except Exception:
        logger.exception('Failed to sync history for conversation %s', conversation_id)
        return jsonify({'error': 'Falha ao sincronizar o histórico'}), 502

    return jsonify({
        'message': f'{added} mensagem(ns) importada(s)' if added else 'Nenhuma mensagem nova encontrada',
        'added': added,
        'conversation': conversation.to_dict(include_messages=True)
    })


@bp.route('/<conversation_id>/read', methods=['POST'])
@clinic_required
def mark_conversation_read(conversation_id, current_clinic):
    """Mark all messages in the conversation as read by the clinic staff."""
    conversation = Conversation.query.filter_by(
        id=conversation_id,
        clinic_id=current_clinic.id
    ).first()

    if not conversation:
        return jsonify({'error': 'Conversation not found'}), 404

    conversation.last_read_at = utcnow()
    db.session.commit()

    return jsonify({'unread_count': 0, 'last_read_at': conversation.last_read_at.isoformat() + 'Z'})


@bp.route('/quick-replies', methods=['GET'])
@clinic_required
def get_quick_replies(current_clinic):
    """Canned responses available in the chat composer."""
    return jsonify({'quick_replies': current_clinic.quick_replies or []})


@bp.route('/quick-replies', methods=['PUT'])
@clinic_required
def update_quick_replies(current_clinic):
    """Replace the clinic's canned responses ([{title, text}, ...])."""
    data = request.get_json() or {}
    items = data.get('quick_replies')

    if not isinstance(items, list):
        return jsonify({'error': 'quick_replies deve ser uma lista'}), 400
    if len(items) > MAX_QUICK_REPLIES:
        return jsonify({'error': f'Máximo de {MAX_QUICK_REPLIES} respostas rápidas'}), 400

    cleaned = []
    for item in items:
        if not isinstance(item, dict):
            return jsonify({'error': 'Cada resposta rápida deve ter title e text'}), 400
        title = str(item.get('title') or '').strip()
        text = str(item.get('text') or '').strip()
        if not title or not text:
            return jsonify({'error': 'Cada resposta rápida deve ter title e text'}), 400
        if len(title) > 60 or len(text) > MAX_TEXT_LENGTH:
            return jsonify({'error': 'Título até 60 caracteres e texto até 4096'}), 400
        cleaned.append({'title': title, 'text': text})

    current_clinic.quick_replies = cleaned
    db.session.commit()

    return jsonify({'quick_replies': cleaned})


@bp.route('/<conversation_id>/transfer', methods=['POST'])
@clinic_required
def transfer_conversation(conversation_id, current_clinic):
    """Transfer conversation to human (manual trigger)."""
    conversation = Conversation.query.filter_by(
        id=conversation_id,
        clinic_id=current_clinic.id
    ).first()

    if not conversation:
        return jsonify({'error': 'Conversation not found'}), 404

    data = request.get_json()
    reason = data.get('reason', 'Manual transfer by operator')

    # Update conversation status
    conversation.status = ConversationStatus.TRANSFERRED_TO_HUMAN

    # Create transfer record
    transfer = BotTransfer(
        conversation_id=conversation.id,
        reason=reason
    )

    db.session.add(transfer)
    db.session.commit()

    return jsonify({
        'message': 'Conversation transferred to human',
        'transfer': transfer.to_dict()
    })


@bp.route('/<conversation_id>/resolve', methods=['PUT'])
@clinic_required
def resolve_conversation(conversation_id, current_clinic):
    """Mark conversation as resolved."""
    conversation = Conversation.query.filter_by(
        id=conversation_id,
        clinic_id=current_clinic.id
    ).first()

    if not conversation:
        return jsonify({'error': 'Conversation not found'}), 404

    # Mark conversation as completed
    conversation.status = ConversationStatus.COMPLETED
    conversation.urgent = False

    # Resolve any pending transfers
    pending_transfers = BotTransfer.query.filter_by(
        conversation_id=conversation.id,
        resolved=False
    ).all()

    for transfer in pending_transfers:
        transfer.resolve()

    db.session.commit()

    return jsonify({
        'message': 'Conversation resolved',
        'conversation': conversation.to_dict(include_messages=False)
    })


@bp.route('/<conversation_id>/reactivate', methods=['PUT'])
@clinic_required
def reactivate_conversation(conversation_id, current_clinic):
    """Reactivate a conversation (return to bot handling)."""
    conversation = Conversation.query.filter_by(
        id=conversation_id,
        clinic_id=current_clinic.id
    ).first()

    if not conversation:
        return jsonify({'error': 'Conversation not found'}), 404

    conversation.status = ConversationStatus.ACTIVE
    conversation.urgent = False

    db.session.commit()

    return jsonify({
        'message': 'Conversation reactivated',
        'conversation': conversation.to_dict(include_messages=False)
    })


@bp.route('/<conversation_id>/link-patient', methods=['POST'])
@clinic_required
def link_patient(conversation_id, current_clinic):
    """Link or create a patient for a conversation."""
    conversation = Conversation.query.filter_by(
        id=conversation_id,
        clinic_id=current_clinic.id
    ).first()

    if not conversation:
        return jsonify({'error': 'Conversation not found'}), 404

    data = request.get_json()

    name = data.get('name')
    phone = normalize_phone(data.get('phone') or conversation.phone_number)
    email = data.get('email')
    notes = data.get('notes')

    if not name:
        return jsonify({'error': 'Nome é obrigatório'}), 400

    if not phone:
        return jsonify({'error': 'Telefone é obrigatório'}), 400

    # Find existing patient with this phone (restoring if soft deleted) or create one
    patient, _created = PatientService(current_clinic).find_or_create(
        name=name,
        phone=phone,
        email=email,
        notes=notes
    )

    # Link patient to conversation
    conversation.patient_id = patient.id
    db.session.commit()

    return jsonify({
        'message': 'Paciente vinculado com sucesso',
        'patient': patient.to_dict()
    })


@bp.route('/<conversation_id>/send-message', methods=['POST'])
@clinic_required
def send_manual_message(conversation_id, current_clinic):
    """Send a manual message to the patient via WhatsApp."""
    conversation = Conversation.query.filter_by(
        id=conversation_id,
        clinic_id=current_clinic.id
    ).first()

    if not conversation:
        return jsonify({'error': 'Conversation not found'}), 404

    data = request.get_json()
    message = data.get('message', '').strip()

    if not message:
        return jsonify({'error': 'Message is required'}), 400

    if len(message) > MAX_TEXT_LENGTH:
        return jsonify({'error': f'Mensagem muito longa (máximo {MAX_TEXT_LENGTH} caracteres)'}), 400

    evolution = EvolutionService(current_clinic)

    try:
        result = evolution.send_message(conversation.phone_number, message)
    except Exception:
        logger.exception('Failed to send manual message on conversation %s', conversation_id)
        return jsonify({'error': 'Falha ao enviar a mensagem'}), 500

    if isinstance(result, dict) and result.get('error'):
        return jsonify({'error': f"Failed to send message: {result['error']}"}), 502

    evolution_message_id = ((result or {}).get('key') or {}).get('id')

    conversation_service = ConversationService(current_clinic)

    # Replying manually means a human took over this chat: pause the AI so
    # it doesn't answer on top of the staff member.
    took_over = conversation.status == ConversationStatus.ACTIVE
    if took_over:
        conversation_service.transfer_to_human(
            conversation, 'Atendente assumiu a conversa pelo painel'
        )

    conversation_service.add_message(
        conversation,
        'assistant',
        message,
        evolution_id=evolution_message_id,
        sent_via='dashboard'
    )

    return jsonify({
        'message': 'Message sent successfully',
        'took_over': took_over,
        'conversation': conversation.to_dict(include_messages=False)
    })


@bp.route('/<conversation_id>/send-media', methods=['POST'])
@clinic_required
def send_media_message(conversation_id, current_clinic):
    """Send an image, audio or document message to the patient via WhatsApp."""
    conversation = Conversation.query.filter_by(
        id=conversation_id,
        clinic_id=current_clinic.id
    ).first()

    if not conversation:
        return jsonify({'error': 'Conversation not found'}), 404

    data = request.get_json() or {}
    media_type = data.get('media_type')
    b64_data = data.get('data')
    mimetype = data.get('mimetype')
    filename = data.get('filename')
    caption = data.get('caption', '')

    if media_type not in ALLOWED_MEDIA_TYPES:
        return jsonify({'error': f"media_type must be one of {sorted(ALLOWED_MEDIA_TYPES)}"}), 400

    if not b64_data or not mimetype:
        return jsonify({'error': 'data and mimetype are required'}), 400

    # The mimetype is echoed back when the asset is later served, so it must be
    # consistent with the declared media_type - otherwise an image/audio upload
    # carrying e.g. mimetype=text/html becomes a stored-XSS vector.
    mimetype = str(mimetype).split(';', 1)[0].strip().lower()
    expected_prefix = {'image': 'image/', 'audio': 'audio/'}.get(media_type)
    if expected_prefix and not mimetype.startswith(expected_prefix):
        return jsonify({'error': f"mimetype '{mimetype}' does not match media_type '{media_type}'"}), 400
    if media_type == 'document' and (mimetype.startswith('text/html') or 'javascript' in mimetype):
        return jsonify({'error': 'Unsupported document mimetype'}), 400

    # Strip data URI prefix if present (e.g. "data:image/png;base64,...")
    if ',' in b64_data and b64_data.strip().lower().startswith('data:'):
        b64_data = b64_data.split(',', 1)[1]

    try:
        decoded_size = len(base64.b64decode(b64_data, validate=True))
    except (binascii.Error, ValueError):
        return jsonify({'error': 'Invalid base64 data'}), 400

    if decoded_size > MAX_MEDIA_BYTES:
        return jsonify({'error': f'File too large. Max size is {MAX_MEDIA_BYTES // (1024 * 1024)}MB'}), 413

    evolution = EvolutionService(current_clinic)

    try:
        result = evolution.send_media(
            conversation.phone_number,
            media_type=media_type,
            base64_data=b64_data,
            mimetype=mimetype,
            filename=filename,
            caption=caption
        )
    except Exception:
        logger.exception('Failed to send media on conversation %s', conversation_id)
        return jsonify({'error': 'Falha ao enviar a mídia'}), 500

    if isinstance(result, dict) and result.get('error'):
        return jsonify({'error': f"Failed to send media: {result['error']}"}), 502

    evolution_message_id = ((result or {}).get('key') or {}).get('id')

    # Persist our own copy and reference it by URL - storing multi-MB data
    # URIs inside the conversation JSONB bloats every later read of the
    # thread.
    asset = MediaAsset(
        clinic_id=current_clinic.id,
        mimetype=mimetype,
        filename=filename,
        data=base64.b64decode(b64_data),
    )
    db.session.add(asset)
    db.session.commit()

    conversation_service = ConversationService(current_clinic)

    # Sending media manually is a human takeover, same as text.
    took_over = conversation.status == ConversationStatus.ACTIVE
    if took_over:
        conversation_service.transfer_to_human(
            conversation, 'Atendente assumiu a conversa pelo painel'
        )

    message = conversation_service.add_message(
        conversation,
        'assistant',
        caption,
        evolution_id=evolution_message_id,
        message_type=media_type,
        media_url=asset.public_path,
        media_mimetype=mimetype,
        caption=caption or None,
        sent_via='dashboard'
    )

    return jsonify({
        'message': 'Media sent successfully',
        'took_over': took_over,
        'sent_message': message,
        'conversation': conversation.to_dict(include_messages=False)
    })

