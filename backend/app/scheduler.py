"""
APScheduler configuration for background tasks.
"""
import logging
import atexit
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

from app.utils.datetime_utils import utcnow

logger = logging.getLogger(__name__)

scheduler = BackgroundScheduler()


def send_pending_reminders_job():
    """
    Job function to send pending appointment reminders.
    This runs inside an application context.
    """
    from flask import current_app

    # Import here to avoid circular imports
    from app.services.reminder_service import ReminderService

    try:
        service = ReminderService()
        results = service.send_pending_reminders()
        logger.info('Reminder job completed: %s', results)
    except Exception as e:
        logger.exception('Error in reminder job: %s', str(e))


def retry_failed_reminders_job():
    """
    Job function to retry failed reminders.
    """
    from flask import current_app
    from app.services.reminder_service import ReminderService

    try:
        service = ReminderService()
        results = service.retry_failed_reminders(max_attempts=3)
        if results['retried'] > 0:
            logger.info('Retry job completed: %s', results)
    except Exception as e:
        logger.exception('Error in retry job: %s', str(e))


def _run_for_clinics(job_name, method_name, filter_fn):
    """
    Run an AutomationService method for every clinic that matches filter_fn.
    Isolated per-clinic so one clinic's failure never aborts the batch.
    """
    from app.models import Clinic
    from app.services.automation_service import AutomationService

    clinics = Clinic.query.filter_by(active=True).all()
    totals = {}
    for clinic in clinics:
        if not filter_fn(clinic):
            continue
        try:
            service = AutomationService(clinic)
            result = getattr(service, method_name)()
            for k, v in (result or {}).items():
                totals[k] = totals.get(k, 0) + v
        except Exception:
            logger.exception('%s failed for clinic %s', job_name, clinic.id)
    if any(totals.values()):
        logger.info('%s completed: %s', job_name, totals)


def recovery_job():
    """No-show / cancellation recovery + waitlist offers (needs master switch)."""
    def _recover():
        _run_for_clinics('recovery', 'run_recovery', lambda c: c.proactive_outreach_enabled)
        _run_for_clinics('waitlist', 'fill_freed_slots', lambda c: c.proactive_outreach_enabled)
    _recover()


def recall_job():
    """Reactivation of long-inactive patients (needs master switch + recall flag)."""
    _run_for_clinics('recall', 'run_recall',
                     lambda c: c.proactive_outreach_enabled and c.recall_enabled)


def funnel_job():
    """Autonomous CRM funnel qualification (internal only, no patient messages)."""
    _run_for_clinics('funnel', 'qualify_recent_conversations',
                     lambda c: c.funnel_automation_enabled)


def weekly_report_job():
    """Proactive weekly performance digest to the clinic owner."""
    _run_for_clinics('weekly_report', 'send_weekly_report',
                     lambda c: c.weekly_report_enabled)


def suspend_late_subscriptions_job():
    """
    Suspend clinics whose Kiwify subscription has been "late" for longer
    than KIWIFY_GRACE_PERIOD_DAYS. Access is kept during the grace period
    (see BillingService.process_event) - this job is what actually revokes
    it once that window elapses. subscription_status stays 'late' (as
    opposed to 'canceled') so a renewal webhook can reactivate the clinic.
    """
    from datetime import datetime, timedelta
    from flask import current_app
    from app import db
    from app.models import Clinic, SubscriptionStatus

    grace_days = current_app.config.get('KIWIFY_GRACE_PERIOD_DAYS', 5)
    cutoff = utcnow() - timedelta(days=grace_days)

    clinics = Clinic.query.filter(
        Clinic.subscription_status == SubscriptionStatus.LATE,
        Clinic.active == True,  # noqa: E712 - SQLAlchemy comparison, not a Python bool check
        Clinic.subscription_late_since.isnot(None),
        Clinic.subscription_late_since < cutoff
    ).all()

    for clinic in clinics:
        clinic.active = False
        logger.info('Suspended clinic %s after %s days of late payment', clinic.id, grace_days)

    if clinics:
        db.session.commit()


def init_scheduler(app):
    """
    Initialize the scheduler with the Flask application.

    Args:
        app: Flask application instance
    """
    if scheduler.running:
        logger.warning('Scheduler already running, skipping initialization')
        return

    # Create a wrapper that provides app context
    def with_app_context(func):
        def wrapper():
            with app.app_context():
                func()
        return wrapper

    # Add job to check and send reminders every 5 minutes
    scheduler.add_job(
        func=with_app_context(send_pending_reminders_job),
        trigger=IntervalTrigger(minutes=5),
        id='send_reminders',
        name='Send pending appointment reminders',
        replace_existing=True
    )

    # Add job to retry failed reminders every 30 minutes
    scheduler.add_job(
        func=with_app_context(retry_failed_reminders_job),
        trigger=IntervalTrigger(minutes=30),
        id='retry_reminders',
        name='Retry failed reminders',
        replace_existing=True
    )

    # --- Autonomous / proactive AI jobs -----------------------------------
    # No-show/cancellation recovery + waitlist offers every 30 minutes.
    scheduler.add_job(
        func=with_app_context(recovery_job),
        trigger=IntervalTrigger(minutes=30),
        id='agent_recovery',
        name='Autonomous recovery and waitlist outreach',
        replace_existing=True
    )
    # Recall of inactive patients, twice a day.
    scheduler.add_job(
        func=with_app_context(recall_job),
        trigger=IntervalTrigger(hours=12),
        id='agent_recall',
        name='Autonomous patient recall',
        replace_existing=True
    )
    # CRM funnel qualification every 2 hours.
    scheduler.add_job(
        func=with_app_context(funnel_job),
        trigger=IntervalTrigger(hours=2),
        id='agent_funnel',
        name='Autonomous CRM funnel qualification',
        replace_existing=True
    )
    # Weekly performance digest - checked daily, sent at most once per week.
    scheduler.add_job(
        func=with_app_context(weekly_report_job),
        trigger=IntervalTrigger(hours=24),
        id='agent_weekly_report',
        name='Proactive weekly performance report',
        replace_existing=True
    )

    # Suspend clinics whose Kiwify payment has been late past the grace period.
    scheduler.add_job(
        func=with_app_context(suspend_late_subscriptions_job),
        trigger=IntervalTrigger(hours=24),
        id='suspend_late_subscriptions',
        name='Suspend clinics past the billing grace period',
        replace_existing=True
    )

    # Start scheduler
    scheduler.start()
    logger.info('Scheduler started with reminder jobs')

    # Shut down scheduler when app exits
    atexit.register(lambda: shutdown_scheduler())


def shutdown_scheduler():
    """Shutdown the scheduler gracefully."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info('Scheduler shut down')


def get_scheduler_status() -> dict:
    """
    Get the current status of the scheduler and its jobs.

    Returns:
        Dict with scheduler status information
    """
    if not scheduler.running:
        return {'running': False, 'jobs': []}

    jobs = []
    for job in scheduler.get_jobs():
        jobs.append({
            'id': job.id,
            'name': job.name,
            'next_run': job.next_run_time.isoformat() if job.next_run_time else None,
            'trigger': str(job.trigger)
        })

    return {
        'running': True,
        'jobs': jobs
    }
