"""
Tests for the security-hardening changes:
- password policy (length + common-password rejection)
- JWT session invalidation on password reset (token_version)
- per-account login lockout
- media serving hardening (nosniff / sandbox / attachment)
- baseline security response headers
- optional field-level encryption at rest
"""
import pytest
from flask_jwt_extended import create_access_token

from app import db
from app.models import Clinic, MediaAsset
from app.utils.cache import cache
from app.utils.rate_limiter import limiter
from app.utils.validators import validate_password


class TestPasswordPolicy:
    def test_short_password_rejected(self):
        ok, _ = validate_password('Ab1')
        assert ok is False

    def test_nine_char_password_rejected(self):
        # Below the 10-char minimum.
        ok, _ = validate_password('Abcdef12')
        assert ok is False

    def test_common_password_rejected(self):
        ok, msg = validate_password('password123')
        assert ok is False
        assert 'common' in msg.lower()

    def test_strong_password_accepted(self):
        ok, msg = validate_password('Str0ngButRare!')
        assert ok is True
        assert msg is None


class TestSessionInvalidation:
    def test_current_version_token_accepted(self, app, client, sample_clinic):
        """A token whose tv matches the clinic's token_version works."""
        with app.app_context():
            # sample_clinic.token_version defaults to 0; the claims loader
            # embeds that same value.
            token = create_access_token(identity=str(sample_clinic.id))
        headers = {'Authorization': f'Bearer {token}'}
        assert client.get('/api/auth/me', headers=headers).status_code == 200

    def test_stale_version_token_rejected(self, app, client, sample_clinic):
        """
        A token carrying a token_version other than the clinic's current one is
        rejected - which is exactly what invalidate_sessions() produces for
        every token issued before a password reset.
        """
        with app.app_context():
            stale = create_access_token(
                identity=str(sample_clinic.id), additional_claims={'tv': 999}
            )
        headers = {'Authorization': f'Bearer {stale}'}
        assert client.get('/api/auth/me', headers=headers).status_code == 401

    def test_invalidate_sessions_bumps_version(self, app, sample_clinic):
        with app.app_context():
            clinic = db.session.get(Clinic, sample_clinic.id)
            before = clinic.token_version
            clinic.invalidate_sessions()
            assert clinic.token_version == before + 1


class TestLoginLockout:
    @pytest.fixture(autouse=True)
    def _isolate_from_ip_limiter(self):
        # We're testing the per-account lockout, not the per-IP limiter.
        previous = limiter.enabled
        limiter.enabled = False
        yield
        limiter.enabled = previous

    def test_account_locks_after_repeated_failures(self, app, client, sample_clinic):
        email = sample_clinic.email
        # Start from a clean counter - the session-scoped cache may hold failed
        # attempts for this shared email from earlier tests.
        with app.app_context():
            cache.delete(f'login_fail:{email.lower()}')

        # 8 failures (LOGIN_MAX_FAILURES) trip the lockout.
        for _ in range(8):
            r = client.post('/api/auth/login', json={'email': email, 'password': 'WrongPass000'})
            assert r.status_code == 401

        # Even the correct password is now refused with 429 until it expires.
        r = client.post('/api/auth/login', json={'email': email, 'password': 'TestPass123'})
        assert r.status_code == 429

        # Cleanup: don't leak the counter into the session-scoped cache.
        with app.app_context():
            cache.delete(f'login_fail:{email.lower()}')


class TestMediaHardening:
    def _make_asset(self, app, clinic_id, mimetype, data=b'x'):
        with app.app_context():
            asset = MediaAsset(clinic_id=clinic_id, mimetype=mimetype, data=data, filename='f')
            db.session.add(asset)
            db.session.commit()
            return str(asset.id)

    def test_html_media_forced_to_attachment_with_guards(self, app, client, auth_headers, sample_clinic):
        asset_id = self._make_asset(app, sample_clinic.id, 'text/html', b'<script>alert(1)</script>')
        resp = client.get(f'/api/media/{asset_id}', headers=auth_headers)
        assert resp.status_code == 200
        assert resp.headers.get('X-Content-Type-Options') == 'nosniff'
        assert 'sandbox' in resp.headers.get('Content-Security-Policy', '')
        assert resp.headers.get('Content-Disposition', '').startswith('attachment')

    def test_image_media_served_inline(self, app, client, auth_headers, sample_clinic):
        asset_id = self._make_asset(app, sample_clinic.id, 'image/png', b'\x89PNG')
        resp = client.get(f'/api/media/{asset_id}', headers=auth_headers)
        assert resp.status_code == 200
        assert resp.headers.get('Content-Disposition', '').startswith('inline')
        assert resp.headers.get('X-Content-Type-Options') == 'nosniff'


class TestSecurityHeaders:
    def test_baseline_headers_present(self, client):
        resp = client.get('/api/health')
        assert resp.headers.get('X-Content-Type-Options') == 'nosniff'
        assert resp.headers.get('X-Frame-Options') == 'DENY'
        assert resp.headers.get('Referrer-Policy') == 'no-referrer'


class TestFieldEncryption:
    def test_secret_encrypted_at_rest_but_readable_via_orm(self, app, monkeypatch):
        monkeypatch.setenv('FIELD_ENCRYPTION_KEY', 'unit-test-encryption-key')
        with app.app_context():
            clinic = Clinic(name='Enc Clinic', email='enc@clinic.com', phone='5511911112222')
            clinic.set_password('TestPass123')
            clinic.openrouter_api_key = 'sk-or-v1-supersecret'
            db.session.add(clinic)
            db.session.commit()
            cid = clinic.id

            # Raw column holds ciphertext, not the plaintext secret.
            raw = db.session.execute(
                db.text('SELECT openrouter_api_key FROM clinics WHERE id = :id'),
                {'id': str(cid)},
            ).scalar()
            assert raw.startswith('enc:v1:')
            assert 'supersecret' not in raw

            # Forcing a reload from the DB decrypts transparently.
            db.session.expire_all()
            reloaded = db.session.get(Clinic, cid)
            assert reloaded.openrouter_api_key == 'sk-or-v1-supersecret'

            db.session.delete(reloaded)
            db.session.commit()
