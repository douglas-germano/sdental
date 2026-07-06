"""
Tests for WhatsApp history sync: the shared raw-message normalizer, merging
fetched history into a conversation, storing messages sent directly from the
linked phone (fromMe), and the sync-history endpoints/service methods.
"""
import hmac
import hashlib
import json
from datetime import datetime

from app import db
from app.models import Conversation
from app.services.conversation_service import ConversationService
from app.services.evolution_service import EvolutionService
from app.utils.whatsapp_message import normalize_raw_message


def webhook_headers(app, payload: dict):
    secret = app.config['WEBHOOK_SECRET']
    body = json.dumps(payload).encode()
    if not secret:
        return {'Content-Type': 'application/json'}, body
    signature = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return {'X-Webhook-Signature': signature, 'Content-Type': 'application/json'}, body


class TestNormalizeRawMessage:
    def test_text_message(self):
        raw = {
            'key': {'remoteJid': '5511900000001@s.whatsapp.net', 'fromMe': False, 'id': 'WA1'},
            'message': {'conversation': 'Ola'},
            'messageTimestamp': 1700000000,
        }
        result = normalize_raw_message(raw)
        assert result['evolution_id'] == 'WA1'
        assert result['from_me'] is False
        assert result['phone'] == '5511900000001'
        assert result['content'] == 'Ola'
        assert result['message_type'] == 'text'
        assert isinstance(result['timestamp'], datetime)

    def test_group_message_ignored(self):
        raw = {
            'key': {'remoteJid': '12345-6789@g.us', 'fromMe': False, 'id': 'WA2'},
            'message': {'conversation': 'Oi grupo'},
            'messageTimestamp': 1700000000,
        }
        assert normalize_raw_message(raw) is None

    def test_no_content_ignored(self):
        raw = {
            'key': {'remoteJid': '5511900000001@s.whatsapp.net', 'fromMe': False, 'id': 'WA3'},
            'message': {},
            'messageTimestamp': 1700000000,
        }
        assert normalize_raw_message(raw) is None

    def test_media_message_with_caption(self):
        raw = {
            'key': {'remoteJid': '5511900000001@s.whatsapp.net', 'fromMe': True, 'id': 'WA4'},
            'message': {
                'imageMessage': {
                    'url': 'https://example.com/x.jpg',
                    'mimetype': 'image/jpeg',
                    'caption': 'raio-x'
                }
            },
            'messageTimestamp': 1700000000,
        }
        result = normalize_raw_message(raw)
        assert result['from_me'] is True
        assert result['message_type'] == 'image'
        assert result['media_url'] == 'https://example.com/x.jpg'
        assert result['content'] == 'raio-x'

    def test_long_style_timestamp_object(self):
        raw = {
            'key': {'remoteJid': '5511900000001@s.whatsapp.net', 'fromMe': False, 'id': 'WA5'},
            'message': {'conversation': 'Oi'},
            'messageTimestamp': {'low': 1700000000, 'high': 0, 'unsigned': True},
        }
        result = normalize_raw_message(raw)
        assert isinstance(result['timestamp'], datetime)


class TestMergeHistoryMessages:
    def test_dedup_by_evolution_id(self, app, db_session, sample_clinic):
        with app.app_context():
            conversation = Conversation(
                clinic_id=sample_clinic.id, phone_number='5511900000030',
                messages=[], context={}
            )
            db.session.add(conversation)
            db.session.commit()
            conversation.add_message('user', 'ja tenho essa', evolution_id='WA_OLD')
            db.session.commit()

            historical = [
                {
                    'evolution_id': 'WA_OLD', 'from_me': False,
                    'timestamp': datetime(2026, 1, 1, 10, 0, 0),
                    'content': 'ja tenho essa', 'message_type': 'text',
                    'media_url': None, 'media_mimetype': None, 'caption': None,
                },
                {
                    'evolution_id': 'WA_NEW', 'from_me': False,
                    'timestamp': datetime(2026, 1, 1, 9, 0, 0),
                    'content': 'mensagem antiga', 'message_type': 'text',
                    'media_url': None, 'media_mimetype': None, 'caption': None,
                },
            ]

            added = conversation.merge_history_messages(historical)

            assert added == 1
            assert len(conversation.messages) == 2

    def test_from_me_marks_assistant_and_sent_via(self, app, db_session, sample_clinic):
        with app.app_context():
            conversation = Conversation(
                clinic_id=sample_clinic.id, phone_number='5511900000031',
                messages=[], context={}
            )
            db.session.add(conversation)
            db.session.commit()

            historical = [{
                'evolution_id': 'WA_FM_1', 'from_me': True,
                'timestamp': datetime(2026, 1, 1, 10, 0, 0),
                'content': 'respondi pelo celular', 'message_type': 'text',
                'media_url': None, 'media_mimetype': None, 'caption': None,
            }]

            added = conversation.merge_history_messages(historical)

            assert added == 1
            msg = conversation.messages[0]
            assert msg['role'] == 'assistant'
            assert msg['sent_via'] == 'whatsapp_app'

    def test_merged_messages_sorted_chronologically(self, app, db_session, sample_clinic):
        with app.app_context():
            conversation = Conversation(
                clinic_id=sample_clinic.id, phone_number='5511900000032',
                messages=[], context={}
            )
            db.session.add(conversation)
            db.session.commit()
            conversation.add_message('user', 'mensagem recente', evolution_id='WA_RECENT')
            db.session.commit()

            historical = [{
                'evolution_id': 'WA_OLDEST', 'from_me': False,
                'timestamp': datetime(2020, 1, 1, 10, 0, 0),
                'content': 'mensagem antiga', 'message_type': 'text',
                'media_url': None, 'media_mimetype': None, 'caption': None,
            }]

            conversation.merge_history_messages(historical)

            assert conversation.messages[0]['content'] == 'mensagem antiga'
            assert conversation.messages[1]['content'] == 'mensagem recente'


class TestWebhookFromMeMessage:
    def test_from_me_text_is_stored_and_transfers_to_human(self, app, db_session, sample_clinic):
        sample_clinic.evolution_instance_name = 'test-instance-fm'
        db.session.commit()

        payload = {
            'event': 'messages.upsert',
            'instance': 'test-instance-fm',
            'data': {
                'key': {'remoteJid': '5511900000040@s.whatsapp.net', 'fromMe': True, 'id': 'WA_FM_WEBHOOK'},
                'message': {'conversation': 'Respondendo direto pelo whats'},
            }
        }
        headers, body = webhook_headers(app, payload)
        client = app.test_client()
        response = client.post('/api/webhook/evolution', data=body, headers=headers)

        assert response.status_code == 200

        conversation = Conversation.query.filter_by(
            clinic_id=sample_clinic.id, phone_number='5511900000040'
        ).first()
        assert conversation is not None
        assert conversation.status == 'transferred_to_human'
        last = conversation.messages[-1]
        assert last['role'] == 'assistant'
        assert last['content'] == 'Respondendo direto pelo whats'
        assert last['sent_via'] == 'whatsapp_app'

    def test_from_me_with_no_content_is_ignored(self, app, db_session, sample_clinic):
        sample_clinic.evolution_instance_name = 'test-instance-fm2'
        db.session.commit()

        payload = {
            'event': 'messages.upsert',
            'instance': 'test-instance-fm2',
            'data': {
                'key': {'remoteJid': '5511900000041@s.whatsapp.net', 'fromMe': True, 'id': 'WA_FM_EMPTY'},
                'message': {},
            }
        }
        headers, body = webhook_headers(app, payload)
        client = app.test_client()
        response = client.post('/api/webhook/evolution', data=body, headers=headers)

        assert response.status_code == 200
        assert response.get_json()['status'] == 'ignored'

        conversation = Conversation.query.filter_by(
            clinic_id=sample_clinic.id, phone_number='5511900000041'
        ).first()
        assert conversation is None


class TestSyncHistoryService:
    def test_sync_history_from_whatsapp_merges_and_commits(self, app, db_session, sample_clinic, monkeypatch):
        with app.app_context():
            conversation = Conversation(
                clinic_id=sample_clinic.id, phone_number='5511900000050',
                messages=[], context={}
            )
            db.session.add(conversation)
            db.session.commit()

            def fake_fetch(self, phone, max_messages=2000):
                return [{
                    'evolution_id': 'WA_SYNC_1', 'from_me': False,
                    'timestamp': datetime(2026, 1, 1, 8, 0, 0),
                    'content': 'historico importado', 'message_type': 'text',
                    'media_url': None, 'media_mimetype': None, 'caption': None,
                }]

            monkeypatch.setattr(EvolutionService, 'fetch_chat_history', fake_fetch)

            added = ConversationService(sample_clinic).sync_history_from_whatsapp(conversation)

            assert added == 1
            assert conversation.messages[0]['content'] == 'historico importado'

    def test_sync_history_route(self, app, client, auth_headers, sample_clinic, db_session, monkeypatch):
        with app.app_context():
            conversation = Conversation(
                clinic_id=sample_clinic.id, phone_number='5511900000051',
                messages=[], context={}
            )
            db.session.add(conversation)
            db.session.commit()
            conversation_id = str(conversation.id)

            def fake_fetch(self, phone, max_messages=2000):
                return [{
                    'evolution_id': 'WA_SYNC_ROUTE', 'from_me': False,
                    'timestamp': datetime(2026, 1, 1, 8, 0, 0),
                    'content': 'via rota', 'message_type': 'text',
                    'media_url': None, 'media_mimetype': None, 'caption': None,
                }]

            monkeypatch.setattr(EvolutionService, 'fetch_chat_history', fake_fetch)

            response = client.post(
                f'/api/conversations/{conversation_id}/sync-history',
                headers=auth_headers
            )

            assert response.status_code == 200
            data = response.get_json()
            assert data['added'] == 1
            assert any(m['content'] == 'via rota' for m in data['conversation']['messages'])

    def test_sync_all_history_route(self, app, client, auth_headers, sample_clinic, db_session, monkeypatch):
        with app.app_context():
            conversation = Conversation(
                clinic_id=sample_clinic.id, phone_number='5511900000052',
                messages=[], context={}
            )
            db.session.add(conversation)
            db.session.commit()

            monkeypatch.setattr(EvolutionService, 'fetch_chat_history', lambda self, phone, max_messages=2000: [])

            response = client.post('/api/conversations/sync-all-history', headers=auth_headers)

            assert response.status_code == 200
            data = response.get_json()
            assert 'synced' in data
            assert 'total_added' in data
            assert 'remaining' in data


class TestFetchChatHistoryPagination:
    def test_stops_when_page_smaller_than_page_size(self, app, sample_clinic, monkeypatch):
        with app.app_context():
            app.config['EVOLUTION_API_URL'] = 'https://fake-evolution.test'
            app.config['EVOLUTION_API_KEY'] = 'fake-key'
            sample_clinic.evolution_instance_name = 'fetch-history-instance'

            from app.services import evolution_service as evolution_service_module

            page_size = evolution_service_module.HISTORY_PAGE_SIZE

            call_count = {'n': 0}

            class FakeResponse:
                def __init__(self, records):
                    self._records = records

                def raise_for_status(self):
                    pass

                def json(self):
                    return {'messages': {'records': self._records}}

            def fake_post(url, json=None, headers=None, timeout=None):
                call_count['n'] += 1
                if call_count['n'] == 1:
                    records = [
                        {
                            'key': {'remoteJid': '5511900000060@s.whatsapp.net', 'fromMe': False, 'id': f'WA_{i}'},
                            'message': {'conversation': f'msg {i}'},
                            'messageTimestamp': 1700000000 + i,
                        }
                        for i in range(page_size)
                    ]
                    return FakeResponse(records)
                return FakeResponse([])

            monkeypatch.setattr(evolution_service_module.requests, 'post', fake_post)

            service = EvolutionService(sample_clinic)
            result = service.fetch_chat_history('5511900000060', max_messages=5000)

            assert len(result) == page_size
            assert call_count['n'] == 2
