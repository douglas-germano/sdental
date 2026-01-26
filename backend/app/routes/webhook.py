import logging
from flask import Blueprint, request, jsonify

from app.models import Clinic
from app.services.claude_service import ClaudeService
from app.services.evolution_service import EvolutionService
from app.services.conversation_service import ConversationService
from app.utils.webhook_auth import webhook_auth_required
from app.utils.rate_limiter import limiter

logger = logging.getLogger(__name__)

bp = Blueprint('webhook', __name__, url_prefix='/api/webhook')


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

        # Check event type
        event = payload.get('event')
        if event != 'messages.upsert':
            return jsonify({'status': 'ignored', 'reason': 'Not a message event'})

        instance_name = payload.get('instance')
        data = payload.get('data', {})

        # Extract message info
        key = data.get('key', {})
        remote_jid = key.get('remoteJid', '')
        from_me = key.get('fromMe', False)

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

        if not message_text:
            return jsonify({'status': 'ignored', 'reason': 'No text content'})

        logger.info('Received message from %s: %s', phone, message_text[:50])

        # Find clinic by instance name
        clinic = Clinic.query.filter_by(
            evolution_instance_name=instance_name,
            active=True
        ).first()

        if not clinic:
            logger.warning('No clinic found for instance: %s', instance_name)
            return jsonify({'error': 'Clinic not found'}), 404

        # Process message
        try:
            conversation_service = ConversationService(clinic)
            conversation = conversation_service.get_or_create_conversation(phone)

            claude_service = ClaudeService(clinic)
            response_text = claude_service.process_message(conversation, message_text)

            # Send response via Evolution API
            evolution_service = EvolutionService(clinic)
            send_result = evolution_service.send_message(phone, response_text)

            if 'error' in send_result:
                logger.error('Failed to send response: %s', send_result['error'])

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
