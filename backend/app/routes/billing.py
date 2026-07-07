import hmac
import logging

from flask import Blueprint, request, jsonify, current_app

from app.services.billing_service import BillingService
from app.utils.auth import clinic_required_any_status
from app.utils.rate_limiter import limiter

bp = Blueprint('billing', __name__, url_prefix='/api/billing')
logger = logging.getLogger(__name__)


def _verify_kiwify_token() -> bool:
    """
    Fail-closed check: a payment webhook must always be rejected unless the
    configured token is present and matches, regardless of which channel
    Kiwify uses to send it back (query string, header, or payload field).
    """
    configured_token = current_app.config.get('KIWIFY_WEBHOOK_TOKEN')
    if not configured_token:
        return False

    candidate = (
        request.args.get('token')
        or request.headers.get('X-Kiwify-Token')
        or (request.get_json(silent=True) or {}).get('token')
    )
    return bool(candidate) and hmac.compare_digest(str(candidate), configured_token)


@bp.route('/webhook/kiwify', methods=['POST'])
@limiter.limit("60 per minute")
def kiwify_webhook():
    """Receives Kiwify order/subscription events for SDental's own billing."""
    verified = _verify_kiwify_token()
    payload = request.get_json(silent=True) or {}

    event = BillingService.record_webhook_event(
        headers=dict(request.headers),
        query_params=request.args.to_dict(),
        payload=payload,
        verified=verified
    )

    if not verified:
        logger.warning('Rejected Kiwify webhook with invalid/missing token (event id=%s)', event.id)
        return jsonify({'error': 'Invalid token'}), 401

    try:
        BillingService.process_event(event)
    except Exception:
        logger.exception('Failed to process Kiwify webhook event %s', event.id)
        # The raw payload is already persisted above, but there is no
        # background job that reprocesses failed events - acking with 200
        # here would make Kiwify consider the event delivered and never
        # retry it, leaving a clinic that just paid stuck locked out with no
        # automatic recovery. Return 5xx so Kiwify's own retry mechanism
        # gives this a second chance once the transient issue clears.
        return jsonify({'received': True, 'error': 'Processing failed, will retry'}), 500

    return jsonify({'received': True}), 200


@bp.route('/status', methods=['GET'])
@clinic_required_any_status
def billing_status(current_clinic):
    """Subscription status for the authenticated clinic (used by the dashboard)."""
    return jsonify({
        'subscription_status': current_clinic.subscription_status,
        'subscription_period_end': (
            current_clinic.subscription_period_end.isoformat()
            if current_clinic.subscription_period_end else None
        ),
        'active': current_clinic.active,
        'checkout_url': BillingService.checkout_url_for(current_clinic)
    })
