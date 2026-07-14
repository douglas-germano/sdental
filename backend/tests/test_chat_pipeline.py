"""
Tests for the resilient WhatsApp chat pipeline: webhook idempotency, echo
handling, store-always semantics, send retries/failure marking, audio
transcription, human takeover on manual send, unread tracking, quick replies
and connection monitoring.

TestingConfig sets MESSAGE_AGGREGATION_SECONDS=0, so the pipeline processes
inline (synchronously) and assertions can run right after the request.
"""
import base64
import hashlib
import hmac
import json
from unittest.mock import patch

import pytest

from app import db
from app.models import Conversation, ConversationStatus, MediaAsset


def webhook_headers(app, payload: dict):
    secret = app.config['WEBHOOK_SECRET']
    body = json.dumps(payload).encode()
    signature = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return {'X-Webhook-Signature': signature, 'Content-Type': 'application/json'}, body


def text_upsert(instance, phone, text, msg_id, from_me=False):
    return {
        'event': 'messages.upsert',
        'instance': instance,
        'data': {
            'key': {'remoteJid': f'{phone}@s.whatsapp.net', 'fromMe': from_me, 'id': msg_id},
            'message': {'conversation': text},
        },
    }


@pytest.fixture
def wa_clinic(app, db_session, sample_clinic):
    sample_clinic.evolution_instance_name = 'pipe-instance'
    db.session.commit()
    return sample_clinic


def post_webhook(app, payload):
    headers, body = webhook_headers(app, payload)
    client = app.test_client()
    return client.post('/api/webhook/evolution', data=body, headers=headers)


class TestWebhookIdempotency:
    def test_duplicate_delivery_is_ignored(self, app, db_session, wa_clinic):
        payload = text_upsert('pipe-instance', '5511900010001', 'quero marcar', 'DUP_1')

        with patch('app.services.message_processor.ClaudeService') as MockClaude, \
             patch('app.services.message_processor.EvolutionService') as MockEvo:
            MockClaude.return_value.process_message.return_value = 'Claro! Qual dia?'
            MockEvo.return_value.send_message.return_value = {'key': {'id': 'REPLY_1'}}

            first = post_webhook(app, payload)
            second = post_webhook(app, payload)

        assert first.status_code == 200
        assert second.get_json()['status'] == 'duplicate'

        conversation = Conversation.query.filter_by(
            clinic_id=wa_clinic.id, phone_number='5511900010001'
        ).first()
        user_msgs = [m for m in conversation.messages if m['role'] == 'user']
        assert len(user_msgs) == 1
        # And the AI replied exactly once
        assert MockClaude.return_value.process_message.call_count == 1

    def test_own_api_echo_does_not_pause_bot(self, app, db_session, wa_clinic):
        """The webhook echo of a bot reply must not be treated as a human takeover."""
        with patch('app.services.message_processor.ClaudeService') as MockClaude, \
             patch('app.services.message_processor.EvolutionService') as MockEvo:
            MockClaude.return_value.process_message.return_value = 'Temos horário amanhã às 10h.'
            MockEvo.return_value.send_message.return_value = {'key': {'id': 'BOT_REPLY_9'}}
            post_webhook(app, text_upsert('pipe-instance', '5511900010002', 'tem horário?', 'IN_9'))

        # Echo arrives with the id already attached to the stored reply -> duplicate
        echo = text_upsert('pipe-instance', '5511900010002', 'Temos horário amanhã às 10h.', 'BOT_REPLY_9', from_me=True)
        response = post_webhook(app, echo)

        assert response.get_json()['status'] == 'duplicate'
        conversation = Conversation.query.filter_by(
            clinic_id=wa_clinic.id, phone_number='5511900010002'
        ).first()
        assert conversation.status == ConversationStatus.ACTIVE

    def test_echo_race_matches_by_content(self, app, db_session, wa_clinic):
        """Echo arriving before the send result recorded its id: matched by content."""
        with patch('app.services.message_processor.ClaudeService') as MockClaude, \
             patch('app.services.message_processor.EvolutionService') as MockEvo:
            MockClaude.return_value.process_message.return_value = 'Perfeito, agendado!'
            # Send "succeeds" but returns no key/id - simulates the race where
            # the echo webhook wins against the id being attached.
            MockEvo.return_value.send_message.return_value = {'status': 'PENDING'}
            post_webhook(app, text_upsert('pipe-instance', '5511900010003', 'confirma', 'IN_10'))

        echo = text_upsert('pipe-instance', '5511900010003', 'Perfeito, agendado!', 'ECHO_10', from_me=True)
        response = post_webhook(app, echo)

        assert response.get_json()['reason'] == 'Own message echo'
        conversation = Conversation.query.filter_by(
            clinic_id=wa_clinic.id, phone_number='5511900010003'
        ).first()
        assert conversation.status == ConversationStatus.ACTIVE
        reply = [m for m in conversation.messages if m['role'] == 'assistant'][-1]
        assert reply['evolution_id'] == 'ECHO_10'


class TestStoreAlwaysSemantics:
    def test_agent_disabled_still_stores_message(self, app, db_session, wa_clinic):
        wa_clinic.agent_enabled = False
        db.session.commit()

        response = post_webhook(app, text_upsert('pipe-instance', '5511900010004', 'alô?', 'OFF_1'))

        assert response.get_json()['status'] == 'stored'
        conversation = Conversation.query.filter_by(
            clinic_id=wa_clinic.id, phone_number='5511900010004'
        ).first()
        assert conversation is not None
        assert conversation.messages[-1]['content'] == 'alô?'

        wa_clinic.agent_enabled = True
        db.session.commit()

    def test_send_failure_marks_reply_failed(self, app, db_session, wa_clinic):
        with patch('app.services.message_processor.ClaudeService') as MockClaude, \
             patch('app.services.message_processor.EvolutionService') as MockEvo, \
             patch('app.services.message_processor.time.sleep'):
            MockClaude.return_value.process_message.return_value = 'Podemos amanhã às 14h.'
            MockEvo.return_value.send_message.return_value = {'error': 'instance down'}

            post_webhook(app, text_upsert('pipe-instance', '5511900010005', 'tem vaga?', 'FAIL_1'))

            # Initial attempt + 2 retries
            assert MockEvo.return_value.send_message.call_count == 3

        conversation = Conversation.query.filter_by(
            clinic_id=wa_clinic.id, phone_number='5511900010005'
        ).first()
        reply = [m for m in conversation.messages if m['role'] == 'assistant'][-1]
        assert reply['status'] == 'failed'

    def test_llm_error_reply_is_stored(self, app, db_session, wa_clinic):
        """process_message returning an apology without storing it: pipeline stores it."""
        with patch('app.services.message_processor.ClaudeService') as MockClaude, \
             patch('app.services.message_processor.EvolutionService') as MockEvo:
            MockClaude.return_value.process_message.return_value = 'Desculpe, estou com dificuldades técnicas.'
            MockEvo.return_value.send_message.return_value = {'key': {'id': 'R_APOLOGY'}}

            post_webhook(app, text_upsert('pipe-instance', '5511900010006', 'oi', 'LLM_1'))

        conversation = Conversation.query.filter_by(
            clinic_id=wa_clinic.id, phone_number='5511900010006'
        ).first()
        assert conversation.messages[-1]['role'] == 'assistant'
        assert 'dificuldades' in conversation.messages[-1]['content']


class TestAudioTranscription:
    def _audio_payload(self, msg_id):
        return {
            'event': 'messages.upsert',
            'instance': 'pipe-instance',
            'data': {
                'key': {'remoteJid': '5511900010007@s.whatsapp.net', 'fromMe': False, 'id': msg_id},
                'message': {
                    'audioMessage': {
                        'url': 'https://mmg.whatsapp.net/enc/audio.enc',
                        'mimetype': 'audio/ogg; codecs=opus',
                    }
                },
            },
        }

    def test_transcribed_audio_keeps_bot_in_the_loop(self, app, db_session, wa_clinic):
        fake_b64 = base64.b64encode(b'fake-ogg-bytes').decode()

        with patch('app.routes.webhook.EvolutionService') as MockEvoRoute, \
             patch('app.routes.webhook.ClaudeService') as MockClaudeRoute, \
             patch('app.services.message_processor.ClaudeService') as MockClaudeProc, \
             patch('app.services.message_processor.EvolutionService') as MockEvoProc:
            MockEvoRoute.return_value.get_media_base64.return_value = {
                'base64': fake_b64, 'mimetype': 'audio/ogg'
            }
            MockClaudeRoute.return_value.transcribe_audio.return_value = 'quero marcar uma limpeza'
            MockClaudeProc.return_value.process_message.return_value = 'Claro! Que dia prefere?'
            MockEvoProc.return_value.send_message.return_value = {'key': {'id': 'R_AUDIO'}}

            response = post_webhook(app, self._audio_payload('AUD_1'))

        body = response.get_json()
        assert body.get('transcribed') is True

        conversation = Conversation.query.filter_by(
            clinic_id=wa_clinic.id, phone_number='5511900010007'
        ).first()
        # Bot stayed active and the transcript is the message content
        assert conversation.status == ConversationStatus.ACTIVE
        audio_msg = [m for m in conversation.messages if m['role'] == 'user'][-1]
        assert audio_msg['type'] == 'audio'
        assert audio_msg['content'] == 'quero marcar uma limpeza'
        # Media stored in our own storage, referenced by internal URL
        assert audio_msg['media_url'].startswith('/api/media/')
        assert MediaAsset.query.filter_by(clinic_id=wa_clinic.id).count() >= 1

    def test_transcription_failure_falls_back_to_human(self, app, db_session, wa_clinic):
        with patch('app.routes.webhook.EvolutionService') as MockEvoRoute, \
             patch('app.routes.webhook.ClaudeService') as MockClaudeRoute:
            MockEvoRoute.return_value.get_media_base64.return_value = {
                'base64': base64.b64encode(b'x').decode(), 'mimetype': 'audio/ogg'
            }
            MockClaudeRoute.return_value.transcribe_audio.return_value = None

            response = post_webhook(app, self._audio_payload('AUD_2'))

        assert response.get_json()['reason'] == 'Media message routed to human'
        conversation = Conversation.query.filter_by(
            clinic_id=wa_clinic.id, phone_number='5511900010007'
        ).first()
        assert conversation.status == ConversationStatus.TRANSFERRED_TO_HUMAN


class TestManualTakeover:
    def test_manual_send_pauses_ai(self, app, client, auth_headers, db_session, wa_clinic):
        conversation = Conversation(
            clinic_id=wa_clinic.id, phone_number='5511900010008', messages=[], context={}
        )
        db.session.add(conversation)
        db.session.commit()

        with patch('app.routes.conversations.EvolutionService') as MockEvo:
            MockEvo.return_value.send_message.return_value = {'key': {'id': 'MAN_1'}}
            response = client.post(
                f'/api/conversations/{conversation.id}/send-message',
                json={'message': 'Olá! Aqui é da clínica.'},
                headers=auth_headers,
            )

        body = response.get_json()
        assert response.status_code == 200
        assert body['took_over'] is True
        assert body['conversation']['status'] == ConversationStatus.TRANSFERRED_TO_HUMAN

        db.session.refresh(conversation)
        assert conversation.messages[-1]['sent_via'] == 'dashboard'

    def test_manual_send_rejects_over_4096_chars(self, app, client, auth_headers, db_session, wa_clinic):
        conversation = Conversation(
            clinic_id=wa_clinic.id, phone_number='5511900010009', messages=[], context={}
        )
        db.session.add(conversation)
        db.session.commit()

        response = client.post(
            f'/api/conversations/{conversation.id}/send-message',
            json={'message': 'x' * 4097},
            headers=auth_headers,
        )
        assert response.status_code == 400


class TestUnreadTracking:
    def test_unread_count_and_mark_read(self, app, client, auth_headers, db_session, wa_clinic):
        conversation = Conversation(
            clinic_id=wa_clinic.id, phone_number='5511900010010', messages=[], context={}
        )
        db.session.add(conversation)
        db.session.commit()
        conversation.add_message('user', 'primeira')
        conversation.add_message('assistant', 'resposta')
        conversation.add_message('user', 'segunda')
        db.session.commit()

        listing = client.get('/api/conversations', headers=auth_headers)
        item = next(
            c for c in listing.get_json()['conversations']
            if c['id'] == str(conversation.id)
        )
        assert item['unread_count'] == 2

        marked = client.post(f'/api/conversations/{conversation.id}/read', headers=auth_headers)
        assert marked.status_code == 200
        assert marked.get_json()['unread_count'] == 0

        db.session.refresh(conversation)
        assert conversation.unread_count() == 0


class TestQuickReplies:
    def test_roundtrip(self, client, auth_headers, db_session, wa_clinic):
        put = client.put(
            '/api/conversations/quick-replies',
            json={'quick_replies': [{'title': 'PIX', 'text': 'Nossa chave PIX é 123.'}]},
            headers=auth_headers,
        )
        assert put.status_code == 200

        got = client.get('/api/conversations/quick-replies', headers=auth_headers)
        assert got.get_json()['quick_replies'] == [{'title': 'PIX', 'text': 'Nossa chave PIX é 123.'}]

    def test_rejects_malformed_items(self, client, auth_headers, db_session, wa_clinic):
        response = client.put(
            '/api/conversations/quick-replies',
            json={'quick_replies': [{'title': '', 'text': 'sem título'}]},
            headers=auth_headers,
        )
        assert response.status_code == 400


class TestConnectionMonitoring:
    def test_connection_close_is_persisted_and_alerts(self, app, db_session, wa_clinic):
        payload = {
            'event': 'connection.update',
            'instance': 'pipe-instance',
            'data': {'state': 'close'},
        }
        with patch('app.routes.webhook.EmailService') as MockEmail:
            response = post_webhook(app, payload)

        assert response.get_json()['state'] == 'close'
        db.session.refresh(wa_clinic)
        assert wa_clinic.whatsapp_connection_state == 'close'
        MockEmail.return_value.send.assert_called_once()

        # Reconnection: state updates, no second alert
        payload['data']['state'] = 'open'
        with patch('app.routes.webhook.EmailService') as MockEmail2:
            post_webhook(app, payload)
        db.session.refresh(wa_clinic)
        assert wa_clinic.whatsapp_connection_state == 'open'
        MockEmail2.return_value.send.assert_not_called()


class TestMediaEndpoint:
    def test_serves_own_clinic_media_with_query_token(self, app, client, auth_headers, db_session, wa_clinic):
        asset = MediaAsset(clinic_id=wa_clinic.id, mimetype='image/png', data=b'\x89PNG-fake')
        db.session.add(asset)
        db.session.commit()

        token = auth_headers['Authorization'].split(' ', 1)[1]
        response = client.get(f'/api/media/{asset.id}?token={token}')

        assert response.status_code == 200
        assert response.mimetype == 'image/png'
        assert response.data == b'\x89PNG-fake'

    def test_requires_auth(self, app, client, db_session, wa_clinic):
        asset = MediaAsset(clinic_id=wa_clinic.id, mimetype='image/png', data=b'x')
        db.session.add(asset)
        db.session.commit()

        response = client.get(f'/api/media/{asset.id}')
        assert response.status_code == 401
