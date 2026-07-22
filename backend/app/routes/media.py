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

from app.models import MediaAsset
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

    filename = (asset.filename or f'media-{asset.id}').replace('"', '')

    # Only image/audio are rendered inline by the dashboard (<img>/<audio>);
    # anything else (documents, or a forged text/html upload) is forced to
    # download rather than rendered in the browser.
    mimetype = asset.mimetype or 'application/octet-stream'
    inline_ok = mimetype.split('/', 1)[0].lower() in ('image', 'audio')
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
