"""
Tests for the Agentes IA screen's low-effort-configuration changes:

- ClaudeService accepts draft overrides (system_prompt/context/temperature)
  and uses them instead of the persisted clinic row, without ever writing
  them to the database - this is what lets "Testar" preview unsaved edits.
- POST /api/agents/test forwards those overrides from the request body.
- PUT /api/agents/config still persists real changes (the "apply template =
  save immediately" flow reuses the existing endpoint, just called earlier).
"""
from types import SimpleNamespace
from unittest.mock import patch

from app import db
from app.services.claude_service import ClaudeService
from app.services.conversation_service import ConversationService


class FakeUsage:
    def __init__(self):
        self.prompt_tokens = 10
        self.completion_tokens = 5
        self.total_tokens = 15
        self.cost = 0.0001
        self.prompt_tokens_details = None


class FakeResponse:
    def __init__(self, content):
        message = SimpleNamespace(content=content, tool_calls=[])
        choice = SimpleNamespace(finish_reason='stop', message=message)
        self.choices = [choice]
        self.usage = FakeUsage()


def _mock_create(service):
    patcher = patch.object(service.client.chat.completions, 'create')
    mock = patcher.start()
    mock.return_value = FakeResponse('ok')
    return patcher, mock


class TestClaudeServiceOverrides:
    def test_override_system_prompt_is_used_instead_of_persisted(self, app, sample_clinic, sample_patient):
        with app.app_context():
            sample_clinic.openrouter_api_key = 'test-key'
            sample_clinic.agent_system_prompt = 'PROMPT SALVO NO BANCO'
            db.session.commit()

            service = ClaudeService(sample_clinic, overrides={'system_prompt': 'RASCUNHO NA TELA'})
            conversation = ConversationService(sample_clinic).get_or_create_conversation(sample_patient.phone)

            patcher, mock_create = _mock_create(service)
            try:
                service.process_message(conversation, 'oi')
            finally:
                patcher.stop()

            sent_system = mock_create.call_args.kwargs['messages'][0]['content']
            assert 'RASCUNHO NA TELA' in sent_system
            assert 'PROMPT SALVO NO BANCO' not in sent_system

    def test_empty_override_falls_back_to_rich_backend_default(self, app, sample_clinic, sample_patient):
        """
        An empty draft (nothing typed/applied yet) must fall back to the
        real SYSTEM_PROMPT_STATIC_TEMPLATE default - not to some simplified
        placeholder - so "Testar" always matches actual WhatsApp behavior.
        """
        with app.app_context():
            sample_clinic.openrouter_api_key = 'test-key'
            sample_clinic.agent_system_prompt = None
            db.session.commit()

            service = ClaudeService(sample_clinic, overrides={'system_prompt': ''})
            conversation = ConversationService(sample_clinic).get_or_create_conversation(sample_patient.phone)

            patcher, mock_create = _mock_create(service)
            try:
                service.process_message(conversation, 'oi')
            finally:
                patcher.stop()

            sent_system = mock_create.call_args.kwargs['messages'][0]['content']
            # Default-template path sends a list of cache-control blocks
            assert isinstance(sent_system, list)
            assert 'assistente virtual de agendamento' in sent_system[0]['text']

    def test_override_never_persists_to_the_clinic_row(self, app, sample_clinic, sample_patient):
        with app.app_context():
            sample_clinic.openrouter_api_key = 'test-key'
            sample_clinic.agent_context = None
            db.session.commit()

            service = ClaudeService(sample_clinic, overrides={
                'context': 'Estacionamento gratuito na esquina', 'temperature': 0.1,
            })
            conversation = ConversationService(sample_clinic).get_or_create_conversation(sample_patient.phone)

            patcher, mock_create = _mock_create(service)
            try:
                service.process_message(conversation, 'oi')
            finally:
                patcher.stop()

            db.session.expire_all()
            persisted = db.session.get(type(sample_clinic), sample_clinic.id)
            assert persisted.agent_context is None
            assert persisted.agent_temperature == 0.7  # sample_clinic's original value, untouched

    def test_override_temperature_is_forwarded_to_the_api_call(self, app, sample_clinic, sample_patient):
        with app.app_context():
            sample_clinic.openrouter_api_key = 'test-key'
            service = ClaudeService(sample_clinic, overrides={'temperature': 0.2})
            conversation = ConversationService(sample_clinic).get_or_create_conversation(sample_patient.phone)

            patcher, mock_create = _mock_create(service)
            try:
                service.process_message(conversation, 'oi')
            finally:
                patcher.stop()

            assert mock_create.call_args.kwargs['temperature'] == 0.2


class TestTestAgentEndpointForwardsOverrides:
    def test_draft_overrides_change_the_response_without_saving(self, app, client, auth_headers, sample_clinic):
        with app.app_context():
            sample_clinic.openrouter_api_key = 'test-key'
            db.session.commit()

        with patch('app.services.claude_service.ClaudeService') as MockClaude:
            MockClaude.return_value.process_message.return_value = 'resposta de teste'

            response = client.post(
                '/api/agents/test',
                json={
                    'message': 'oi',
                    'system_prompt': 'Você é a assistente da {clinic_name}, bem direta.',
                    'context': 'Aceitamos PIX e cartão.',
                    'temperature': 0.3,
                },
                headers=auth_headers,
            )

        assert response.status_code == 200
        assert response.get_json()['response'] == 'resposta de teste'

        _, kwargs = MockClaude.call_args
        assert kwargs['overrides'] == {
            'system_prompt': 'Você é a assistente da {clinic_name}, bem direta.',
            'context': 'Aceitamos PIX e cartão.',
            'temperature': 0.3,
        }

        db.session.expire_all()
        persisted = db.session.get(type(sample_clinic), sample_clinic.id)
        assert persisted.agent_system_prompt is None

    def test_omitted_fields_are_not_forwarded_as_overrides(self, app, client, auth_headers, sample_clinic):
        with patch('app.services.claude_service.ClaudeService') as MockClaude:
            MockClaude.return_value.process_message.return_value = 'ok'
            client.post('/api/agents/test', json={'message': 'oi'}, headers=auth_headers)

        _, kwargs = MockClaude.call_args
        assert kwargs['overrides'] == {}

    def test_invalid_temperature_is_rejected(self, client, auth_headers, sample_clinic):
        response = client.post(
            '/api/agents/test',
            json={'message': 'oi', 'temperature': 'quente'},
            headers=auth_headers,
        )
        assert response.status_code == 400
