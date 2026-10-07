"""User setup: draft isolation, honest activation and safe test conversations."""
from types import SimpleNamespace
from uuid import uuid4
from unittest.mock import patch
import pytest
from app import db
from app.models import Clinic, Conversation
from app.services.claude_service import ClaudeService
from app.services.agent_setup import instructions


def test_get_config_preserves_legacy_and_does_not_expose_secrets(client, app, sample_clinic, auth_headers):
    with app.app_context():
        sample_clinic.agent_context = 'Estacionamento antigo'
        sample_clinic.agent_system_prompt = 'Instruções existentes'
        sample_clinic.openrouter_api_key = 'private-test-key'
        db.session.commit()
    response = client.get('/api/agents/config', headers=auth_headers)
    assert response.status_code == 200
    data = response.json
    assert data['context'] == 'Estacionamento antigo'
    assert data['system_prompt'] == 'Instruções existentes'
    assert data['settings']['tone'] == 'balanced'
    assert data['ai_configured'] is True
    assert 'private-test-key' not in response.get_data(as_text=True)


@pytest.mark.parametrize('data', [
    {'settings': {'tone': 'unknown'}}, {'temperature': 'nan'},
    {'temperature': 1.1}, {'settings': {'show_prices': 'yes'}},
    {'automation': {'recall_inactive_days': 2}}, {'agent_enabled': 'false'},
])
def test_invalid_config_does_not_partially_publish(client, app, sample_clinic, auth_headers, data):
    response = client.put('/api/agents/config', headers=auth_headers, json={'name': 'Changed', **data})
    assert response.status_code == 400
    with app.app_context():
        assert db.session.get(Clinic, sample_clinic.id).agent_name != 'Changed'


def test_activation_requires_live_connection_and_pause_preserves_settings(client, app, sample_clinic, auth_headers):
    with app.app_context():
        sample_clinic.openrouter_api_key = 'test-key'
        sample_clinic.agent_settings = {'address': 'Rua antiga'}
        sample_clinic.agent_enabled = False
        db.session.commit()
    with patch('app.services.evolution_service.EvolutionService.get_instance_status', return_value={'connected': False}):
        response = client.put('/api/agents/config', headers=auth_headers, json={'name': 'Draft', 'agent_enabled': True})
    assert response.status_code == 409
    with patch('app.services.evolution_service.EvolutionService.get_instance_status', return_value={'connected': True}):
        response = client.put('/api/agents/config', headers=auth_headers, json={'agent_enabled': True, 'settings': {'tone': 'warm'}})
    assert response.status_code == 200
    assert response.json['config']['settings']['address'] == 'Rua antiga'
    with patch('app.services.evolution_service.EvolutionService.get_instance_status', side_effect=RuntimeError('offline')) as status:
        paused = client.put('/api/agents/config', headers=auth_headers, json={'agent_enabled': False})
        status.assert_not_called()
    assert paused.json['config']['agent_enabled'] is False
    assert paused.json['config']['settings']['tone'] == 'warm'


def test_preview_sessions_are_isolated_without_saving_draft(client, app, sample_clinic, auth_headers):
    with app.app_context():
        sample_clinic.openrouter_api_key = 'test-key'
        db.session.commit()
    sessions = [str(uuid4()), str(uuid4())]
    seen = []
    def process(service, conversation, message):
        seen.append((str(conversation.id), service._overrides))
        return 'Resposta de teste'
    with patch.object(ClaudeService, 'process_message', autospec=True, side_effect=process):
        for session in [sessions[0], sessions[0], sessions[1]]:
            response = client.post('/api/agents/test', headers=auth_headers, json={
                'message': 'Olá', 'session_id': session, 'name': 'Draft',
                'settings': {'address': 'Rua do rascunho', 'tone': 'direct'},
            })
            assert response.status_code == 200
    assert seen[0][0] == seen[1][0]
    assert seen[2][0] != seen[0][0]
    assert seen[0][1]['settings']['address'] == 'Rua do rascunho'
    with app.app_context():
        clinic = db.session.get(Clinic, sample_clinic.id)
        assert not clinic.agent_settings
        assert clinic.agent_name != 'Draft'
        assert all(item.phone_number.startswith('TEST-') for item in Conversation.query.filter_by(clinic_id=clinic.id))
        assert all(len(item.phone_number) <= 20 for item in Conversation.query.filter_by(clinic_id=clinic.id))


def test_simulator_does_not_execute_mutating_tools(app, sample_clinic):
    with app.app_context():
        sample_clinic.openrouter_api_key = 'test-key'
        service = ClaudeService(sample_clinic)
        conversation = SimpleNamespace(phone_number='TEST-123')
        with patch.object(service, '_tool_create_appointment') as handler:
            result = service._execute_tool('create_appointment', {}, conversation)
            assert 'Simulação' in result
            handler.assert_not_called()
        assert service._execute_tool('transfer_to_human', {}, conversation).startswith('Simulação')


def test_structured_options_apply_to_prompt_and_service_prices(app, sample_clinic):
    with app.app_context():
        sample_clinic.openrouter_api_key = 'test-key'
        sample_clinic.services = [{'name': 'Limpeza', 'price': 250, 'duration': 30}]
        service = ClaudeService(sample_clinic, overrides={'name': 'Lia', 'settings': {
            'tone': 'direct', 'show_prices': False, 'address': 'Rua Central, 10',
        }})
        prompt = instructions(sample_clinic, service._overrides)
        assert 'Seu nome é Lia' in prompt
        assert 'curtas e diretas' in prompt
        assert 'Rua Central, 10' in prompt
        assert 'Não informe valores' in prompt
        assert '250' not in service._format_services()


def test_simulator_loop_limit_does_not_notify_reception(app, sample_clinic):
    from tests.test_ai_usage import FakeResponse, FakeToolCall, _mock_create
    from app.services.conversation_service import ConversationService
    with app.app_context():
        sample_clinic.openrouter_api_key = 'test-key'
        service = ClaudeService(sample_clinic)
        conversation = ConversationService(sample_clinic).get_or_create_conversation('TEST-loop')
        patcher, completion = _mock_create(service)
        completion.return_value = FakeResponse('tool_calls', tool_calls=[FakeToolCall('t1', 'get_current_datetime')])
        try:
            with patch.object(service.conversation_service, 'transfer_to_human') as transfer:
                assert service.process_message(conversation, 'Oi').startswith('Simulação:')
                transfer.assert_not_called()
        finally:
            patcher.stop()
        assert conversation.status == 'active'
