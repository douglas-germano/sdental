"""
APScheduler configuration for background tasks.
"""
import logging
import atexit
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

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
