"""
Service for managing appointment reminders.
"""
import logging
from datetime import datetime, timedelta
from typing import List, Optional
from zoneinfo import ZoneInfo

from app import db
from app.models import (
    Appointment,
    AppointmentReminder,
    AppointmentStatus,
    ReminderStatus,
    ReminderType,
    Clinic
)
from app.services.evolution_service import EvolutionService
from app.services.email_service import EmailService

logger = logging.getLogger(__name__)

# Timezone for Brazil
BR_TZ = ZoneInfo('America/Sao_Paulo')

# Default reminder message templates
DEFAULT_REMINDER_24H = """Olá {patient_name}! 👋

Passando para lembrar que você tem uma consulta agendada para *amanhã*:

📅 *Data:* {date}
⏰ *Horário:* {time}
🏥 *Serviço:* {service}

Se precisar remarcar ou cancelar, entre em contato conosco.

Até amanhã! 😊"""

DEFAULT_REMINDER_1H = """Olá {patient_name}! 👋

Sua consulta é *daqui a 1 hora*:

⏰ *Horário:* {time}
🏥 *Serviço:* {service}

Estamos te esperando! 😊"""

DEFAULT_FOLLOW_UP = """Olá {patient_name}! 👋

Passando para saber como foi sua consulta de *{service}* hoje na {clinic_name}.

Ficou com alguma dúvida ou precisa de algo? É só responder por aqui. 😊"""

# How long after an appointment's scheduled end time to send the follow-up
FOLLOW_UP_DELAY_AFTER_APPOINTMENT = timedelta(hours=2)


class ReminderService:
    """Service for scheduling and sending appointment reminders."""

    def __init__(self, clinic: Optional[Clinic] = None):
        self.clinic = clinic

    def schedule_reminders_for_appointment(self, appointment: Appointment) -> List[AppointmentReminder]:
        """
        Schedule reminders for a new appointment.

        Args:
            appointment: The appointment to schedule reminders for

        Returns:
            List of created reminders
        """
        clinic = appointment.clinic
        if not clinic.reminders_enabled:
            logger.info('Reminders disabled for clinic %s', clinic.id)
            return []

        reminders = []
        now = datetime.now(BR_TZ).replace(tzinfo=None)
        scheduled_dt = appointment.scheduled_datetime

        # Schedule 24h reminder
        if clinic.reminder_24h_enabled:
            reminder_time = scheduled_dt - timedelta(hours=24)
            if reminder_time > now:
                reminder = AppointmentReminder(
                    appointment_id=appointment.id,
                    reminder_type=ReminderType.REMINDER_24H,
                    scheduled_for=reminder_time,
                    status=ReminderStatus.PENDING
                )
                db.session.add(reminder)
                reminders.append(reminder)
                logger.info('Scheduled 24h reminder for appointment %s at %s',
                           appointment.id, reminder_time)

        # Schedule 1h reminder
        if clinic.reminder_1h_enabled:
            reminder_time = scheduled_dt - timedelta(hours=1)
            if reminder_time > now:
                reminder = AppointmentReminder(
                    appointment_id=appointment.id,
                    reminder_type=ReminderType.REMINDER_1H,
                    scheduled_for=reminder_time,
                    status=ReminderStatus.PENDING
                )
                db.session.add(reminder)
                reminders.append(reminder)
                logger.info('Scheduled 1h reminder for appointment %s at %s',
                           appointment.id, reminder_time)

        # Schedule post-appointment follow-up
        follow_up_time = scheduled_dt + timedelta(minutes=appointment.duration_minutes) + FOLLOW_UP_DELAY_AFTER_APPOINTMENT
        if follow_up_time > now:
            reminder = AppointmentReminder(
                appointment_id=appointment.id,
                reminder_type=ReminderType.FOLLOW_UP,
                scheduled_for=follow_up_time,
                status=ReminderStatus.PENDING
            )
            db.session.add(reminder)
            reminders.append(reminder)
            logger.info('Scheduled follow-up for appointment %s at %s',
                       appointment.id, follow_up_time)

        if reminders:
            db.session.commit()

        return reminders

    def cancel_reminders_for_appointment(self, appointment_id) -> int:
        """
        Cancel all pending reminders for an appointment.

        Args:
            appointment_id: The appointment ID

        Returns:
            Number of reminders cancelled
        """
        count = AppointmentReminder.query.filter(
            AppointmentReminder.appointment_id == appointment_id,
            AppointmentReminder.status == ReminderStatus.PENDING
        ).update({'status': ReminderStatus.CANCELLED})

        db.session.commit()
        logger.info('Cancelled %d reminders for appointment %s', count, appointment_id)

        return count

    def get_pending_reminders(self) -> List[AppointmentReminder]:
        """
        Get all reminders that are due to be sent.

        Returns:
            List of pending reminders ready to send
        """
        now = datetime.now(BR_TZ).replace(tzinfo=None)

        return AppointmentReminder.query.filter(
            AppointmentReminder.status == ReminderStatus.PENDING,
            AppointmentReminder.scheduled_for <= now
        ).join(Appointment).filter(
            db.or_(
                db.and_(
                    AppointmentReminder.reminder_type == ReminderType.FOLLOW_UP,
                    Appointment.status.in_([AppointmentStatus.CONFIRMED, AppointmentStatus.COMPLETED])
                ),
                db.and_(
                    AppointmentReminder.reminder_type != ReminderType.FOLLOW_UP,
                    Appointment.status.in_([AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED])
                )
            )
        ).all()

    def send_reminder(self, reminder: AppointmentReminder) -> bool:
        """
        Send a single reminder via WhatsApp.

        Args:
            reminder: The reminder to send

        Returns:
            True if sent successfully, False otherwise
        """
        appointment = reminder.appointment
        patient = appointment.patient
        clinic = appointment.clinic

        if not patient or not patient.phone:
            logger.warning('No phone number for patient, skipping reminder %s', reminder.id)
            reminder.mark_failed('Patient has no phone number')
            db.session.commit()
            return False

        # Check if appointment is still valid for this reminder type
        if reminder.reminder_type == ReminderType.FOLLOW_UP:
            valid_statuses = [AppointmentStatus.CONFIRMED, AppointmentStatus.COMPLETED]
        else:
            valid_statuses = [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED]

        if appointment.status not in valid_statuses:
            logger.info('Appointment %s is no longer active, cancelling reminder', appointment.id)
            reminder.cancel()
            db.session.commit()
            return False

        # Format message
        message = self._format_reminder_message(reminder, appointment, patient, clinic)

        # Send via WhatsApp
        try:
            evolution = EvolutionService(clinic)
            result = evolution.send_message(patient.phone, message)

            if 'error' in result:
                logger.error('Failed to send reminder %s: %s', reminder.id, result['error'])
                reminder.mark_failed(result['error'])
                db.session.commit()
                return False

            reminder.mark_sent()
            db.session.commit()
            logger.info('Successfully sent reminder %s to %s', reminder.id, patient.phone)

            # Best-effort e-mail reminder alongside WhatsApp - doesn't affect reminder status.
            # Follow-ups are WhatsApp-only (no e-mail template for those).
            if reminder.reminder_type != ReminderType.FOLLOW_UP:
                try:
                    hours_before = 24 if reminder.reminder_type == ReminderType.REMINDER_24H else 1
                    EmailService().send_appointment_reminder_email(patient, appointment, hours_before)
                except Exception:
                    logger.exception('Failed to send reminder e-mail for reminder %s', reminder.id)

            return True

        except Exception as e:
            logger.exception('Error sending reminder %s: %s', reminder.id, str(e))
            reminder.mark_failed(str(e))
            db.session.commit()
            return False

    def send_pending_reminders(self) -> dict:
        """
        Send all pending reminders that are due.

        Returns:
            Dict with counts of sent, failed, and skipped reminders
        """
        pending = self.get_pending_reminders()
        results = {'sent': 0, 'failed': 0, 'skipped': 0}

        logger.info('Found %d pending reminders to send', len(pending))

        for reminder in pending:
            if self.send_reminder(reminder):
                results['sent'] += 1
            else:
                if reminder.status == ReminderStatus.CANCELLED:
                    results['skipped'] += 1
                else:
                    results['failed'] += 1

        logger.info('Reminder batch complete: %s', results)
        return results

    def _format_reminder_message(
        self,
        reminder: AppointmentReminder,
        appointment: Appointment,
        patient,
        clinic: Clinic
    ) -> str:
        """Format the reminder message with appointment details."""
        scheduled_dt = appointment.scheduled_datetime

        # Get custom template or use default
        if reminder.reminder_type == ReminderType.REMINDER_24H:
            template = clinic.reminder_24h_message or DEFAULT_REMINDER_24H
        elif reminder.reminder_type == ReminderType.REMINDER_1H:
            template = clinic.reminder_1h_message or DEFAULT_REMINDER_1H
        elif reminder.reminder_type == ReminderType.FOLLOW_UP:
            template = DEFAULT_FOLLOW_UP
        else:
            template = DEFAULT_REMINDER_24H

        # Format weekday names in Portuguese
        weekday_names = ['segunda-feira', 'terça-feira', 'quarta-feira',
                        'quinta-feira', 'sexta-feira', 'sábado', 'domingo']
        weekday = weekday_names[scheduled_dt.weekday()]

        return template.format(
            patient_name=patient.name.split()[0],  # First name only
            full_name=patient.name,
            date=f"{weekday}, {scheduled_dt.strftime('%d/%m/%Y')}",
            time=scheduled_dt.strftime('%H:%M'),
            service=appointment.service_name,
            clinic_name=clinic.name,
            clinic_phone=clinic.phone
        )

    def retry_failed_reminders(self, max_attempts: int = 3) -> dict:
        """
        Retry sending failed reminders that haven't exceeded max attempts.

        Args:
            max_attempts: Maximum number of attempts before giving up

        Returns:
            Dict with counts
        """
        failed = AppointmentReminder.query.filter(
            AppointmentReminder.status == ReminderStatus.FAILED,
            AppointmentReminder.attempts < max_attempts
        ).all()

        results = {'retried': 0, 'success': 0, 'failed': 0}

        for reminder in failed:
            # Reset to pending for retry
            reminder.status = ReminderStatus.PENDING
            results['retried'] += 1

            if self.send_reminder(reminder):
                results['success'] += 1
            else:
                results['failed'] += 1

        return results
