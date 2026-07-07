"""
Tests for the AI cost/token-waste fixes: usage tracking (AiUsageLog),
the tool-calling loop's iteration cap, prompt-caching request structure,
model tiering for internal/classification tasks, and the short-TTL cache
on redundant per-message DB lookups.
"""
import json
from types import SimpleNamespace
from unittest.mock import patch

from app import db
from app.models import AiUsageLog, AiUsageService, Professional, PipelineStage
from app.services.claude_service import ClaudeService, MAX_TOOL_ROUNDS as CLAUDE_MAX_ROUNDS
from app.services.assistant_service import AssistantService, MAX_TOOL_ROUNDS as ASSISTANT_MAX_ROUNDS
from app.services.conversation_service import ConversationService
from app.utils.ai_usage import record_ai_usage
from app.utils.cache import cache


# ---------------------------------------------------------------------- #
# Fakes standing in for the openai SDK's response objects, so the tool-  #
# loop / prompt-structure tests never make a real network call.         #
# ---------------------------------------------------------------------- #

class FakeUsage:
    def __init__(self, prompt_tokens=100, completion_tokens=50, total_tokens=150,
                 cost=0.0012, cached_tokens=None):
        self.prompt_tokens = prompt_tokens
        self.completion_tokens = completion_tokens
        self.total_tokens = total_tokens
        self.cost = cost
        self.prompt_tokens_details = (
            SimpleNamespace(cached_tokens=cached_tokens) if cached_tokens is not None else None
        )


class FakeToolCall:
    def __init__(self, call_id, name, arguments='{}'):
        self.id = call_id
        self.function = SimpleNamespace(name=name, arguments=arguments)

    def model_dump(self):
        return {
            'id': self.id, 'type': 'function',
            'function': {'name': self.function.name, 'arguments': self.function.arguments},
        }


class FakeResponse:
    def __init__(self, finish_reason, content=None, tool_calls=None, usage=None):
        message = SimpleNamespace(content=content, tool_calls=tool_calls or [])
        choice = SimpleNamespace(finish_reason=finish_reason, message=message)
        self.choices = [choice]
        self.usage = usage or FakeUsage()


def _mock_create(service):
    """Patch service.client.chat.completions.create and return the mock."""
    patcher = patch.object(service.client.chat.completions, 'create')
    mock = patcher.start()
    return patcher, mock


class TestRecordAiUsage:
    def test_persists_usage(self, app, sample_clinic):
        with app.app_context():
            response = FakeResponse('stop', content='ok', usage=FakeUsage(
                prompt_tokens=200, completion_tokens=40, total_tokens=240, cost=0.002, cached_tokens=150
            ))
            record_ai_usage(sample_clinic.id, AiUsageService.WHATSAPP, 'process_message', 'anthropic/claude-sonnet-4.5', response)

            log = AiUsageLog.query.filter_by(clinic_id=sample_clinic.id).first()
            assert log is not None
            assert log.service == AiUsageService.WHATSAPP
            assert log.task == 'process_message'
            assert log.total_tokens == 240
            assert log.cached_tokens == 150
            assert float(log.cost_usd) == 0.002

            db.session.delete(log)
            db.session.commit()

    def test_missing_usage_is_a_noop(self, app, sample_clinic):
        with app.app_context():
            response = SimpleNamespace(choices=[])  # no `usage` attribute at all
            record_ai_usage(sample_clinic.id, AiUsageService.ASSISTANT, 'process_message', 'model-x', response)
            assert AiUsageLog.query.filter_by(clinic_id=sample_clinic.id).count() == 0

    def test_never_raises_on_bad_input(self, app, sample_clinic):
        with app.app_context():
            # clinic_id=None violates the NOT NULL constraint - should be
            # caught, rolled back, and logged rather than propagating.
            response = FakeResponse('stop', usage=FakeUsage())
            record_ai_usage(None, AiUsageService.WHATSAPP, 'process_message', 'model-x', response)
            # session must still be usable afterwards (rollback happened cleanly)
            assert AiUsageLog.query.count() >= 0


class TestClaudeServiceToolLoopCap:
    def test_stops_after_max_rounds_and_transfers_to_human(self, app, sample_clinic, sample_patient):
        with app.app_context():
            sample_clinic.openrouter_api_key = 'test-key'
            service = ClaudeService(sample_clinic)
            conversation = ConversationService(sample_clinic).get_or_create_conversation(sample_patient.phone)

            # The model calls a (harmless, args-free) tool forever.
            infinite_tool_calls = FakeResponse(
                'tool_calls', tool_calls=[FakeToolCall('t1', 'get_current_datetime')]
            )
            patcher, mock_create = _mock_create(service)
            try:
                mock_create.return_value = infinite_tool_calls
                result = service.process_message(conversation, 'oi')
            finally:
                patcher.stop()

            assert 'transferir' in result.lower()
            # first call + MAX_TOOL_ROUNDS follow-up calls, then it bails out
            assert mock_create.call_count == CLAUDE_MAX_ROUNDS + 1

            db.session.refresh(conversation)
            assert conversation.status == 'transferred_to_human'

    def test_normal_reply_does_not_loop(self, app, sample_clinic, sample_patient):
        with app.app_context():
            sample_clinic.openrouter_api_key = 'test-key'
            service = ClaudeService(sample_clinic)
            conversation = ConversationService(sample_clinic).get_or_create_conversation(sample_patient.phone)

            patcher, mock_create = _mock_create(service)
            try:
                mock_create.return_value = FakeResponse('stop', content='Olá! Como posso ajudar?')
                result = service.process_message(conversation, 'oi')
            finally:
                patcher.stop()

            assert result == 'Olá! Como posso ajudar?'
            assert mock_create.call_count == 1


class TestClaudeServicePromptCaching:
    def test_system_prompt_and_tools_have_cache_control(self, app, sample_clinic, sample_patient):
        with app.app_context():
            sample_clinic.openrouter_api_key = 'test-key'
            service = ClaudeService(sample_clinic)
            conversation = ConversationService(sample_clinic).get_or_create_conversation(sample_patient.phone)

            patcher, mock_create = _mock_create(service)
            try:
                mock_create.return_value = FakeResponse('stop', content='ok')
                service.process_message(conversation, 'oi')
            finally:
                patcher.stop()

            _, kwargs = mock_create.call_args
            system_message = kwargs['messages'][0]
            assert system_message['role'] == 'system'
            assert isinstance(system_message['content'], list)
            assert len(system_message['content']) == 2
            assert system_message['content'][0]['cache_control'] == {'type': 'ephemeral'}
            # the dynamic (datetime/patient context) block must NOT be cached
            assert 'cache_control' not in system_message['content'][1]

            assert kwargs['tools'][-1]['cache_control'] == {'type': 'ephemeral'}
            assert kwargs['extra_body'] == {'usage': {'include': True}}

    def test_custom_agent_system_prompt_is_a_plain_string(self, app, sample_clinic, sample_patient):
        """The custom-prompt path is intentionally left uncached (see comment in
        process_message) - it must still work and send a plain string."""
        with app.app_context():
            sample_clinic.openrouter_api_key = 'test-key'
            sample_clinic.agent_system_prompt = 'Prompt customizado da clínica {clinic_name}.'
            service = ClaudeService(sample_clinic)
            conversation = ConversationService(sample_clinic).get_or_create_conversation(sample_patient.phone)

            patcher, mock_create = _mock_create(service)
            try:
                mock_create.return_value = FakeResponse('stop', content='ok')
                service.process_message(conversation, 'oi')
            finally:
                patcher.stop()

            system_message = mock_create.call_args.kwargs['messages'][0]
            assert isinstance(system_message['content'], str)

            sample_clinic.agent_system_prompt = None
            db.session.commit()


class TestClaudeServiceModelTiering:
    def test_classify_conversation_funnel_uses_light_model(self, app, sample_clinic, sample_patient):
        with app.app_context():
            sample_clinic.openrouter_api_key = 'test-key'
            service = ClaudeService(sample_clinic)
            conversation = ConversationService(sample_clinic).get_or_create_conversation(sample_patient.phone)
            service.conversation_service.add_message(conversation, 'user', 'Quero agendar uma limpeza')

            patcher, mock_create = _mock_create(service)
            try:
                mock_create.return_value = FakeResponse(
                    'stop', content='{"stage_name": "Contatado", "note": "interessado"}'
                )
                service.classify_conversation_funnel(conversation, ['Novo', 'Contatado'])
            finally:
                patcher.stop()

            used_model = mock_create.call_args.kwargs['model']
            assert used_model == app.config['OPENROUTER_MODEL_LIGHT']
            assert used_model != app.config['OPENROUTER_MODEL']

    def test_process_message_uses_main_model(self, app, sample_clinic, sample_patient):
        with app.app_context():
            sample_clinic.openrouter_api_key = 'test-key'
            service = ClaudeService(sample_clinic)
            conversation = ConversationService(sample_clinic).get_or_create_conversation(sample_patient.phone)

            patcher, mock_create = _mock_create(service)
            try:
                mock_create.return_value = FakeResponse('stop', content='ok')
                service.process_message(conversation, 'oi')
            finally:
                patcher.stop()

            assert mock_create.call_args.kwargs['model'] == app.config['OPENROUTER_MODEL']


class TestAssistantServiceToolLoopCap:
    def test_stops_after_max_rounds(self, app, sample_clinic):
        with app.app_context():
            from app.models import AssistantConversation
            sample_clinic.openrouter_api_key = 'test-key'
            service = AssistantService(sample_clinic)
            conversation = AssistantConversation(clinic_id=sample_clinic.id, messages=[])
            db.session.add(conversation)
            db.session.commit()

            infinite_tool_calls = FakeResponse(
                'tool_calls', tool_calls=[FakeToolCall('t1', 'get_billing_status')]
            )
            patcher, mock_create = _mock_create(service)
            try:
                mock_create.return_value = infinite_tool_calls
                result = service.process_message(conversation, 'como estamos indo?')
            finally:
                patcher.stop()

            assert 'não consegui' in result.lower()
            assert mock_create.call_count == ASSISTANT_MAX_ROUNDS + 1

            db.session.delete(conversation)
            db.session.commit()


class TestAssistantServicePromptCaching:
    def test_system_prompt_and_tools_have_cache_control(self, app, sample_clinic):
        with app.app_context():
            from app.models import AssistantConversation
            sample_clinic.openrouter_api_key = 'test-key'
            service = AssistantService(sample_clinic)
            conversation = AssistantConversation(clinic_id=sample_clinic.id, messages=[])
            db.session.add(conversation)
            db.session.commit()

            patcher, mock_create = _mock_create(service)
            try:
                mock_create.return_value = FakeResponse('stop', content='ok')
                service.process_message(conversation, 'oi')
            finally:
                patcher.stop()

            system_message = mock_create.call_args.kwargs['messages'][0]
            assert isinstance(system_message['content'], list)
            assert system_message['content'][0]['cache_control'] == {'type': 'ephemeral'}
            assert 'cache_control' not in system_message['content'][1]
            assert mock_create.call_args.kwargs['tools'][-1]['cache_control'] == {'type': 'ephemeral'}

            db.session.delete(conversation)
            db.session.commit()


class TestShortTtlDbCache:
    def test_professionals_text_is_cached_across_calls(self, app, sample_clinic):
        with app.app_context():
            cache.clear()
            from app.services.claude_service import _cached_active_professionals_text

            professional = Professional(clinic_id=sample_clinic.id, name='Dra. Cache', active=True)
            db.session.add(professional)
            db.session.commit()

            first = _cached_active_professionals_text(str(sample_clinic.id))
            assert 'Dra. Cache' in first

            # Deactivate without invalidating the cache - a cache hit should
            # still return the stale (pre-deactivation) text within the TTL.
            professional.active = False
            db.session.commit()

            second = _cached_active_professionals_text(str(sample_clinic.id))
            assert second == first

            db.session.delete(professional)
            db.session.commit()
            cache.clear()

    def test_pipeline_stages_text_is_cached_across_calls(self, app, sample_clinic):
        with app.app_context():
            cache.clear()
            from app.services.claude_service import _cached_pipeline_stages_text

            stage = PipelineStage(clinic_id=sample_clinic.id, name='Estágio Cache', order=0)
            db.session.add(stage)
            db.session.commit()

            first = _cached_pipeline_stages_text(str(sample_clinic.id))
            assert 'Estágio Cache' in first

            stage.name = 'Nome Alterado'
            db.session.commit()

            second = _cached_pipeline_stages_text(str(sample_clinic.id))
            assert second == first  # still the cached, pre-rename value

            db.session.delete(stage)
            db.session.commit()
            cache.clear()
