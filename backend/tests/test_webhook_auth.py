"""
Tests for webhook_auth_required's three accepted authentication mechanisms:
X-Webhook-Secret header, X-Webhook-Signature HMAC header, and an "apikey"
field inside the JSON body matching EVOLUTION_API_KEY - the last one is how
Evolution API actually authenticates its callbacks (confirmed via production
diagnostics: it sends no custom header at all, but does echo its configured
apikey inside every event payload).
"""
import hashlib
import hmac
import json
from unittest.mock import patch

import pytest

from app import db


@pytest.fixture
def wa_clinic(app, db_session, sample_clinic):
    sample_clinic.evolution_instance_name = 'auth-test-instance'
    db.session.commit()
    return sample_clinic


def _upsert_payload(instance, phone, text, msg_id, apikey=None):
    payload = {
        'event': 'messages.upsert',
        'instance': instance,
        'data': {
            'key': {'remoteJid': f'{phone}@s.whatsapp.net', 'fromMe': False, 'id': msg_id},
            'message': {'conversation': text},
        },
    }
    if apikey is not None:
        payload['apikey'] = apikey
    return payload


class TestBodyApikeyAuth:
    def test_valid_body_apikey_is_accepted(self, app, db_session, wa_clinic, monkeypatch):
        monkeypatch.setitem(app.config, 'EVOLUTION_API_KEY', 'the-global-evolution-key')
        payload = _upsert_payload('auth-test-instance', '5511900020001', 'oi', 'APIKEY_OK', apikey='the-global-evolution-key')

        client = app.test_client()
        with patch('app.services.message_processor.ClaudeService') as MockClaude, \
             patch('app.services.message_processor.EvolutionService') as MockEvo:
            MockClaude.return_value.process_message.return_value = 'Ola! Como posso ajudar?'
            MockEvo.return_value.send_message.return_value = {'key': {'id': 'REPLY_OK'}}
            response = client.post('/api/webhook/evolution', data=json.dumps(payload), content_type='application/json')

        assert response.status_code == 200

    def test_wrong_body_apikey_is_rejected(self, app, db_session, wa_clinic, monkeypatch):
        monkeypatch.setitem(app.config, 'EVOLUTION_API_KEY', 'the-global-evolution-key')
        payload = _upsert_payload('auth-test-instance', '5511900020002', 'oi', 'APIKEY_BAD', apikey='some-other-value')

        client = app.test_client()
        response = client.post('/api/webhook/evolution', data=json.dumps(payload), content_type='application/json')

        assert response.status_code == 401

    def test_missing_apikey_falls_back_to_rejection(self, app, db_session, wa_clinic, monkeypatch):
        monkeypatch.setitem(app.config, 'EVOLUTION_API_KEY', 'the-global-evolution-key')
        payload = _upsert_payload('auth-test-instance', '5511900020003', 'oi', 'APIKEY_MISSING')

        client = app.test_client()
        response = client.post('/api/webhook/evolution', data=json.dumps(payload), content_type='application/json')

        assert response.status_code == 401

    def test_header_signature_still_works_when_evolution_key_configured(self, app, db_session, wa_clinic, monkeypatch):
        """The new body-apikey path is additive - existing header-based auth is untouched."""
        monkeypatch.setitem(app.config, 'EVOLUTION_API_KEY', 'the-global-evolution-key')
        secret = app.config['WEBHOOK_SECRET']
        payload = _upsert_payload('auth-test-instance', '5511900020004', 'oi', 'SIG_STILL_OK')
        body = json.dumps(payload).encode()
        signature = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()

        client = app.test_client()
        with patch('app.services.message_processor.ClaudeService') as MockClaude, \
             patch('app.services.message_processor.EvolutionService') as MockEvo:
            MockClaude.return_value.process_message.return_value = 'Ola! Como posso ajudar?'
            MockEvo.return_value.send_message.return_value = {'key': {'id': 'REPLY_SIG'}}
            response = client.post(
                '/api/webhook/evolution', data=body,
                headers={'X-Webhook-Signature': signature, 'Content-Type': 'application/json'}
            )

        assert response.status_code == 200
