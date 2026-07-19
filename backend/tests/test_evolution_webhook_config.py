"""
Regression coverage for EvolutionService.set_webhook().

Evolution API only sends back whatever headers we tell it to when calling our
webhook. utils/webhook_auth.py fails closed without a matching X-Webhook-Secret
(or signature) header, so if set_webhook() never asks Evolution to send it,
WEBHOOK_SECRET being configured on our side is not enough - every real
Evolution callback still gets rejected with 401 and the AI never sees a
message to reply to.
"""
from app.services.evolution_service import EvolutionService


class FakeResponse:
    def raise_for_status(self):
        pass

    def json(self):
        return {'webhook': {'enabled': True}}


class TestSetWebhookAuthHeader:
    def test_includes_secret_header_when_configured(self, app, sample_clinic, monkeypatch):
        with app.app_context():
            monkeypatch.setitem(app.config, 'EVOLUTION_API_URL', 'https://fake-evolution.test')
            monkeypatch.setitem(app.config, 'EVOLUTION_API_KEY', 'fake-key')
            monkeypatch.setitem(app.config, 'WEBHOOK_SECRET', 'super-secret-value')
            sample_clinic.evolution_instance_name = 'webhook-cfg-instance'

            from app.services import evolution_service as evolution_service_module

            captured = {}

            def fake_post(url, json=None, headers=None, timeout=None):
                captured['payload'] = json
                return FakeResponse()

            monkeypatch.setattr(evolution_service_module.requests, 'post', fake_post)

            service = EvolutionService(sample_clinic)
            service.set_webhook('https://backend.example.com/api/webhook/evolution')

            webhook_config = captured['payload']['webhook']
            assert webhook_config['headers'] == {'X-Webhook-Secret': 'super-secret-value'}

    def test_omits_headers_when_secret_not_configured(self, app, sample_clinic, monkeypatch):
        with app.app_context():
            monkeypatch.setitem(app.config, 'EVOLUTION_API_URL', 'https://fake-evolution.test')
            monkeypatch.setitem(app.config, 'EVOLUTION_API_KEY', 'fake-key')
            monkeypatch.setitem(app.config, 'WEBHOOK_SECRET', None)
            sample_clinic.evolution_instance_name = 'webhook-cfg-instance-2'

            from app.services import evolution_service as evolution_service_module

            captured = {}

            def fake_post(url, json=None, headers=None, timeout=None):
                captured['payload'] = json
                return FakeResponse()

            monkeypatch.setattr(evolution_service_module.requests, 'post', fake_post)

            service = EvolutionService(sample_clinic)
            service.set_webhook('https://backend.example.com/api/webhook/evolution')

            webhook_config = captured['payload']['webhook']
            assert 'headers' not in webhook_config
