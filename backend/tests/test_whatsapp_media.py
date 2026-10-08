"""Decrypted media regression coverage for live, phone and history paths."""
from unittest.mock import patch
import pytest
from app import db
from app.models import Conversation, MediaAsset, Clinic
from app.services.evolution_service import EvolutionService
from app.services.media_service import persist_whatsapp_media
from app.utils.whatsapp_message import normalize_raw_message
import hashlib
import hmac
import json


def post_webhook(app, payload):
    body = json.dumps(payload).encode()
    signature = hmac.new(app.config['WEBHOOK_SECRET'].encode(), body, hashlib.sha256).hexdigest()
    return app.test_client().post('/api/webhook/evolution', data=body, headers={
        'Content-Type': 'application/json', 'X-Webhook-Signature': signature,
    })

@pytest.mark.parametrize('wrapper', ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension'])
def test_wrapped_sticker(wrapper):
    raw = {'message': {wrapper: {'message': {'stickerMessage': {'mimetype': 'image/webp'}}}}}
    assert normalize_raw_message(raw)['message_type'] == 'sticker'
    assert normalize_raw_message(raw)['content'] == 'Figurinha enviada'

@pytest.mark.parametrize('key,kind', [('videoMessage','video'), ('ptvMessage','video'), ('stickerMessage','sticker')])
def test_additional_types(key, kind):
    assert normalize_raw_message({'message': {key: {'mimetype': 'x'}}})['message_type'] == kind

def test_wrapped_document():
    raw = {'message': {'documentWithCaptionMessage': {'message': {'documentMessage': {'caption': 'Pedido'}}}}}
    assert normalize_raw_message(raw)['caption'] == 'Pedido'

def test_downloader_uses_full_message(app, sample_clinic):
    raw = {'key': {'id': 'image1'}, 'message': {'imageMessage': {'mediaKey': 'key'}}}
    with patch.dict(app.config, EVOLUTION_API_URL='https://gateway.test', EVOLUTION_API_KEY='test'), patch('app.services.evolution_service.requests.post') as request:
        request.return_value.json.return_value = {'base64': 'eA==', 'mimetype': 'image/png', 'fileName': 'foto.png'}
        result = EvolutionService(sample_clinic).get_media_base64('image1', raw_message=raw)
    assert request.call_args.kwargs['json']['message'] == raw
    assert result['filename'] == 'foto.png'

@pytest.mark.parametrize('from_me', [False, True])
@pytest.mark.parametrize('kind,mime', [('imageMessage','image/png'), ('stickerMessage','image/webp'), ('videoMessage','video/mp4')])
def test_live_and_phone_decrypted(app, sample_clinic, from_me, kind, mime):
    sample_clinic.evolution_instance_name = 'media-instance'
    db.session.commit()
    raw = {'key': {'id': f'{kind}-{from_me}', 'remoteJid': '5511900000801@s.whatsapp.net', 'fromMe': from_me}, 'message': {'ephemeralMessage': {'message': {kind: {'url': 'https://mmg.whatsapp.net/file.enc', 'mimetype': mime}}}}}
    with patch('app.services.media_service.EvolutionService') as evolution:
        evolution.return_value.get_media_base64.return_value = {'base64': f'data:{mime};base64,eA==', 'mimetype': mime}
        response = post_webhook(app, {'event': 'messages.upsert', 'instance': 'media-instance', 'data': raw})
    assert response.status_code == 200
    evolution.return_value.get_media_base64.assert_called_once_with(raw['key']['id'], raw_message=raw)
    conversation = Conversation.query.filter_by(clinic_id=sample_clinic.id, phone_number='5511900000801').first()
    message = conversation.messages[-1]
    assert message['media_url'].startswith('/api/media/')
    assert message['role'] == ('assistant' if from_me else 'user')
    asset = db.session.get(MediaAsset, message['media_url'].rsplit('/',1)[-1])
    assert asset.data == b'x'
    assert asset.mimetype == mime

def test_embedded_base64(app, sample_clinic):
    with patch('app.services.media_service.EvolutionService') as evolution:
        asset, encoded = persist_whatsapp_media(sample_clinic, 'embedded', 'image/webp', {'message': {'base64': 'eA=='}})
    evolution.assert_not_called()
    assert asset.data == b'x'
    db.session.rollback()

@pytest.mark.parametrize('payload', ['not-base64!', 'data:image/png,plain', '', 'a' * (12 * 1024 * 1024)])
def test_invalid_base64(app, sample_clinic, payload):
    with patch('app.services.media_service.EvolutionService') as evolution:
        evolution.return_value.get_media_base64.return_value = {'base64': payload}
        assert persist_whatsapp_media(sample_clinic, 'bad') is None

def make_conversation(clinic):
    conversation = Conversation(clinic_id=clinic.id, phone_number='5511900000802', messages=[])
    db.session.add(conversation)
    conversation.add_message('user', 'Figurinha enviada', evolution_id='old-sticker', message_type='sticker', media_url='https://mmg.whatsapp.net/file.enc', media_mimetype='image/webp')
    db.session.commit()
    return conversation, f'/api/media/conversations/{conversation.id}/{conversation.messages[-1]["id"]}'

def test_recovery_cached(app, client, auth_headers, sample_clinic):
    conversation, url = make_conversation(sample_clinic)
    with patch('app.services.media_service.EvolutionService') as evolution:
        evolution.return_value.get_media_base64.return_value = {'base64': 'eA==', 'mimetype': 'image/webp'}
        first = client.get(url, headers=auth_headers)
        second = client.get(url, headers=auth_headers)
    assert first.status_code == second.status_code == 200
    assert first.data == b'x'
    assert first.mimetype == 'image/webp'
    assert evolution.return_value.get_media_base64.call_count == 1
    db.session.refresh(conversation)
    assert conversation.messages[-1]['media_url'].startswith('/api/media/')

def test_recovery_scoped(app, client, auth_headers, sample_clinic):
    other = Clinic(name='Other', email='other-media@test.com', phone='5511999998888')
    other.set_password('TestPass123')
    db.session.add(other)
    db.session.commit()
    conversation, url = make_conversation(other)
    with patch('app.services.media_service.EvolutionService') as evolution:
        assert client.get(url, headers=auth_headers).status_code == 404
    evolution.assert_not_called()
    db.session.delete(db.session.get(Clinic, other.id))
    db.session.commit()

def test_expired_media(app, client, auth_headers, sample_clinic):
    conversation, url = make_conversation(sample_clinic)
    with patch('app.services.media_service.EvolutionService') as evolution:
        evolution.return_value.get_media_base64.return_value = None
        response = client.get(url, headers=auth_headers)
    assert response.status_code == 404
    assert 'reenvio' in response.get_json()['error']

def test_recovery_requires_auth(app, client, sample_clinic):
    _, url = make_conversation(sample_clinic)
    with patch('app.services.media_service.EvolutionService') as evolution:
        assert client.get(url).status_code == 401
    evolution.assert_not_called()

def test_recovery_accepts_query_token_and_serves_video(app, client, auth_headers, sample_clinic):
    conversation, url = make_conversation(sample_clinic)
    token = auth_headers['Authorization'].split(' ', 1)[1]
    with patch('app.services.media_service.EvolutionService') as evolution:
        evolution.return_value.get_media_base64.return_value = {'base64': 'eA==', 'mimetype': 'video/mp4'}
        response = client.get(f'{url}?token={token}')
    assert response.status_code == 200
    assert response.mimetype == 'video/mp4'
    assert response.headers['Content-Disposition'].startswith('inline')
