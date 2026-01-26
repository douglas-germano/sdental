"""
Webhook authentication utilities.
"""
import hmac
import hashlib
import os
from functools import wraps
from flask import request, jsonify


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

    Checks for X-Webhook-Secret header or signature validation.
    Can be bypassed in development mode with WEBHOOK_AUTH_DISABLED=true.
    """
    @wraps(fn)
    def wrapper(*args, **kwargs):
        # Allow bypass in development
        if os.getenv('WEBHOOK_AUTH_DISABLED', '').lower() == 'true':
            return fn(*args, **kwargs)

        webhook_secret = os.getenv('WEBHOOK_SECRET')

        # If no secret configured, allow all requests (backward compatibility)
        if not webhook_secret:
            return fn(*args, **kwargs)

        # Check for simple secret header
        request_secret = request.headers.get('X-Webhook-Secret')
        if request_secret and hmac.compare_digest(request_secret, webhook_secret):
            return fn(*args, **kwargs)

        # Check for signature-based auth
        signature = request.headers.get('X-Webhook-Signature')
        if signature:
            if verify_webhook_signature(request.get_data(), signature, webhook_secret):
                return fn(*args, **kwargs)

        return jsonify({'error': 'Invalid webhook authentication'}), 401

    return wrapper
