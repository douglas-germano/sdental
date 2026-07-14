import base64
import binascii
import logging

from flask import Blueprint, request, jsonify
from flask_limiter.util import get_remote_address

from app import db
from app.models import (
    Clinic, Conversation, ConversationStatus, Patient,
    MediaAsset, MAX_MEDIA_BYTES,
)
from app.services.claude_service import ClaudeService
from app.services.evolution_service import EvolutionService
from app.services.conversation_service import ConversationService
from app.services.email_service import EmailService
from app.services.message_processor import enqueue_reply
from app.services.outreach_service import is_opt_out_message
from app.services.realtime_service import publish_event
from app.utils.datetime_utils import utcnow
from app.utils.validators import normalize_phone
from app.utils.webhook_auth import webhook_auth_required
from app.utils.rate_limiter import limiter
from app.utils.whatsapp_message import extract_media, extract_text, MEDIA_PLACEHOLDER_TEXT

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


def _find_clinic_by_instance(instance_name: str):
    return Clinic.query.filter_by(
        evolution_instance_name=instance_name,
        active=True
    ).first()


def _webhook_rate_limit_key():
    """
    Key by the clinic's Evolution instance name instead of remote address.
    All clinics' inbound traffic arrives from the same Evolution gateway IP,
    so an IP-keyed limit is one shared bucket for the whole platform - a
    burst from one clinic would starve every other clinic's webhook calls.
    Falls back to the IP if the payload doesn't carry an instance name.
    """
    payload = request.get_json(silent=True) or {}
    return payload.get('instance') or get_remote_address()


@bp.route('/evolution', methods=['POST'])
@limiter.limit("100 per minute", key_func=_webhook_rate_limit_key)
@webhook_auth_required
def evolution_webhook():
    """
    Receive events from Evolution API webhook: inbound messages
    (messages.upsert), delivery/read ACKs (messages.update), typing presence
    (presence.update) and connection state changes (connection.update).

    Inbound patient messages are STORED synchronously (so they are never
    lost and duplicates are detectable) and answered asynchronously by the
    message_processor pipeline, which debounces bursts and retries delivery.
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

        if event == 'connection.update':
            return _handle_connection_update(instance_name, payload.get('data', {}))

        if event != 'messages.upsert':
            return jsonify({'status': 'ignored', 'reason': 'Not a handled event'})

        data = payload.get('data', {})

        # Extract message info
        key = data.get('key', {})
        remote_jid = key.get('remoteJid', '')
        from_me = key.get('fromMe', False)
        evolution_message_id = key.get('id')

        # Ignore group messages
        if '@g.us' in remote_jid:
            return jsonify({'status': 'ignored', 'reason': 'Group message'})

        # Extract phone number
        phone = remote_jid.split('@')[0]

        # Get message content
        message_obj = data.get('message', {})
        message_text = extract_text(message_obj)
        media = None if message_text else extract_media(message_obj)

        if not message_text and not media:
            return jsonify({'status': 'ignored', 'reason': 'No text or media content'})

        clinic = _find_clinic_by_instance(instance_name)

        if not clinic:
            logger.warning('No clinic found for instance: %s', instance_name)
            return jsonify({'error': 'Clinic not found'}), 404

        conversation_service = ConversationService(clinic)
        conversation = conversation_service.get_or_create_conversation(phone)

        # Idempotency: Evolution retries webhook deliveries (e.g. on slow
        # responses) and, depending on instance config, also echoes messages
        # sent through its own API back as fromMe upserts. A message id we
        # already stored means this delivery is a duplicate.
        if evolution_message_id and conversation.find_message(evolution_message_id):
            return jsonify({'status': 'duplicate', 'reason': 'Message already processed'})

        # Sent from the clinic's own WhatsApp number (fromMe)
        if from_me:
            # The echo of a bot reply can arrive before the send result had
            # its id attached - recognize it by content instead of treating
            # it as a human takeover.
            if message_text and conversation.attach_evolution_id_by_content(
                evolution_message_id, message_text
            ):
                db.session.commit()
                return jsonify({'status': 'processed', 'reason': 'Own message echo'})

            # Genuinely sent from the linked phone (e.g. a staff member
            # replying manually). Keep it in the conversation so it shows up
            # in the dashboard and the AI has full context, but hand off to a
            # human since someone is already handling this chat outside the
            # bot.
            if media:
                media_type, media_url, mimetype, caption = media
                content = caption or MEDIA_PLACEHOLDER_TEXT.get(media_type, 'Midia enviada')
            else:
                media_type, media_url, mimetype, caption = 'text', None, None, None
                content = message_text

            if conversation.status != ConversationStatus.TRANSFERRED_TO_HUMAN:
                conversation_service.transfer_to_human(
                    conversation,
                    'Mensagem enviada diretamente pelo WhatsApp (fora da plataforma)'
                )

            conversation_service.add_message(
                conversation,
                'assistant',
                content,
                evolution_id=evolution_message_id,
                message_type=media_type,
                media_url=media_url,
                media_mimetype=mimetype,
                caption=caption,
                sent_via='whatsapp_app'
            )
            return jsonify({'status': 'processed', 'reason': 'Message from self stored'})

        if media:
            return _handle_inbound_media(
                clinic, conversation_service, conversation,
                media, evolution_message_id, phone
            )

        logger.info('Received message from %s: %s', phone, message_text[:50])

        # Store the patient's message immediately: it must reach the
        # dashboard (and the dedup check above) regardless of what happens
        # to the AI reply.
        conversation_service.add_message(
            conversation, 'user', message_text, evolution_id=evolution_message_id
        )

        # Opt-out handling. If the patient asks to stop proactive contact
        # ("SAIR"), honour it immediately - independently of the agent being
        # enabled - and confirm. Reactive replies keep working; only
        # agent-initiated (proactive) messages are suppressed.
        if is_opt_out_message(message_text):
            patient = conversation.patient or Patient.query.filter_by(
                clinic_id=clinic.id, phone=phone
            ).first()
            if patient and not patient.whatsapp_opt_out:
                patient.opt_out_whatsapp()
                db.session.commit()
            opt_out_reply = (
                'Pronto! Você não receberá mais mensagens automáticas nossas. '
                'Se precisar de algo, é só chamar por aqui. 😊'
            )
            conversation_service.add_message(conversation, 'assistant', opt_out_reply)
            EvolutionService(clinic).send_message(phone, opt_out_reply)
            return jsonify({'status': 'processed', 'reason': 'Opt-out recorded'})

        # Agent switched off: this is "manual mode", never a black hole - the
        # message stays stored and visible in the dashboard, we just don't
        # generate a reply.
        if not clinic.agent_enabled:
            logger.info('Agent disabled for clinic %s, message stored for manual handling', clinic.name)
            return jsonify({'status': 'stored', 'reason': 'Agent disabled - stored for manual handling'})

        # Conversation paused (human support): same, store-only.
        if conversation.status == ConversationStatus.TRANSFERRED_TO_HUMAN:
            logger.info('Conversation %s is paused (human support), message stored', conversation.id)
            return jsonify({'status': 'stored', 'reason': 'Conversation paused'})

        # Hand off to the background pipeline (debounced burst aggregation,
        # send retries, failure marking).
        mode = enqueue_reply(clinic, conversation, phone)
        return jsonify({'status': 'processed', 'mode': mode})

    except Exception as e:
        logger.exception('Error processing webhook: %s', str(e))
        return jsonify({'error': 'Internal server error'}), 500


def _handle_inbound_media(clinic, conversation_service, conversation, media, evolution_message_id, phone):
    """
    Store an inbound media message. Media bytes are copied into our own
    storage when possible (WhatsApp CDN URLs are E2E-encrypted and expire).
    Voice notes are transcribed so the bot can keep handling the
    conversation; other media (or failed transcriptions) hand off to a human.
    """
    media_type, media_url, mimetype, caption = media
    logger.info('Received %s message from %s', media_type, phone)

    # Try to persist our own copy of the media
    asset_b64 = None
    fetched = EvolutionService(clinic).get_media_base64(evolution_message_id)
    if fetched:
        try:
            raw = base64.b64decode(fetched['base64'], validate=True)
            if 0 < len(raw) <= MAX_MEDIA_BYTES:
                asset = MediaAsset(
                    clinic_id=clinic.id,
                    mimetype=fetched.get('mimetype') or mimetype or 'application/octet-stream',
                    data=raw,
                )
                db.session.add(asset)
                db.session.commit()
                media_url = asset.public_path
                mimetype = asset.mimetype
                asset_b64 = fetched['base64']
        except (binascii.Error, ValueError) as e:
            logger.warning('Discarding undecodable media payload: %s', e)

    # Voice notes: transcribe and keep the bot in the loop
    if (
        media_type == 'audio'
        and asset_b64
        and clinic.agent_enabled
        and conversation.status == ConversationStatus.ACTIVE
    ):
        transcript = ClaudeService(clinic).transcribe_audio(asset_b64, mimetype)
        if transcript:
            conversation_service.add_message(
                conversation,
                'user',
                transcript,
                evolution_id=evolution_message_id,
                message_type='audio',
                media_url=media_url,
                media_mimetype=mimetype,
                caption=transcript
            )
            mode = enqueue_reply(clinic, conversation, phone)
            return jsonify({'status': 'processed', 'mode': mode, 'transcribed': True})

    # Everything else (images, documents, failed transcription): store and
    # hand off to a human. Transfer first so the new_message event carries
    # the already-updated status.
    if conversation.status != ConversationStatus.TRANSFERRED_TO_HUMAN:
        conversation_service.transfer_to_human(
            conversation,
            f'Paciente enviou {media_type} - requer atendimento humano'
        )

    # Content is never left empty: an empty string here would later be
    # sent to the LLM as an empty text block and get rejected.
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


def _handle_connection_update(instance_name: str, data: dict):
    """
    Track the WhatsApp instance's connection state and alert the clinic when
    it drops - a disconnected instance means the bot silently stops working,
    so this is the product's fire alarm.
    """
    state = (data or {}).get('state') or (data or {}).get('connection')
    if not state:
        return jsonify({'status': 'ignored', 'reason': 'No state in payload'})
    state = str(state).lower()

    clinic = Clinic.query.filter_by(evolution_instance_name=instance_name).first()
    if not clinic:
        return jsonify({'status': 'ignored', 'reason': 'Clinic not found'})

    previous = clinic.whatsapp_connection_state
    clinic.whatsapp_connection_state = state
    clinic.whatsapp_connection_updated_at = utcnow()
    db.session.commit()

    publish_event(str(clinic.id), 'connection_status', {'state': state})
    logger.info('WhatsApp connection for clinic %s: %s -> %s', clinic.id, previous, state)

    if state == 'close' and previous != 'close':
        try:
            EmailService().send(
                clinic.email,
                clinic.name,
                'WhatsApp desconectado - ação necessária',
                (
                    f'<p>Olá, {clinic.name}!</p>'
                    '<p>O WhatsApp da sua clínica foi <strong>desconectado</strong> e o '
                    'assistente parou de receber mensagens dos pacientes.</p>'
                    '<p>Acesse <strong>Configurações &rarr; WhatsApp</strong> no painel '
                    'SDental e escaneie o QR Code novamente para reconectar.</p>'
                )
            )
        except Exception as e:
            logger.error('Failed to send disconnect alert email: %s', e)

    return jsonify({'status': 'processed', 'state': state})


@bp.route('/evolution/status', methods=['POST'])
@limiter.limit("100 per minute", key_func=_webhook_rate_limit_key)
@webhook_auth_required
def evolution_status_webhook():
    """
    Receive connection status updates from Evolution API (dedicated URL -
    the same connection.update payload may also arrive on the main webhook).
    """
    try:
        payload = request.get_json() or {}

        event = payload.get('event')
        instance = payload.get('instance')
        data = payload.get('data', {}) or {}

        logger.info('Evolution status update: %s - %s - %s', instance, event, data.get('state'))

        if event == 'connection.update' or data.get('state'):
            return _handle_connection_update(instance, data)

        return jsonify({'status': 'received'})

    except Exception as e:
        logger.error('Error processing status webhook: %s', str(e))
        return jsonify({'error': str(e)}), 500
