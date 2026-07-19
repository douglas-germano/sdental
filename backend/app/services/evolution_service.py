import logging
from typing import Optional
import requests
import uuid

from flask import current_app

from app.utils.validators import normalize_phone
from app.utils.whatsapp_message import normalize_raw_message

logger = logging.getLogger(__name__)

# Safety caps for historical sync pagination - Evolution API's message-history
# endpoint contract varies across forks/versions, so these bound how much a
# single sync call can do regardless of what the server reports.
HISTORY_PAGE_SIZE = 100
HISTORY_MAX_PAGES = 40


class EvolutionService:
    """Service for interacting with Evolution API (WhatsApp)."""

    def __init__(self, clinic):
        """
        Initialize with global Evolution API config.
        """
        self.clinic = clinic
        self.api_url = current_app.config.get('EVOLUTION_API_URL')
        self.api_key = current_app.config.get('EVOLUTION_API_KEY')
        
        # Ensure clinic has an instance name
        if not self.clinic.evolution_instance_name:
            # Use only the clinic ID as instance name
            short_id = str(self.clinic.id).replace('-', '')[:12]
            self.clinic.evolution_instance_name = short_id
            from app import db
            db.session.commit()
            
        self.instance_name = self.clinic.evolution_instance_name

    def _get_headers(self) -> dict:
        """Get headers for API requests."""
        return {
            'apikey': self.api_key,
            'Content-Type': 'application/json'
        }

    def create_instance(self) -> dict:
        """
        Create a new WhatsApp instance for this clinic.
        Automatically configures webhook after creation.
        """
        if not self.api_url or not self.api_key:
            return {'error': 'Evolution API not configured globally'}

        url = f'{self.api_url}/instance/create'
        
        payload = {
            "instanceName": self.instance_name,
            "token": str(uuid.uuid4()), # Generate a random token for this instance
            "qrcode": True,
            "integration": "WHATSAPP-BAILEYS" 
        }

        try:
            response = requests.post(
                url,
                json=payload,
                headers=self._get_headers(),
                timeout=30
            )
            
            # If 403, instance might already exist, which is fine
            if response.status_code == 403:
                r_json = response.json()
                # Check if it's "instance already exists" error
                if "already in use" in str(r_json):
                    logger.info('Instance %s already exists, configuring webhook', self.instance_name)
                    # Configure webhook for existing instance
                    self._auto_configure_webhook()
                    return {'status': 'exists', 'instance': self.instance_name}
                    
            response.raise_for_status()
            logger.info('Instance %s created', self.instance_name)
            
            # Automatically configure webhook for new instance
            self._auto_configure_webhook()
            
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.error('Failed to create instance: %s', str(e))
            return {'error': str(e)}

    def _auto_configure_webhook(self):
        """
        Automatically configure webhook for this instance.
        Always uses production URL from BASE_URL environment variable.
        """
        try:
            # Always use BASE_URL from environment (production URL)
            base_url = current_app.config.get('BASE_URL')
            if not base_url:
                logger.warning('No BASE_URL configured, skipping auto webhook setup')
                return
            
            webhook_url = f"{base_url}/api/webhook/evolution"
            
            logger.info('Auto-configuring webhook for %s: %s', self.instance_name, webhook_url)
            self.set_webhook(webhook_url)
        except Exception as e:
            logger.error('Failed to auto-configure webhook: %s', str(e))


    def send_message(self, phone: str, message: str) -> dict:
        """
        Send a text message via WhatsApp.

        Args:
            phone: Phone number in format 5511999999999
            message: Text message to send

        Returns:
            API response dict
        """
        if not self.api_url or not self.api_key:
            logger.error('Evolution API not configured globally')
            return {'error': 'Evolution API not configured'}

        url = f'{self.api_url}/message/sendText/{self.instance_name}'

        # Evolution API v2 payload structure
        payload = {
            "number": phone,
            "text": message,  # Changed from textMessage to text usually works, but verifying
            "options": {
                "delay": 1200,
                "presence": "composing",
                "linkPreview": False
            }
        }
        
        # Some versions use this structure:
        # payload = {
        #    "number": phone,
        #    "textMessage": {
        #        "text": message
        #    }
        # }
        
        # Let's try the simple flat structure first but add options which might be required by some setups

        try:
            response = requests.post(
                url,
                json=payload,
                headers=self._get_headers(),
                timeout=30
            )
            
            # Log response body for debugging 400 errors
            if response.status_code == 400:
                logger.error('Evolution API 400 Error: %s', response.text)
                
            response.raise_for_status()
            logger.info('Message sent to %s via Evolution API', phone)
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.error('Failed to send message via Evolution API: %s', str(e))
            return {'error': str(e)}

    def send_presence(self, phone: str, presence: str = 'composing', delay_ms: int = 10000) -> None:
        """
        Best-effort "typing..." indicator to the patient while the bot is
        thinking. Never raises - presence is cosmetic and must not interfere
        with message processing.
        """
        if not self.api_url or not self.api_key:
            return
        try:
            requests.post(
                f'{self.api_url}/chat/sendPresence/{self.instance_name}',
                json={'number': phone, 'presence': presence, 'delay': delay_ms},
                headers=self._get_headers(),
                timeout=5
            )
        except requests.exceptions.RequestException as e:
            logger.debug('sendPresence failed (non-fatal): %s', e)

    def get_media_base64(self, evolution_message_id: str) -> Optional[dict]:
        """
        Download (and decrypt) a received media message through Evolution API.

        Returns {'base64': str, 'mimetype': str|None} or None on any failure.
        The raw CDN URL in the webhook payload is E2E-encrypted and expires,
        so this is the only reliable way to get displayable bytes.
        """
        if not self.api_url or not self.api_key or not evolution_message_id:
            return None

        url = f'{self.api_url}/chat/getBase64FromMediaMessage/{self.instance_name}'
        payload = {
            'message': {'key': {'id': evolution_message_id}},
            'convertToMp4': False,
        }
        try:
            response = requests.post(url, json=payload, headers=self._get_headers(), timeout=30)
            response.raise_for_status()
            data = response.json() or {}
            b64 = data.get('base64') or data.get('media')
            if not b64:
                return None
            return {'base64': b64, 'mimetype': data.get('mimetype')}
        except (requests.exceptions.RequestException, ValueError) as e:
            logger.warning('Failed to fetch media %s via Evolution API: %s', evolution_message_id, e)
            return None

    def send_media(
        self,
        phone: str,
        media_type: str,
        base64_data: str,
        mimetype: str,
        filename: Optional[str] = None,
        caption: str = ''
    ) -> dict:
        """
        Send a media message (image, audio or document) via WhatsApp.

        Args:
            phone: Phone number in format 5511999999999
            media_type: 'image', 'audio' or 'document'
            base64_data: Raw base64-encoded file content (no data: prefix)
            mimetype: MIME type of the file, e.g. "image/png"
            filename: Optional file name (used for documents)
            caption: Optional caption text

        Returns:
            API response dict
        """
        if not self.api_url or not self.api_key:
            logger.error('Evolution API not configured globally')
            return {'error': 'Evolution API not configured'}

        # Audio uses a dedicated endpoint in Evolution API v2
        if media_type == 'audio':
            url = f'{self.api_url}/message/sendWhatsAppAudio/{self.instance_name}'
            payload = {
                "number": phone,
                "audio": base64_data,
                "options": {"delay": 1200}
            }
        else:
            url = f'{self.api_url}/message/sendMedia/{self.instance_name}'
            payload = {
                "number": phone,
                "mediatype": media_type,
                "mimetype": mimetype,
                "media": base64_data,
                "fileName": filename or f"file.{mimetype.split('/')[-1]}",
                "caption": caption,
                "options": {"delay": 1200}
            }

        try:
            response = requests.post(
                url,
                json=payload,
                headers=self._get_headers(),
                timeout=60
            )

            if response.status_code == 400:
                logger.error('Evolution API 400 Error: %s', response.text)

            response.raise_for_status()
            logger.info('Media (%s) sent to %s via Evolution API', media_type, phone)
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.error('Failed to send media via Evolution API: %s', str(e))
            return {'error': str(e)}

    def get_instance_status(self) -> dict:
        """
        Check the status of the WhatsApp instance.

        Returns:
            Instance status dict
        """
        if not self.api_url or not self.api_key:
            return {'error': 'Evolution API not configured', 'connected': False}

        url = f'{self.api_url}/instance/connectionState/{self.instance_name}'

        try:
            response = requests.get(
                url,
                headers=self._get_headers(),
                timeout=10
            )
            
            # If 404, instance doesn't exist
            if response.status_code == 404:
                return {'connected': False, 'state': 'not_found', 'instance': self.instance_name}
                
            response.raise_for_status()
            data = response.json()

            # Handle potential nested structure (Evolution API v2)
            instance_data = data.get('instance', {}) if 'instance' in data else data
            state = instance_data.get('state')

            result = {
                'connected': state == 'open',
                'state': state,
                'instance': self.instance_name
            }

            # When connected, try to surface the linked WhatsApp number for the wizard's success screen
            if state == 'open':
                owner = instance_data.get('owner') or instance_data.get('ownerJid')
                if owner:
                    result['phone_number'] = owner.split('@')[0].split(':')[0]

            return result
        except requests.exceptions.RequestException as e:
            logger.error('Failed to get instance status: %s', str(e))
            return {'error': str(e), 'connected': False}

    def set_webhook(self, webhook_url: str) -> dict:
        """
        Configure webhook URL for receiving messages.

        Args:
            webhook_url: URL to receive webhook events

        Returns:
            API response dict
        """
        if not self.api_url or not self.api_key:
            return {'error': 'Evolution API not configured'}

        url = f'{self.api_url}/webhook/set/{self.instance_name}'

        webhook_config = {
            'enabled': True,
            'url': webhook_url,
            'webhookByEvents': True,
            'events': [
                'MESSAGES_UPSERT',
                'MESSAGES_UPDATE',
                'PRESENCE_UPDATE'
            ]
        }

        # Evolution must echo this back on every callback so webhook_auth_required
        # can authenticate it (see utils/webhook_auth.py). Without it, WEBHOOK_SECRET
        # being set on our side is not enough - Evolution was never told to send the
        # header, so every real callback still gets rejected with 401 and the AI
        # never sees a message to reply to.
        webhook_secret = current_app.config.get('WEBHOOK_SECRET')
        if webhook_secret:
            webhook_config['headers'] = {'X-Webhook-Secret': webhook_secret}

        payload = {'webhook': webhook_config}

        try:
            response = requests.post(
                url,
                json=payload,
                headers=self._get_headers(),
                timeout=30
            )
            response.raise_for_status()
            logger.info('Webhook configured for instance %s', self.instance_name)
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.error('Failed to set webhook: %s', str(e))
            return {'error': str(e)}

    # WhatsApp Web QR codes are only valid for a short window before the
    # underlying pairing session rotates - the wizard uses this to know when
    # to automatically request a fresh code.
    QR_CODE_TTL_SECONDS = 30

    def get_qr_code(self) -> Optional[str]:
        """
        Get QR code for connecting WhatsApp.

        Returns:
            Base64 QR code string or None
        """
        result = self.get_qr_code_info()
        return result.get('qrcode') if result else None

    def get_qr_code_info(self) -> Optional[dict]:
        """
        Get QR code for connecting WhatsApp, plus metadata for the connection wizard.

        Returns:
            Dict with 'qrcode' (base64) and 'expires_in' (seconds), or None on failure
        """
        if not self.api_url or not self.api_key:
            return None

        # Try to connect (this usually triggers QR code generation if not connected)
        url = f'{self.api_url}/instance/connect/{self.instance_name}'

        try:
            response = requests.get(
                url,
                headers=self._get_headers(),
                timeout=30
            )
            response.raise_for_status()
            data = response.json()
            base64_qr = data.get('base64')
            if not base64_qr:
                return None
            return {'qrcode': base64_qr, 'expires_in': self.QR_CODE_TTL_SECONDS}
        except requests.exceptions.RequestException as e:
            logger.error('Failed to get QR code: %s', str(e))
            return None

    @staticmethod
    def _extract_history_records(payload) -> Optional[list]:
        """
        Pull the list of raw message records out of a chat/findMessages
        response, tolerating the different response shapes seen across
        Evolution API versions/forks: a flat list, {"records": [...]},
        {"messages": [...]}, or {"messages": {"records": [...]}}.

        Returns None if no record list could be found (caller stops paging).
        """
        if isinstance(payload, list):
            return payload
        if not isinstance(payload, dict):
            return None
        if isinstance(payload.get('records'), list):
            return payload['records']
        messages = payload.get('messages')
        if isinstance(messages, list):
            return messages
        if isinstance(messages, dict) and isinstance(messages.get('records'), list):
            return messages['records']
        return None

    def fetch_chat_history(self, phone: str, max_messages: int = 2000) -> list:
        """
        Fetch as much of a contact's WhatsApp message history as Evolution API
        has stored (requires the Evolution API server itself to have
        persistence enabled - it only returns what it has kept), paginating
        through chat/findMessages until exhausted, `max_messages` is reached,
        or a safety page cap is hit.

        Returns a list of normalized dicts (see
        app.utils.whatsapp_message.normalize_raw_message), including both
        directions (patient messages and anything sent from the linked phone).
        """
        if not self.api_url or not self.api_key:
            logger.error('Evolution API not configured globally')
            return []

        jid = f'{normalize_phone(phone)}@s.whatsapp.net'
        url = f'{self.api_url}/chat/findMessages/{self.instance_name}'

        normalized = []
        seen_evolution_ids = set()

        for page in range(1, HISTORY_MAX_PAGES + 1):
            payload = {
                'where': {'key': {'remoteJid': jid}},
                'page': page,
                'offset': HISTORY_PAGE_SIZE,
                # Some Evolution API versions use limit/skip instead of
                # page/offset - send both so either contract is satisfied.
                'limit': HISTORY_PAGE_SIZE,
            }

            try:
                response = requests.post(
                    url,
                    json=payload,
                    headers=self._get_headers(),
                    timeout=30
                )
                response.raise_for_status()
            except requests.exceptions.RequestException as e:
                logger.error('Failed to fetch chat history (page %s): %s', page, str(e))
                break

            records = self._extract_history_records(response.json())
            if not records:
                break

            new_this_page = 0
            for raw in records:
                message = normalize_raw_message(raw)
                if not message:
                    continue
                evo_id = message.get('evolution_id')
                if evo_id:
                    if evo_id in seen_evolution_ids:
                        continue
                    seen_evolution_ids.add(evo_id)
                normalized.append(message)
                new_this_page += 1

            # The server ignored pagination (returned the same page again) or
            # this page was entirely already-seen messages - stop instead of
            # looping forever.
            if new_this_page == 0:
                break

            if len(records) < HISTORY_PAGE_SIZE or len(normalized) >= max_messages:
                break

        logger.info(
            'Fetched %d historical messages for %s via Evolution API',
            len(normalized), phone
        )
        return normalized[:max_messages]
