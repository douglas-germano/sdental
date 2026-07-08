"""
Tests for the AI agent-actions audit feed (GET /api/analytics/agent-actions),
backing the new /analytics dashboard page.
"""
from app import db
from app.models import AgentAction, AgentActionStatus, AgentActionType


class TestAgentActionsRoute:
    def test_requires_auth(self, client):
        response = client.get('/api/analytics/agent-actions')
        assert response.status_code == 401

    def test_lists_actions_with_patient_name(self, app, client, auth_headers, sample_clinic, sample_patient):
        with app.app_context():
            action = AgentAction(
                clinic_id=sample_clinic.id,
                patient_id=sample_patient.id,
                action_type=AgentActionType.RECALL,
                channel='whatsapp',
                status=AgentActionStatus.SENT,
                detail='Convite de recall enviado',
            )
            db.session.add(action)
            db.session.commit()
            action_id = action.id

        response = client.get('/api/analytics/agent-actions', headers=auth_headers)
        assert response.status_code == 200
        data = response.get_json()
        assert 'actions' in data and 'summary_30d' in data
        found = next(a for a in data['actions'] if a['action_type'] == AgentActionType.RECALL)
        assert found['patient_name'] == sample_patient.name
        assert data['summary_30d'].get(AgentActionType.RECALL) == 1

        with app.app_context():
            fresh = db.session.get(AgentAction, action_id)
            if fresh:
                db.session.delete(fresh)
                db.session.commit()

    def test_filters_by_type(self, app, client, auth_headers, sample_clinic, sample_patient):
        with app.app_context():
            a1 = AgentAction(
                clinic_id=sample_clinic.id, patient_id=sample_patient.id,
                action_type=AgentActionType.NOSHOW_RECOVERY, channel='whatsapp',
                status=AgentActionStatus.SENT, detail='x',
            )
            a2 = AgentAction(
                clinic_id=sample_clinic.id, patient_id=sample_patient.id,
                action_type=AgentActionType.WEEKLY_REPORT, channel='whatsapp',
                status=AgentActionStatus.SENT, detail='y',
            )
            db.session.add_all([a1, a2])
            db.session.commit()
            action_ids = [a1.id, a2.id]

        response = client.get(
            f'/api/analytics/agent-actions?type={AgentActionType.WEEKLY_REPORT}',
            headers=auth_headers,
        )
        assert response.status_code == 200
        types = {a['action_type'] for a in response.get_json()['actions']}
        assert types == {AgentActionType.WEEKLY_REPORT}

        with app.app_context():
            for action_id in action_ids:
                fresh = db.session.get(AgentAction, action_id)
                if fresh:
                    db.session.delete(fresh)
            db.session.commit()

    def test_ask_requires_question(self, client, auth_headers):
        response = client.post('/api/analytics/ask', headers=auth_headers, json={})
        assert response.status_code == 400
