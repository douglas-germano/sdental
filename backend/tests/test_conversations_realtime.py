"""
Tests for the realtime conversation features: message status (ACK), media
messages and the WhatsApp webhook handling that feeds them.
"""
import hmac
import hashlib
import json

import pytest

from app import db
from app.models import Conversation


def webhook_headers(app, payload: dict):
    secret = app.config['WEBHOOK_SECRET']
    body = json.dumps(payload).encode()
    if not secret:
        return {'Content-Type': 'application/json'}, body
    signature = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return {'X-Webhook-Signature': signature, 'Content-Type': 'application/json'}, body


class TestMessageModelHelpers:
    def test_add_message_generates_id_and_defaults(self, app, db_session, sample_clinic):
        with app.app_context():
            conversation = Conversation(
                clinic_id=sample_clinic.id,
                phone_number='5511900000001',
                messages=[],
                context={}
            )
            db.session.add(conversation)
            db.session.commit()

            message = conversation.add_message('user', 'Ola')

            assert message['id']
            assert message['status'] == 'sent'
            assert message['type'] == 'text'
            assert conversation.messages[-1]['content'] == 'Ola'

    def test_update_message_status_matches_by_evolution_id(self, app, db_session, sample_clinic):
        with app.app_context():
            conversation = Conversation(
                clinic_id=sample_clinic.id,
                phone_number='5511900000002',
                messages=[],
                context={}
            )
            db.session.add(conversation)
            db.session.commit()

            conversation.add_message('assistant', 'Oi!', evolution_id='WA123')
            updated = conversation.update_message_status('WA123', 'delivered')

            assert updated is not None
            assert updated['status'] == 'delivered'
            assert conversation.messages[-1]['status'] == 'delivered'

    def test_set_evolution_id_for_last_message_only_targets_matching_role(self, app, db_session, sample_clinic):
        with app.app_context():
            conversation = Conversation(
                clinic_id=sample_clinic.id,
                phone_number='5511900000003',
                messages=[],
                context={}
            )
            db.session.add(conversation)
            db.session.commit()

            conversation.add_message('user', 'pergunta')
            conversation.add_message('assistant', 'resposta')

            updated = conversation.set_evolution_id_for_last_message('WA999', role='assistant')

            assert updated['role'] == 'assistant'
            assert updated['evolution_id'] == 'WA999'
            assert conversation.messages[0]['evolution_id'] is None


class TestWebhookMediaMessage:
    def test_inbound_image_is_stored_and_transfers_to_human(self, app, db_session, sample_clinic):
        sample_clinic.evolution_instance_name = 'test-instance'
        db.session.commit()

        payload = {
            'event': 'messages.upsert',
            'instance': 'test-instance',
            'data': {
                'key': {'remoteJid': '5511900000009@s.whatsapp.net', 'fromMe': False, 'id': 'WA_IMG_1'},
                'message': {
                    'imageMessage': {
                        'url': 'https://example.com/x.jpg',
                        'mimetype': 'image/jpeg',
                        'caption': 'raio-x'
                    }
                }
            }
        }
        headers, body = webhook_headers(app, payload)
        client = app.test_client()
        response = client.post('/api/webhook/evolution', data=body, headers=headers)

        assert response.status_code == 200

        conversation = Conversation.query.filter_by(
            clinic_id=sample_clinic.id,
            phone_number='5511900000009'
        ).first()
        assert conversation is not None
        assert conversation.status == 'transferred_to_human'
        assert conversation.messages[-1]['type'] == 'image'
        assert conversation.messages[-1]['media_url'] == 'https://example.com/x.jpg'

    def test_messages_update_ack_marks_message_read(self, app, db_session, sample_clinic):
        sample_clinic.evolution_instance_name = 'test-instance-2'
        db.session.commit()

        conversation = Conversation(
            clinic_id=sample_clinic.id,
            phone_number='5511900000010',
            messages=[],
            context={}
        )
        db.session.add(conversation)
        db.session.commit()
        conversation.add_message('assistant', 'oi', evolution_id='WA_ACK_1')
        db.session.commit()

        payload = {
            'event': 'messages.update',
            'instance': 'test-instance-2',
            'data': {
                'key': {'remoteJid': '5511900000010@s.whatsapp.net', 'id': 'WA_ACK_1'},
                'update': {'status': 'READ'}
            }
        }
        headers, body = webhook_headers(app, payload)
        client = app.test_client()
        response = client.post('/api/webhook/evolution', data=body, headers=headers)

        assert response.status_code == 200
        assert response.get_json()['updated'] == 1

        db.session.refresh(conversation)
        assert conversation.find_message('WA_ACK_1')['status'] == 'read'


class TestSendMediaEndpoint:
    def test_rejects_invalid_media_type(self, client, auth_headers, sample_clinic):
        conversation = Conversation(
            clinic_id=sample_clinic.id,
            phone_number='5511900000020',
            messages=[],
            context={}
        )
        db.session.add(conversation)
        db.session.commit()

        response = client.post(
            f'/api/conversations/{conversation.id}/send-media',
            json={'media_type': 'video', 'data': 'aGVsbG8=', 'mimetype': 'video/mp4'},
            headers=auth_headers
        )

        assert response.status_code == 400

    def test_rejects_invalid_base64(self, client, auth_headers, sample_clinic):
        conversation = Conversation(
            clinic_id=sample_clinic.id,
            phone_number='5511900000021',
            messages=[],
            context={}
        )
        db.session.add(conversation)
        db.session.commit()

        response = client.post(
            f'/api/conversations/{conversation.id}/send-media',
            json={'media_type': 'image', 'data': 'not-base64!!', 'mimetype': 'image/png'},
            headers=auth_headers
        )

        assert response.status_code == 400


class TestStreamAuth:
    def test_stream_requires_auth(self, client):
        response = client.get('/api/conversations/stream')
        assert response.status_code == 401

    def test_stream_accepts_query_token(self, client, auth_headers, sample_clinic):
        token = auth_headers['Authorization'].split(' ', 1)[1]
        response = client.get(f'/api/conversations/stream?token={token}')
        assert response.status_code == 200
        assert response.mimetype == 'text/event-stream'
        response.close()
