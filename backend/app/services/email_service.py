import logging

import requests
from flask import current_app, render_template

logger = logging.getLogger(__name__)

BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email'


class EmailService:
    """Service for sending transactional emails via the Brevo API."""

    def __init__(self):
        self.api_key = current_app.config.get('BREVO_API_KEY')
        self.sender_email = current_app.config.get('BREVO_SENDER_EMAIL')
        self.sender_name = current_app.config.get('BREVO_SENDER_NAME')

    def send(self, to_email: str, to_name: str, subject: str, html_content: str) -> bool:
        """
        Send a transactional email. Never raises - callers should treat email
        as best-effort and not fail the surrounding request if it doesn't go out.

        Returns True if the email was sent (or logged, in dev without a Brevo
        key configured), False if the send genuinely failed.
        """
        if not to_email:
            return False

        if not self.api_key:
            logger.info(
                'BREVO_API_KEY not configured - email not sent (dev mode). to=%s subject=%s',
                to_email, subject
            )
            return True

        payload = {
            'sender': {'email': self.sender_email, 'name': self.sender_name},
            'to': [{'email': to_email, 'name': to_name or to_email}],
            'subject': subject,
            'htmlContent': html_content,
        }

        try:
            response = requests.post(
                BREVO_API_URL,
                json=payload,
                headers={
                    'api-key': self.api_key,
                    'Content-Type': 'application/json',
                    'accept': 'application/json'
                },
                timeout=15
            )
            response.raise_for_status()
            logger.info('Email sent via Brevo: to=%s subject=%s', to_email, subject)
            return True
        except requests.exceptions.RequestException as e:
            logger.error('Failed to send email via Brevo: to=%s subject=%s error=%s', to_email, subject, str(e))
            return False

    def _send_template(self, to_email: str, to_name: str, subject: str, template_name: str, **context) -> bool:
        html_content = render_template(
            f'emails/{template_name}.html',
            subject=subject,
            frontend_url=current_app.config['FRONTEND_URL'],
            **context
        )
        return self.send(to_email, to_name, subject, html_content)

    # --- Specific transactional emails ------------------------------------

    def send_welcome_email(self, clinic) -> bool:
        return self._send_template(
            clinic.email, clinic.name,
            f'Bem-vindo(a) ao SDental, {clinic.name}!',
            'welcome',
            clinic_name=clinic.name,
            login_url=f"{current_app.config['FRONTEND_URL']}/login"
        )

    def send_password_reset_email(self, clinic, reset_url: str) -> bool:
        return self._send_template(
            clinic.email, clinic.name,
            'Redefinicao de senha - SDental',
            'password_reset',
            clinic_name=clinic.name,
            reset_url=reset_url
        )

    def send_appointment_confirmation_email(self, patient, appointment) -> bool:
        if not patient.email:
            return False
        return self._send_template(
            patient.email, patient.name,
            f'Agendamento confirmado - {appointment.clinic.name}',
            'appointment_confirmation',
            patient_name=patient.name,
            clinic_name=appointment.clinic.name,
            service_name=appointment.service_name,
            date=appointment.scheduled_datetime.strftime('%d/%m/%Y'),
            time=appointment.scheduled_datetime.strftime('%H:%M'),
        )

    def send_appointment_reminder_email(self, patient, appointment, hours_before: int) -> bool:
        if not patient.email:
            return False
        return self._send_template(
            patient.email, patient.name,
            f'Lembrete de consulta - {appointment.clinic.name}',
            'appointment_reminder',
            patient_name=patient.name,
            clinic_name=appointment.clinic.name,
            service_name=appointment.service_name,
            date=appointment.scheduled_datetime.strftime('%d/%m/%Y'),
            time=appointment.scheduled_datetime.strftime('%H:%M'),
            hours_before=hours_before,
        )
