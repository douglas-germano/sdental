"""
Shared parsing helpers for raw Evolution API / Baileys WhatsApp message objects.

Used both by the live webhook handler (routes/webhook.py, one message at a
time as events arrive) and by the historical sync path
(services/evolution_service.py, bulk messages fetched from
chat/findMessages), so both stay in sync on what counts as a "message with
content" and how media/timestamps are read.
"""
from datetime import datetime
from typing import Optional

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


def extract_media(message_obj: dict) -> Optional[tuple]:
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


def extract_text(message_obj: dict) -> str:
    """Return the plain text content of a message object, or '' if none."""
    return (
        message_obj.get('conversation') or
        message_obj.get('extendedTextMessage', {}).get('text') or
        ''
    )


def parse_message_timestamp(raw_ts) -> datetime:
    """
    Parse a Baileys/Evolution `messageTimestamp` value into a naive UTC
    datetime. Historically this field has shown up as a unix-seconds int, a
    numeric string, or a Long.js-style `{"low": ..., "high": ..., "unsigned":
    ...}` object depending on the Evolution API version - handle all three
    defensively rather than assuming one shape.
    """
    try:
        if isinstance(raw_ts, dict):
            seconds = int(raw_ts.get('low', 0))
        else:
            seconds = int(raw_ts)
        return datetime.utcfromtimestamp(seconds)
    except (TypeError, ValueError, OSError):
        return datetime.utcnow()


def normalize_raw_message(raw: dict) -> Optional[dict]:
    """
    Normalize one raw Evolution/Baileys message object (as found in a
    `messages.upsert` webhook payload's `data`, or a `chat/findMessages`
    record) into a plain dict:

        {evolution_id, from_me, phone, timestamp, content, message_type,
         media_url, media_mimetype, caption}

    Returns None for group messages or messages with no usable content
    (neither text nor a recognized media type).
    """
    key = raw.get('key', {}) or {}
    remote_jid = key.get('remoteJid', '') or ''

    if '@g.us' in remote_jid:
        return None

    message_obj = raw.get('message', {}) or {}
    text = extract_text(message_obj)
    media = None if text else extract_media(message_obj)

    if not text and not media:
        return None

    result = {
        'evolution_id': key.get('id'),
        'from_me': bool(key.get('fromMe', False)),
        'phone': remote_jid.split('@')[0] if remote_jid else None,
        'timestamp': parse_message_timestamp(raw.get('messageTimestamp')),
    }

    if media:
        message_type, media_url, mimetype, caption = media
        result.update({
            'content': caption or MEDIA_PLACEHOLDER_TEXT.get(message_type, 'Midia enviada'),
            'message_type': message_type,
            'media_url': media_url,
            'media_mimetype': mimetype,
            'caption': caption or None,
        })
    else:
        result.update({
            'content': text,
            'message_type': 'text',
            'media_url': None,
            'media_mimetype': None,
            'caption': None,
        })

    return result
