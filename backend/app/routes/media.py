"""
Serve stored WhatsApp media (see models/media_asset.py).

Media is rendered by the browser via <img src>/<audio src>, which cannot set
an Authorization header - so, like the SSE stream, this endpoint also accepts
the JWT as a `?token=` query param (JWT_QUERY_STRING_NAME).
"""
from flask import Blueprint, Response, jsonify
from flask_jwt_extended import verify_jwt_in_request
from flask_jwt_extended.exceptions import JWTExtendedException
from jwt.exceptions import PyJWTError

from app import db
from app.models import MediaAsset, Conversation
from app.services.media_service import persist_whatsapp_media
from app.utils.auth import clinic_required_stream
from app.utils.auth import get_current_clinic

bp = Blueprint('media', __name__, url_prefix='/api/media')


@bp.route('/<asset_id>', methods=['GET'])
def get_media(asset_id):
    try:
        try:
            verify_jwt_in_request(locations=['headers'])
        except (JWTExtendedException, PyJWTError):
            verify_jwt_in_request(locations=['query_string'])
    except (JWTExtendedException, PyJWTError):
        return jsonify({'error': 'Não autorizado'}), 401

    clinic = get_current_clinic()
    if not clinic:
        return jsonify({'error': 'Não autorizado'}), 401

    asset = MediaAsset.query.filter_by(id=asset_id, clinic_id=clinic.id).first()
    if not asset:
        return jsonify({'error': 'Mídia não encontrada'}), 404

    return serve_asset(asset)


def serve_asset(asset):
    filename = (asset.filename or f'media-{asset.id}').replace('"', '')

    # Images, audio and video are rendered inline; documents are downloaded.
    # anything else (documents, or a forged text/html upload) is forced to
    # download rather than rendered in the browser.
    mimetype = asset.mimetype or 'application/octet-stream'
    inline_ok = mimetype.split('/', 1)[0].lower() in ('image', 'audio', 'video')
    disposition = 'inline' if inline_ok else 'attachment'

    return Response(
        asset.data,
        mimetype=mimetype,
        headers={
            'Cache-Control': 'private, max-age=86400',
            'Content-Disposition': f'{disposition}; filename="{filename}"',
            # Don't let the browser MIME-sniff a served blob into executable
            # HTML, and sandbox it so any HTML/JS in the payload can't run in
            # our origin (stored-XSS defence for patient/staff-supplied media).
            'X-Content-Type-Options': 'nosniff',
            'Content-Security-Policy': "default-src 'none'; sandbox",
        }
    )


@bp.route('/conversations/<conversation_id>/<message_id>', methods=['GET'])
@clinic_required_stream
def get_conversation_media(conversation_id, message_id, current_clinic):
    """Recover historical attachments on demand, scoped to the owning clinic."""
    conversation = Conversation.query.filter_by(
        id=conversation_id, clinic_id=current_clinic.id
    ).first()
    if not conversation:
        return jsonify({'error': 'Conversa não encontrada'}), 404
    message = next((m for m in (conversation.messages or []) if m.get('id') == message_id), None)
    if not message or message.get('type', 'text') == 'text':
        return jsonify({'error': 'Mídia não encontrada'}), 404
    media_url = message.get('media_url', '')
    if media_url.startswith('/api/media/'):
        asset = MediaAsset.query.filter_by(
            id=media_url.rsplit('/', 1)[-1], clinic_id=current_clinic.id
        ).first()
        if asset:
            return serve_asset(asset)
    persisted = persist_whatsapp_media(
        current_clinic, message.get('evolution_id'), message.get('media_mimetype')
    )
    if not persisted:
        return jsonify({'error': 'Anexo indisponível no WhatsApp. Peça o reenvio ao paciente.'}), 404
    asset, _ = persisted
    # Download without holding the conversation lock: incoming messages must
    # keep flowing while Evolution retrieves the file. Re-read before writing.
    conversation._lock_row()
    messages = [dict(m) for m in conversation.messages]
    repaired = next(m for m in messages if m.get('id') == message_id)
    if repaired.get('media_url', '').startswith('/api/media/'):
        cached = MediaAsset.query.filter_by(
            id=repaired['media_url'].rsplit('/', 1)[-1], clinic_id=current_clinic.id
        ).first()
        if cached:
            db.session.delete(asset)
            db.session.commit()
            return serve_asset(cached)
    repaired.update(media_url=asset.public_path, media_mimetype=asset.mimetype)
    conversation.messages = messages
    db.session.commit()
    return serve_asset(asset)
