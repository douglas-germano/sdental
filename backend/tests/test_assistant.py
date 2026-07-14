"""
Tests for the internal AI assistant (dashboard copilot) - separate from the
patient-facing WhatsApp ClaudeService. Covers route auth, message persistence,
and the read-only tool methods directly (no real Claude API calls are made).

Each test that touches the ORM directly runs inside a single
`with app.app_context()` block. Flask tears down the scoped session whenever
an app context pops (Flask-SQLAlchemy's teardown_appcontext handler calls
db.session.remove()), so opening several separate `with app.app_context()`
blocks in one test can silently discard session state between them - keep
everything for one test in a single block.
"""
import json
from datetime import timedelta
from unittest.mock import patch

from app.utils.datetime_utils import utcnow
from app import db
from app.models import (
    AssistantConversation, AssistantMemory, Patient, PipelineStage,
    Appointment, AppointmentStatus, Professional,
)
from app.services.assistant_service import AssistantService


class TestAssistantRoutesAuth:
    def test_get_messages_requires_auth(self, client):
        response = client.get('/api/assistant/messages')
        assert response.status_code == 401

    def test_post_message_requires_auth(self, client):
        response = client.post('/api/assistant/messages', json={'message': 'oi'})
        assert response.status_code == 401


class TestAssistantMessages:
    def test_get_messages_creates_empty_conversation(self, app, client, auth_headers, sample_clinic):
        response = client.get('/api/assistant/messages', headers=auth_headers)
        assert response.status_code == 200
        data = response.get_json()
        assert data['messages'] == []

        with app.app_context():
            conversation = AssistantConversation.query.filter_by(clinic_id=sample_clinic.id).first()
            assert conversation is not None

    def test_send_message_persists_both_sides_and_returns_reply(
        self, app, client, auth_headers, sample_clinic
    ):
        with app.app_context():
            sample_clinic.openrouter_api_key = 'test-key'
            db.session.commit()

        with patch.object(AssistantService, 'process_message', return_value='Resposta de teste'):
            response = client.post(
                '/api/assistant/messages', json={'message': 'Como foi meu mes?'}, headers=auth_headers
            )
        assert response.status_code == 200
        data = response.get_json()
        assert data['reply'] == 'Resposta de teste'

    def test_send_message_requires_non_empty_message(self, client, auth_headers):
        response = client.post('/api/assistant/messages', json={'message': '  '}, headers=auth_headers)
        assert response.status_code == 400

    def test_send_message_rejects_too_long_message(self, client, auth_headers):
        response = client.post(
            '/api/assistant/messages', json={'message': 'a' * 2001}, headers=auth_headers
        )
        assert response.status_code == 400

    def test_clear_messages(self, app, client, auth_headers, sample_clinic):
        with app.app_context():
            conversation = AssistantConversation(clinic_id=sample_clinic.id, messages=[])
            conversation.add_message('user', 'oi')
            db.session.add(conversation)
            db.session.commit()

        response = client.delete('/api/assistant/messages', headers=auth_headers)
        assert response.status_code == 200

        follow_up = client.get('/api/assistant/messages', headers=auth_headers)
        assert follow_up.get_json()['messages'] == []


class TestAssistantMemories:
    def test_list_memories_empty(self, client, auth_headers):
        response = client.get('/api/assistant/memories', headers=auth_headers)
        assert response.status_code == 200
        assert response.get_json()['memories'] == []

    def test_list_memories_returns_saved_facts(self, app, client, auth_headers, sample_clinic):
        with app.app_context():
            db.session.add(AssistantMemory(clinic_id=sample_clinic.id, content='Meta mensal: 100 consultas'))
            db.session.commit()

        response = client.get('/api/assistant/memories', headers=auth_headers)
        memories = response.get_json()['memories']
        assert len(memories) == 1
        assert memories[0]['content'] == 'Meta mensal: 100 consultas'

    def test_create_memory(self, client, auth_headers):
        response = client.post(
            '/api/assistant/memories', json={'content': 'Prefere lembretes 1 dia antes'}, headers=auth_headers
        )
        assert response.status_code == 201
        assert response.get_json()['memory']['content'] == 'Prefere lembretes 1 dia antes'

    def test_create_memory_requires_content(self, client, auth_headers):
        response = client.post('/api/assistant/memories', json={'content': '  '}, headers=auth_headers)
        assert response.status_code == 400

    def test_create_memory_rejects_too_long(self, client, auth_headers):
        response = client.post(
            '/api/assistant/memories', json={'content': 'a' * 501}, headers=auth_headers
        )
        assert response.status_code == 400

    def test_update_memory(self, app, client, auth_headers, sample_clinic):
        with app.app_context():
            memory = AssistantMemory(clinic_id=sample_clinic.id, content='Meta antiga')
            db.session.add(memory)
            db.session.commit()
            memory_id = str(memory.id)

        response = client.patch(
            f'/api/assistant/memories/{memory_id}', json={'content': 'Meta nova'}, headers=auth_headers
        )
        assert response.status_code == 200
        assert response.get_json()['memory']['content'] == 'Meta nova'

    def test_update_memory_not_found(self, client, auth_headers):
        response = client.patch(
            '/api/assistant/memories/00000000-0000-0000-0000-000000000000',
            json={'content': 'x'}, headers=auth_headers
        )
        assert response.status_code == 404

    def test_delete_memory(self, app, client, auth_headers, sample_clinic):
        with app.app_context():
            memory = AssistantMemory(clinic_id=sample_clinic.id, content='Vai ser removida')
            db.session.add(memory)
            db.session.commit()
            memory_id = str(memory.id)

        response = client.delete(f'/api/assistant/memories/{memory_id}', headers=auth_headers)
        assert response.status_code == 200

        follow_up = client.get('/api/assistant/memories', headers=auth_headers)
        assert follow_up.get_json()['memories'] == []

    def test_delete_memory_not_found(self, client, auth_headers):
        response = client.delete(
            '/api/assistant/memories/00000000-0000-0000-0000-000000000000', headers=auth_headers
        )
        assert response.status_code == 404


class TestAssistantServiceTools:
    """Exercise the tool methods directly, bypassing the Claude API call."""

    def test_list_patients(self, app, sample_clinic, sample_patient):
        with app.app_context():
            sample_clinic.openrouter_api_key = 'test-key'
            service = AssistantService(sample_clinic)
            result = service._tool_list_patients({})
            assert 'Test Patient' in result

    def test_list_patients_no_match(self, app, sample_clinic, sample_patient):
        with app.app_context():
            sample_clinic.openrouter_api_key = 'test-key'
            service = AssistantService(sample_clinic)
            result = service._tool_list_patients({'search': 'Nobody Here'})
            assert 'Nenhum paciente' in result

    def test_get_patient_details_requires_identifier(self, app, sample_clinic):
        with app.app_context():
            sample_clinic.openrouter_api_key = 'test-key'
            service = AssistantService(sample_clinic)
            result = service._tool_get_patient_details({})
            assert 'Informe o nome ou telefone' in result

    def test_get_patient_details_found(self, app, sample_clinic, sample_patient):
        with app.app_context():
            sample_clinic.openrouter_api_key = 'test-key'
            service = AssistantService(sample_clinic)
            result = service._tool_get_patient_details({'patient_name': 'Test Patient'})
            assert 'patient@test.com' in result

    def test_list_appointments(self, app, sample_clinic, sample_appointment):
        with app.app_context():
            sample_clinic.openrouter_api_key = 'test-key'
            service = AssistantService(sample_clinic)
            result = service._tool_list_appointments({})
            assert 'Consulta Geral' in result

    def test_list_professionals_empty(self, app, sample_clinic):
        with app.app_context():
            sample_clinic.openrouter_api_key = 'test-key'
            service = AssistantService(sample_clinic)
            result = service._tool_list_professionals({})
            assert 'não tem profissionais' in result

    def test_get_pipeline_overview(self, app, sample_clinic, sample_patient):
        with app.app_context():
            # Flask-SQLAlchemy scopes db.session by the *current app context
            # object's id*, so sample_patient (loaded under the fixture's own
            # app context) belongs to a different session here - mutating it
            # directly wouldn't be tracked by this context's session. Re-fetch
            # it through db.session.get() so the update actually flushes.
            patient = db.session.get(Patient, sample_patient.id)
            stage = PipelineStage(clinic_id=sample_clinic.id, name='Novo Lead', order=0)
            db.session.add(stage)
            db.session.commit()
            patient.pipeline_stage_id = stage.id
            db.session.commit()

            sample_clinic.openrouter_api_key = 'test-key'
            service = AssistantService(sample_clinic)
            result = service._tool_get_pipeline_overview({})
            assert 'Novo Lead' in result
            assert '"patient_count": 1' in result

            # Clean up so the sample_clinic fixture's teardown delete doesn't
            # hit a foreign key violation from this test-created stage.
            patient.pipeline_stage_id = None
            db.session.delete(stage)
            db.session.commit()

    def test_get_billing_status(self, app, sample_clinic):
        with app.app_context():
            sample_clinic.openrouter_api_key = 'test-key'
            service = AssistantService(sample_clinic)
            result = service._tool_get_billing_status({})
            assert 'subscription_status' in result

    def test_get_clinic_settings(self, app, sample_clinic):
        with app.app_context():
            sample_clinic.openrouter_api_key = 'test-key'
            service = AssistantService(sample_clinic)
            result = service._tool_get_clinic_settings({})
            assert 'business_hours' in result

    def test_compare_periods(self, app, sample_clinic, sample_patient):
        with app.app_context():
            appt = Appointment(
                clinic_id=sample_clinic.id,
                patient_id=sample_patient.id,
                service_name='Consulta Geral',
                scheduled_datetime=utcnow() - timedelta(days=5),
                status=AppointmentStatus.COMPLETED,
            )
            db.session.add(appt)
            db.session.commit()

            sample_clinic.openrouter_api_key = 'test-key'
            service = AssistantService(sample_clinic)
            result = json.loads(service._tool_compare_periods({'days': 30}))
            assert result['current']['completed'] == 1
            assert result['previous']['completed'] == 0

            db.session.delete(appt)
            db.session.commit()

    def test_get_professional_performance(self, app, sample_clinic, sample_patient):
        with app.app_context():
            sample_clinic.services = [{'name': 'Consulta Geral', 'duration': 30, 'price': 150}]
            professional = Professional(clinic_id=sample_clinic.id, name='Dra. Ana', specialty='Ortodontia')
            db.session.add(professional)
            db.session.commit()

            appt = Appointment(
                clinic_id=sample_clinic.id,
                patient_id=sample_patient.id,
                professional_id=professional.id,
                service_name='Consulta Geral',
                scheduled_datetime=utcnow() - timedelta(days=2),
                status=AppointmentStatus.COMPLETED,
            )
            db.session.add(appt)
            db.session.commit()

            sample_clinic.openrouter_api_key = 'test-key'
            service = AssistantService(sample_clinic)
            result = json.loads(service._tool_get_professional_performance({'days': 30}))
            assert result['professionals'][0]['professional_name'] == 'Dra. Ana'
            assert result['professionals'][0]['completed'] == 1
            assert result['professionals'][0]['estimated_revenue'] == 150

            db.session.delete(appt)
            db.session.delete(professional)
            db.session.commit()

    def test_get_professional_performance_no_match(self, app, sample_clinic):
        with app.app_context():
            sample_clinic.openrouter_api_key = 'test-key'
            service = AssistantService(sample_clinic)
            result = service._tool_get_professional_performance({'professional_name': 'Ninguem'})
            assert 'Nenhum profissional' in result

    def test_get_patient_retention_counts_recurring(self, app, sample_clinic, sample_patient):
        with app.app_context():
            other_patient = Patient(clinic_id=sample_clinic.id, name='Outro Paciente', phone='5511777777777')
            db.session.add(other_patient)
            db.session.commit()

            appts = [
                Appointment(
                    clinic_id=sample_clinic.id, patient_id=sample_patient.id,
                    service_name='Consulta Geral',
                    scheduled_datetime=utcnow() - timedelta(days=10),
                    status=AppointmentStatus.COMPLETED,
                ),
                Appointment(
                    clinic_id=sample_clinic.id, patient_id=sample_patient.id,
                    service_name='Retorno',
                    scheduled_datetime=utcnow() - timedelta(days=1),
                    status=AppointmentStatus.COMPLETED,
                ),
                Appointment(
                    clinic_id=sample_clinic.id, patient_id=other_patient.id,
                    service_name='Consulta Geral',
                    scheduled_datetime=utcnow() - timedelta(days=3),
                    status=AppointmentStatus.COMPLETED,
                ),
            ]
            db.session.add_all(appts)
            db.session.commit()

            sample_clinic.openrouter_api_key = 'test-key'
            service = AssistantService(sample_clinic)
            result = json.loads(service._tool_get_patient_retention({'days': 30}))
            assert result['active_patients'] == 2
            assert result['recurring_patients'] == 1
            assert result['single_visit_patients'] == 1

            for a in appts:
                db.session.delete(a)
            db.session.delete(other_patient)
            db.session.commit()

    def test_get_patient_retention_no_data(self, app, sample_clinic):
        with app.app_context():
            sample_clinic.openrouter_api_key = 'test-key'
            service = AssistantService(sample_clinic)
            result = service._tool_get_patient_retention({})
            assert 'Nenhum paciente' in result

    def test_remember_fact_persists(self, app, sample_clinic):
        with app.app_context():
            sample_clinic.openrouter_api_key = 'test-key'
            service = AssistantService(sample_clinic)
            result = service._tool_remember_fact({'content': 'Meta mensal e 100 consultas'})
            assert 'Anotado' in result
            assert AssistantMemory.query.filter_by(clinic_id=sample_clinic.id).count() == 1

    def test_remember_fact_requires_content(self, app, sample_clinic):
        with app.app_context():
            sample_clinic.openrouter_api_key = 'test-key'
            service = AssistantService(sample_clinic)
            result = service._tool_remember_fact({})
            assert 'Nenhum conteúdo' in result

    def test_execute_tool_unknown_tool(self, app, sample_clinic):
        with app.app_context():
            sample_clinic.openrouter_api_key = 'test-key'
            service = AssistantService(sample_clinic)
            result = service._execute_tool('does_not_exist', {})
            assert 'não reconhecida' in result

    def test_service_requires_api_key(self, app, sample_clinic):
        with app.app_context():
            sample_clinic.openrouter_api_key = None
            app.config['OPENROUTER_API_KEY'] = None
            try:
                AssistantService(sample_clinic)
                assert False, 'expected ValueError'
            except ValueError:
                pass
