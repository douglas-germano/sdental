"""Persist decrypted WhatsApp attachments; never proxy encrypted CDN bytes."""
import base64
import binascii
import logging

from app import db
from app.models import MediaAsset, MAX_MEDIA_BYTES
from app.services.evolution_service import EvolutionService
from app.utils.whatsapp_message import unwrap_message

logger = logging.getLogger(__name__)


def persist_whatsapp_media(clinic, evolution_id, mimetype=None, raw_message=None):
    """Return (asset, base64) or None. Accept raw/data-URI base64 from Evolution."""
    message = unwrap_message((raw_message or {}).get('message', {}))
    embedded = message.get('base64') or (raw_message or {}).get('message', {}).get('base64') or (raw_message or {}).get('base64')
    fetched = {'base64': embedded, 'mimetype': mimetype} if embedded else (
        EvolutionService(clinic).get_media_base64(evolution_id, raw_message=raw_message)
    )
    if not fetched:
        return None
    encoded = fetched.get('base64')
    if not isinstance(encoded, str):
        return None
    data_mimetype = None
    if encoded.startswith('data:'):
        header, separator, encoded = encoded.partition(',')
        if not separator or ';base64' not in header:
            return None
        data_mimetype = header[5:].split(';', 1)[0]
    # Reject oversized input before allocating the decoded copy.
    if len(encoded) > ((MAX_MEDIA_BYTES + 2) // 3) * 4 + 4096:
        return None
    encoded = ''.join(encoded.split())
    try:
        decoded = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError):
        logger.warning('Invalid base64 for WhatsApp attachment %s', evolution_id)
        return None
    if not decoded or len(decoded) > MAX_MEDIA_BYTES:
        return None
    asset = MediaAsset(
        clinic_id=clinic.id,
        mimetype=fetched.get('mimetype') or mimetype or data_mimetype or 'application/octet-stream',
        filename=fetched.get('filename'),
        data=decoded,
    )
    db.session.add(asset)
    db.session.flush()
    return asset, encoded
