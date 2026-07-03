import logging
from flask import Blueprint, request, jsonify

from app.models import Clinic, Conversation, ConversationStatus
from app.services.claude_service import ClaudeService
from app.services.evolution_service import EvolutionService
from app.services.conversation_service import ConversationService
from app.services.realtime_service import publish_event
from app.utils.validators import normalize_phone
from app.utils.webhook_auth import webhook_auth_required
from app.utils.rate_limiter import limiter

logger = logging.getLogger(__name__)

bp = Blueprint('webhook', __name__, url_prefix='/api/webhook')

# Evolution API ACK status -> our internal message status
ACK_STATUS_MAP = {
    'PENDING': 'sent',
    'SERVER_ACK': 'sent',
    'DELIVERY_ACK': 'delivered',
    'READ': 'read',
    'PLAYED': 'read',
}

MEDIA_MESSAGE_KEYS = {
    'imageMessage': 'image',
    'audioMessage': 'audio',
    'documentMessage': 'document',
    'documentWithCaptionMessage': 'document',
    'stickerMessage': 'image',
}

MEDIA_PLACEHOLDER_TEXT = {
    'image': 'Imagem enviada',
    'audio': 'Audio enviado',
    'document': 'Documento enviado',
}


def _find_clinic_by_instance(instance_name: str):
    return Clinic.query.filter_by(
        evolution_instance_name=instance_name,
        active=True
    ).first()


def _extract_media(message_obj: dict):
    """Return (message_type, media_url, mimetype, caption) for the first media key found, or None."""
    for key, media_type in MEDIA_MESSAGE_KEYS.items():
        media = message_obj.get(key)
        if not media:
            continue
        # documentWithCaptionMessage nests the real document payload one
        # level deeper: {"message": {"documentMessage": {...}}}
        if key == 'documentWithCaptionMessage':
            media = media.get('message', {}).get('documentMessage', media)
        url = media.get('url') or media.get('directPath')
        mimetype = media.get('mimetype') or media.get('mimeType')
        caption = media.get('caption', '')
        return media_type, url, mimetype, caption
    return None


@bp.route('/evolution', methods=['POST'])
@limiter.limit("100 per minute")
@webhook_auth_required
def evolution_webhook():
    """
    Receive messages from Evolution API webhook.

    Expected payload structure:
    {
        "event": "messages.upsert",
        "instance": "instance_name",
        "data": {
            "key": {
                "remoteJid": "5511999999999@s.whatsapp.net",
                "fromMe": false,
                "id": "message_id"
            },
            "message": {
                "conversation": "message text"
            },
            "messageTimestamp": "1234567890"
        }
    }
    """
    try:
        payload = request.get_json()

        if not payload:
            return jsonify({'error': 'No payload'}), 400

        event = payload.get('event')
        instance_name = payload.get('instance')

        if event == 'messages.update':
            return _handle_status_update(instance_name, payload.get('data'))

        if event == 'presence.update':
            return _handle_presence_update(instance_name, payload.get('data', {}))

        if event != 'messages.upsert':
            return jsonify({'status': 'ignored', 'reason': 'Not a handled event'})

        data = payload.get('data', {})

        # Extract message info
        key = data.get('key', {})
        remote_jid = key.get('remoteJid', '')
        from_me = key.get('fromMe', False)
        evolution_message_id = key.get('id')

        # Ignore messages sent by us
        if from_me:
            return jsonify({'status': 'ignored', 'reason': 'Message from self'})

        # Ignore group messages
        if '@g.us' in remote_jid:
            return jsonify({'status': 'ignored', 'reason': 'Group message'})

        # Extract phone number
        phone = remote_jid.split('@')[0]

        # Get message content
        message_obj = data.get('message', {})
        message_text = (
            message_obj.get('conversation') or
            message_obj.get('extendedTextMessage', {}).get('text') or
            ''
        )
        media = None if message_text else _extract_media(message_obj)

        if not message_text and not media:
            return jsonify({'status': 'ignored', 'reason': 'No text or media content'})

        clinic = _find_clinic_by_instance(instance_name)

        if not clinic:
            logger.warning('No clinic found for instance: %s', instance_name)
            return jsonify({'error': 'Clinic not found'}), 404

        conversation_service = ConversationService(clinic)
        conversation = conversation_service.get_or_create_conversation(phone)

        # Media messages: the bot can't process them, store and hand off to a human
        if media:
            media_type, media_url, mimetype, caption = media
            logger.info('Received %s message from %s', media_type, phone)

            # Transfer first so the new_message event we publish next carries
            # the already-updated status - otherwise the open chat UI shows a
            # stale "active" status until the page is reloaded.
            if conversation.status != ConversationStatus.TRANSFERRED_TO_HUMAN:
                conversation_service.transfer_to_human(
                    conversation,
                    f'Paciente enviou {media_type} - requer atendimento humano'
                )

            # Content is never left empty: an empty string here would later be
            # sent to the Claude API as an empty text block and get rejected.
            content = caption or MEDIA_PLACEHOLDER_TEXT.get(media_type, 'Midia enviada')
            conversation_service.add_message(
                conversation,
                'user',
                content,
                evolution_id=evolution_message_id,
                message_type=media_type,
                media_url=media_url,
                media_mimetype=mimetype,
                caption=caption or None
            )

            return jsonify({'status': 'processed', 'reason': 'Media message routed to human'})

        logger.info('Received message from %s: %s', phone, message_text[:50])

        # Check if AI agent is enabled
        if not clinic.agent_enabled:
            logger.info('Agent disabled for clinic %s, ignoring message', clinic.name)
            return jsonify({'status': 'ignored', 'reason': 'Agent disabled'})

        # Process message
        try:
            # Check if conversation is paused (transferred to human)
            if conversation.status == ConversationStatus.TRANSFERRED_TO_HUMAN:
                logger.info('Conversation %s is paused (human support), ignoring message', conversation.id)
                conversation_service.add_message(
                    conversation, 'user', message_text, evolution_id=evolution_message_id
                )
                return jsonify({'status': 'ignored', 'reason': 'Conversation paused'})

            claude_service = ClaudeService(clinic)
            response_text = claude_service.process_message(conversation, message_text)

            # Attach the inbound Evolution id to the just-stored user message
            conversation_service.attach_evolution_id_to_last_inbound(conversation, evolution_message_id)

            # Send response via Evolution API
            evolution_service = EvolutionService(clinic)
            send_result = evolution_service.send_message(phone, response_text)

            if 'error' in send_result:
                logger.error('Failed to send response: %s', send_result['error'])
            else:
                reply_evolution_id = (send_result.get('key') or {}).get('id')
                if reply_evolution_id:
                    conversation_service.attach_evolution_id_to_last_reply(conversation, reply_evolution_id)

            return jsonify({
                'status': 'processed',
                'response_sent': 'error' not in send_result
            })

        except ValueError as e:
            # Claude API not configured
            logger.error('Service error: %s', str(e))
            return jsonify({'error': str(e)}), 500

    except Exception as e:
        logger.exception('Error processing webhook: %s', str(e))
        return jsonify({'error': 'Internal server error'}), 500


def _handle_status_update(instance_name: str, data):
    """Handle a messages.update event carrying WhatsApp delivery/read ACKs."""
    if data is None:
        return jsonify({'status': 'ignored', 'reason': 'No data'})

    entries = data if isinstance(data, list) else [data]

    clinic = _find_clinic_by_instance(instance_name)
    if not clinic:
        return jsonify({'status': 'ignored', 'reason': 'Clinic not found'})

    conversation_service = ConversationService(clinic)
    updated_count = 0

    for entry in entries:
        key = entry.get('key', {})
        evolution_message_id = key.get('id')
        remote_jid = key.get('remoteJid', '')
        raw_status = entry.get('update', {}).get('status') or entry.get('status')

        if not evolution_message_id or not raw_status:
            continue

        our_status = ACK_STATUS_MAP.get(str(raw_status).upper())
        if not our_status:
            continue

        phone = remote_jid.split('@')[0] if remote_jid else None
        conversation = (
            conversation_service.find_conversation_with_message(phone, evolution_message_id)
            if phone else None
        )

        if conversation:
            result = conversation_service.update_message_status(conversation, evolution_message_id, our_status)
            if result:
                updated_count += 1

    return jsonify({'status': 'processed', 'updated': updated_count})


def _handle_presence_update(instance_name: str, data: dict):
    """Handle a presence.update event (typing/recording indicator)."""
    clinic = _find_clinic_by_instance(instance_name)
    if not clinic:
        return jsonify({'status': 'ignored', 'reason': 'Clinic not found'})

    remote_jid = data.get('id', '')
    if '@g.us' in remote_jid:
        return jsonify({'status': 'ignored', 'reason': 'Group presence'})

    phone = remote_jid.split('@')[0] if remote_jid else None
    presences = data.get('presences', {})
    presence_entry = next(iter(presences.values()), {}) if isinstance(presences, dict) else {}
    state = presence_entry.get('lastKnownPresence')

    if not phone or not state:
        return jsonify({'status': 'ignored', 'reason': 'Incomplete presence data'})

    normalized = normalize_phone(phone)
    conversation = Conversation.query.filter_by(
        clinic_id=clinic.id,
        phone_number=normalized
    ).order_by(Conversation.last_message_at.desc()).first()

    if not conversation:
        return jsonify({'status': 'ignored', 'reason': 'No conversation for this contact'})

    publish_event(str(clinic.id), 'typing', {
        'conversation_id': str(conversation.id),
        'is_typing': state in ('composing', 'recording'),
        'state': state
    })

    return jsonify({'status': 'processed'})


@bp.route('/evolution/status', methods=['POST'])
@limiter.limit("100 per minute")
@webhook_auth_required
def evolution_status_webhook():
    """
    Receive connection status updates from Evolution API.
    """
    try:
        payload = request.get_json()

        event = payload.get('event')
        instance = payload.get('instance')
        state = payload.get('data', {}).get('state')

        logger.info('Evolution status update: %s - %s - %s', instance, event, state)

        return jsonify({'status': 'received'})

    except Exception as e:
        logger.error('Error processing status webhook: %s', str(e))
        return jsonify({'error': str(e)}), 500
