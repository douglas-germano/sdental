"""
MediaAsset: our own copy of WhatsApp media (images, voice notes, documents).

The media URLs Evolution/Baileys deliver point at WhatsApp's CDN, where the
content is end-to-end encrypted and the links expire - rendering them in the
dashboard breaks within days. Media is instead downloaded (decrypted) via
Evolution at webhook time and stored here, and messages reference it through
the authenticated `/api/media/<id>` endpoint.
"""
import uuid

from app import db
from app.models.types import UUID
from .mixins import TimestampMixin

# Aligned with the frontend composer's client-side cap.
MAX_MEDIA_BYTES = 8 * 1024 * 1024


class MediaAsset(db.Model, TimestampMixin):
    __tablename__ = 'media_assets'

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clinic_id = db.Column(UUID(as_uuid=True), db.ForeignKey('clinics.id'), nullable=False, index=True)
    mimetype = db.Column(db.String(120), nullable=False)
    filename = db.Column(db.String(255), nullable=True)
    data = db.Column(db.LargeBinary, nullable=False)

    @property
    def public_path(self) -> str:
        """Relative API path the frontend resolves (with auth token) to render this asset."""
        return f'/api/media/{self.id}'

    def to_dict(self) -> dict:
        return {
            'id': str(self.id),
            'mimetype': self.mimetype,
            'filename': self.filename,
            'size': len(self.data) if self.data is not None else 0,
            'url': self.public_path,
        }

    def __repr__(self) -> str:
        return f'<MediaAsset {self.id} {self.mimetype}>'
