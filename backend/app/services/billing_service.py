import logging
from datetime import datetime
from typing import Optional
from urllib.parse import quote

from flask import current_app

from app import db
from app.models import Clinic, KiwifyWebhookEvent, SubscriptionStatus

logger = logging.getLogger(__name__)

# Kiwify webhook trigger names (confirmed against Kiwify's public API
# reference at the time of writing). The exact JSON payload shape isn't
# fully documented, so every event is persisted raw (KiwifyWebhookEvent)
# before any of this is applied - see record_webhook_event().
APPROVED_EVENTS = {'compra_aprovada', 'subscription_renewed'}
DECLINED_EVENTS = {'compra_recusada'}
LATE_EVENTS = {'subscription_late'}
CANCELED_EVENTS = {'subscription_canceled'}
REFUNDED_EVENTS = {'compra_reembolsada'}
CHARGEBACK_EVENTS = {'chargeback'}


class BillingService:
    """Applies Kiwify webhook events to a clinic's subscription state."""

    @staticmethod
    def record_webhook_event(
        headers: dict, query_params: dict, payload: dict, verified: bool
    ) -> KiwifyWebhookEvent:
        """Persist the raw webhook call before attempting to interpret it."""
        event = KiwifyWebhookEvent(
            headers=headers,
            query_params=query_params,
            payload=payload,
            verified=verified
        )
        db.session.add(event)
        db.session.commit()
        return event

    @staticmethod
    def _extract_event_type(payload: dict) -> str:
        raw = (
            payload.get('webhook_event_type')
            or payload.get('order_status')
            or payload.get('event')
            or ''
        )
        return str(raw).strip().lower()

    @staticmethod
    def _extract_customer_email(payload: dict) -> str:
        customer = payload.get('Customer') or payload.get('customer') or {}
        return str(customer.get('email') or '').strip().lower()

    @staticmethod
    def _parse_date(value) -> Optional[datetime]:
        if not value:
            return None
        try:
            return datetime.fromisoformat(str(value)[:19])
        except ValueError:
            return None

    @classmethod
    def process_event(cls, event: KiwifyWebhookEvent) -> None:
        """
        Apply a previously-recorded webhook event to the matching clinic.
        The clinic is matched by e-mail: the clinic must check out on Kiwify
        using the same e-mail address registered in SDental.
        """
        payload = event.payload or {}
        event_type = cls._extract_event_type(payload)
        email = cls._extract_customer_email(payload)

        if not email:
            event.processing_error = 'No customer e-mail found in payload'
            db.session.commit()
            return

        clinic = Clinic.query.filter_by(email=email).first()
        if not clinic:
            event.processing_error = f'No clinic registered with e-mail {email}'
            db.session.commit()
            return

        subscription = payload.get('Subscription') or payload.get('subscription') or {}

        if event_type in APPROVED_EVENTS:
            clinic.subscription_status = SubscriptionStatus.ACTIVE
            clinic.active = True
            clinic.subscription_late_since = None
            kiwify_subscription_id = subscription.get('id') or payload.get('subscription_id')
            if kiwify_subscription_id:
                clinic.kiwify_subscription_id = str(kiwify_subscription_id)
            next_payment = subscription.get('next_payment') or subscription.get('next_payment_date')
            clinic.subscription_period_end = cls._parse_date(next_payment)
        elif event_type in LATE_EVENTS:
            clinic.subscription_status = SubscriptionStatus.LATE
            if not clinic.subscription_late_since:
                clinic.subscription_late_since = datetime.utcnow()
            # Access is left untouched here on purpose: the clinic keeps
            # working during the grace period. See scheduler.py's
            # suspend_late_subscriptions_job for the suspension itself.
        elif event_type in CANCELED_EVENTS:
            clinic.subscription_status = SubscriptionStatus.CANCELED
            clinic.active = False
        elif event_type in REFUNDED_EVENTS:
            clinic.subscription_status = SubscriptionStatus.REFUNDED
            clinic.active = False
        elif event_type in CHARGEBACK_EVENTS:
            clinic.subscription_status = SubscriptionStatus.CHARGEBACK
            clinic.active = False
        elif event_type in DECLINED_EVENTS:
            # A declined purchase never granted access - don't downgrade a
            # clinic that's already paying based on an unrelated/duplicate event.
            if clinic.subscription_status != SubscriptionStatus.ACTIVE:
                clinic.subscription_status = SubscriptionStatus.PENDING_PAYMENT
        else:
            event.processing_error = f'Unrecognized event type: {event_type!r}'
            db.session.commit()
            return

        event.processed = True
        db.session.commit()
        logger.info(
            'Kiwify event %r applied to clinic %s -> subscription_status=%s active=%s',
            event_type, clinic.id, clinic.subscription_status, clinic.active
        )

    @staticmethod
    def checkout_url_for(clinic: Clinic) -> Optional[str]:
        """Build the Kiwify checkout link pre-filled with the clinic's e-mail."""
        base_url = current_app.config.get('KIWIFY_CHECKOUT_URL')
        if not base_url:
            return None
        separator = '&' if '?' in base_url else '?'
        return f"{base_url}{separator}email={quote(clinic.email)}"
