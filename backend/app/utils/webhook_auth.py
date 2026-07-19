"""
Webhook authentication utilities.
"""
import hmac
import hashlib
import logging
import os
from functools import wraps
from flask import current_app, request, jsonify

logger = logging.getLogger(__name__)


def verify_webhook_signature(payload: bytes, signature: str, secret: str) -> bool:
    """
    Verify webhook signature using HMAC-SHA256.

    Args:
        payload: The raw request body
        signature: The signature from the request header
        secret: The webhook secret key

    Returns:
        True if signature is valid, False otherwise
    """
    if not signature or not secret:
        return False

    expected_signature = hmac.new(
        secret.encode('utf-8'),
        payload,
        hashlib.sha256
    ).hexdigest()

    return hmac.compare_digest(signature, expected_signature)


def webhook_auth_required(fn):
    """
    Decorator to require webhook authentication.

    Accepts an X-Webhook-Secret header, an X-Webhook-Signature HMAC header, or
    (Evolution API's actual mechanism) an "apikey" field in the JSON body
    matching EVOLUTION_API_KEY. Can be bypassed in development mode with
    WEBHOOK_AUTH_DISABLED=true.
    """
    @wraps(fn)
    def wrapper(*args, **kwargs):
        # Allow bypass in development only - never in production, even if the
        # env var is accidentally left set after a local-dev copy/paste.
        if (
            os.getenv('WEBHOOK_AUTH_DISABLED', '').lower() == 'true'
            and os.getenv('FLASK_ENV') != 'production'
        ):
            return fn(*args, **kwargs)

        webhook_secret = current_app.config.get('WEBHOOK_SECRET')

        # Fail closed: without a configured secret there is no way to tell a
        # real Evolution API callback from a forged one (the instance name is
        # derivable from the clinic UUID), so reject rather than let every
        # webhook call through unauthenticated.
        if not webhook_secret:
            return jsonify({'error': 'Webhook authentication not configured'}), 401

        # Check for simple secret header
        request_secret = request.headers.get('X-Webhook-Secret')
        if request_secret and hmac.compare_digest(request_secret, webhook_secret):
            return fn(*args, **kwargs)

        # Check for signature-based auth
        signature = request.headers.get('X-Webhook-Signature')
        if signature:
            if verify_webhook_signature(request.get_data(), signature, webhook_secret):
                return fn(*args, **kwargs)

        body = request.get_json(silent=True)

        # Evolution API (confirmed via production diagnostics) doesn't send a
        # custom header at all - it embeds its own "apikey" field in the JSON
        # body of every event payload instead. In Evolution's default global-key
        # auth mode that value is the same EVOLUTION_API_KEY we use to call
        # Evolution ourselves (see EvolutionService._get_headers), so accept a
        # body apikey that matches it as proof the call is really from Evolution.
        evolution_key = current_app.config.get('EVOLUTION_API_KEY')
        body_apikey = body.get('apikey') if isinstance(body, dict) else None
        if evolution_key and isinstance(body_apikey, str) and hmac.compare_digest(body_apikey, evolution_key):
            return fn(*args, **kwargs)

        # Diagnostic breadcrumb: header names and body *key names* only (never
        # values - secret, apikey or otherwise) - lets us tell "caller sent no
        # auth signal at all" apart from "sent one we don't recognize", and
        # whether the caller (Evolution API / Kiwify) authenticates via a
        # header or via a field inside the JSON body instead, without needing
        # a live debugger on the caller's side.
        body_keys = sorted(body.keys()) if isinstance(body, dict) else None
        logger.warning(
            'Webhook auth rejected for %s: no valid X-Webhook-Secret/X-Webhook-Signature. '
            'Headers received: %s | Body top-level keys: %s | instance=%r',
            request.path, sorted(request.headers.keys()), body_keys,
            (body or {}).get('instance') if isinstance(body, dict) else None
        )
        return jsonify({'error': 'Invalid webhook authentication'}), 401

    return wrapper
