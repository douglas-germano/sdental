"""
Tests for the operational hardening pieces: the cross-process scheduler job
lock and the daily AI spend alert.
"""
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from app import db
from app.models import AiUsageLog
from app.scheduler import ai_cost_alert_job
from app.utils.datetime_utils import utcnow
from app.utils.job_lock import try_acquire


class TestJobLock:
    def test_second_acquisition_is_refused_until_release(self, app):
        with app.app_context():
            release = try_acquire('test-job-a')
            assert release is not None

            # Same process, second "worker": must be refused
            assert try_acquire('test-job-a') is None

            release()
            release_again = try_acquire('test-job-a')
            assert release_again is not None
            release_again()

    def test_locks_are_scoped_per_job_id(self, app):
        with app.app_context():
            release_a = try_acquire('test-job-b')
            release_b = try_acquire('test-job-c')
            assert release_a is not None
            assert release_b is not None
            release_a()
            release_b()


class TestAiCostAlert:
    def _log_cost(self, clinic_id, cost, hours_ago=1):
        log = AiUsageLog(
            clinic_id=clinic_id,
            service='whatsapp',
            task='process_message',
            model='test-model',
            cost_usd=Decimal(str(cost)),
        )
        db.session.add(log)
        db.session.commit()
        log.created_at = utcnow() - timedelta(hours=hours_ago)
        db.session.commit()
        return log

    def test_alert_sent_when_clinic_crosses_threshold(self, app, db_session, sample_clinic):
        with app.app_context():
            app.config['AI_DAILY_COST_ALERT_USD'] = 5.0
            app.config['ADMIN_ALERT_EMAIL'] = 'operador@sdental.com'
            self._log_cost(sample_clinic.id, 4.0)
            self._log_cost(sample_clinic.id, 2.5)

            with patch('app.services.email_service.EmailService.send') as mock_send:
                ai_cost_alert_job()

            mock_send.assert_called_once()
            args = mock_send.call_args[0]
            assert args[0] == 'operador@sdental.com'
            assert 'custo de IA' in args[2]

    def test_no_alert_below_threshold(self, app, db_session, sample_clinic):
        with app.app_context():
            app.config['AI_DAILY_COST_ALERT_USD'] = 50.0
            app.config['ADMIN_ALERT_EMAIL'] = 'operador@sdental.com'
            self._log_cost(sample_clinic.id, 1.0)

            with patch('app.services.email_service.EmailService.send') as mock_send:
                ai_cost_alert_job()

            mock_send.assert_not_called()

    def test_disabled_when_threshold_zero(self, app, db_session, sample_clinic):
        with app.app_context():
            app.config['AI_DAILY_COST_ALERT_USD'] = 0
            self._log_cost(sample_clinic.id, 999.0)

            with patch('app.services.email_service.EmailService.send') as mock_send:
                ai_cost_alert_job()

            mock_send.assert_not_called()
