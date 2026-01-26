import logging
from datetime import datetime, timedelta, time
from typing import List, Optional
from uuid import UUID

from app import db
from app.models import Appointment, Patient, AvailabilitySlot, AppointmentStatus
from app.utils.validators import normalize_phone

logger = logging.getLogger(__name__)


class AppointmentService:
    """Service for appointment-related operations."""

    def __init__(self, clinic):
        self.clinic = clinic

    def get_available_slots(
        self,
        date: datetime.date,
        service_name: Optional[str] = None
    ) -> List[dict]:
        """
        Get available time slots for a specific date.

        Args:
            date: The date to check availability
            service_name: Optional service to get specific duration

        Returns:
            List of available slot dicts with start_time and end_time
        """
        # Get day of week (0 = Monday)
        day_of_week = date.weekday()

        # Check business hours
        business_hours = self.clinic.business_hours or {}
        day_config = business_hours.get(str(day_of_week), {})

        if not day_config.get('active', False):
            return []

        # Parse business hours
        try:
            start_hour, start_min = map(int, day_config['start'].split(':'))
            end_hour, end_min = map(int, day_config['end'].split(':'))
        except (KeyError, ValueError):
            return []

        business_start = time(start_hour, start_min)
        business_end = time(end_hour, end_min)

        # Get service duration
        duration_minutes = 30  # default
        if service_name:
            for service in (self.clinic.services or []):
                if service.get('name') == service_name:
                    duration_minutes = service.get('duration', 30)
                    break

        # Get existing appointments for the date
        date_start = datetime.combine(date, time.min)
        date_end = datetime.combine(date, time.max)

        existing_appointments = Appointment.query.filter(
            Appointment.clinic_id == self.clinic.id,
            Appointment.scheduled_datetime >= date_start,
            Appointment.scheduled_datetime <= date_end,
            Appointment.status.notin_([AppointmentStatus.CANCELLED])
        ).all()

        # Generate all possible slots
        slots = []
        current_time = datetime.combine(date, business_start)
        end_time = datetime.combine(date, business_end)

        while current_time + timedelta(minutes=duration_minutes) <= end_time:
            slot_end = current_time + timedelta(minutes=duration_minutes)

            # Check if slot conflicts with existing appointments
            is_available = True
            for apt in existing_appointments:
                apt_end = apt.scheduled_datetime + timedelta(minutes=apt.duration_minutes)
                # Check for overlap
                if not (slot_end <= apt.scheduled_datetime or current_time >= apt_end):
                    is_available = False
                    break

            if is_available:
                # Don't show past slots for today
                if date == datetime.now().date() and current_time <= datetime.now():
                    pass
                else:
                    slots.append({
                        'start_time': current_time.strftime('%H:%M'),
                        'end_time': slot_end.strftime('%H:%M'),
                        'datetime': current_time.isoformat()
                    })

            current_time += timedelta(minutes=duration_minutes)

        return slots

    def is_slot_available(
        self,
        scheduled_datetime: datetime,
        duration_minutes: int = 30,
        exclude_appointment_id: Optional[UUID] = None
    ) -> bool:
        """
        Check if a specific time slot is available.

        Args:
            scheduled_datetime: The datetime to check
            duration_minutes: Duration of the appointment
            exclude_appointment_id: Optional appointment ID to exclude (for updates)

        Returns:
            True if available, False otherwise
        """
        # Check if within business hours
        day_of_week = scheduled_datetime.weekday()
        business_hours = self.clinic.business_hours or {}
        day_config = business_hours.get(str(day_of_week), {})

        if not day_config.get('active', False):
            return False

        try:
            start_hour, start_min = map(int, day_config['start'].split(':'))
            end_hour, end_min = map(int, day_config['end'].split(':'))
            business_start = time(start_hour, start_min)
            business_end = time(end_hour, end_min)

            slot_time = scheduled_datetime.time()
            slot_end_time = (scheduled_datetime + timedelta(minutes=duration_minutes)).time()

            if slot_time < business_start or slot_end_time > business_end:
                return False
        except (KeyError, ValueError):
            return False

        # Check for conflicts
        slot_end = scheduled_datetime + timedelta(minutes=duration_minutes)

        query = Appointment.query.filter(
            Appointment.clinic_id == self.clinic.id,
            Appointment.status.notin_([AppointmentStatus.CANCELLED]),
            Appointment.scheduled_datetime < slot_end,
            Appointment.scheduled_datetime + db.cast(
                db.text("duration_minutes || ' minutes'"),
                db.Interval
            ) > scheduled_datetime
        )

        if exclude_appointment_id:
            query = query.filter(Appointment.id != exclude_appointment_id)

        return query.count() == 0

    def create_appointment(
        self,
        patient_name: str,
        patient_phone: str,
        scheduled_datetime: datetime,
        service_name: str,
        duration_minutes: int = 30,
        notes: Optional[str] = None
    ) -> tuple[Optional[Appointment], Optional[str]]:
        """
        Create an appointment, creating patient if needed.

        Args:
            patient_name: Patient's full name
            patient_phone: Patient's phone number
            scheduled_datetime: When the appointment is scheduled
            service_name: Name of the service/procedure
            duration_minutes: Appointment duration
            notes: Optional notes

        Returns:
            Tuple of (Appointment, error_message)
        """
        phone = normalize_phone(patient_phone)

        # Check availability
        if not self.is_slot_available(scheduled_datetime, duration_minutes):
            return None, 'Horário não disponível'

        # Find or create patient
        patient = Patient.query.filter_by(
            clinic_id=self.clinic.id,
            phone=phone
        ).first()

        if not patient:
            patient = Patient(
                clinic_id=self.clinic.id,
                name=patient_name,
                phone=phone
            )
            db.session.add(patient)
            db.session.flush()

        # Create appointment
        appointment = Appointment(
            clinic_id=self.clinic.id,
            patient_id=patient.id,
            service_name=service_name,
            scheduled_datetime=scheduled_datetime,
            duration_minutes=duration_minutes,
            status=AppointmentStatus.CONFIRMED,
            notes=notes
        )

        db.session.add(appointment)
        db.session.commit()

        logger.info(
            'Appointment created: %s for %s at %s',
            appointment.id, patient_name, scheduled_datetime
        )

        return appointment, None

    def cancel_appointment(self, appointment_id: UUID) -> tuple[bool, Optional[str]]:
        """
        Cancel an appointment.

        Args:
            appointment_id: The appointment ID to cancel

        Returns:
            Tuple of (success, error_message)
        """
        appointment = Appointment.query.filter_by(
            id=appointment_id,
            clinic_id=self.clinic.id
        ).first()

        if not appointment:
            return False, 'Agendamento não encontrado'

        if appointment.status == AppointmentStatus.CANCELLED:
            return False, 'Agendamento já está cancelado'

        appointment.cancel()
        db.session.commit()

        logger.info('Appointment cancelled: %s', appointment_id)

        return True, None

    def get_patient_appointments(
        self,
        patient_phone: str,
        include_past: bool = False
    ) -> List[Appointment]:
        """
        Get appointments for a patient by phone number.

        Args:
            patient_phone: Patient's phone number
            include_past: Whether to include past appointments

        Returns:
            List of appointments
        """
        phone = normalize_phone(patient_phone)

        patient = Patient.query.filter_by(
            clinic_id=self.clinic.id,
            phone=phone
        ).first()

        if not patient:
            return []

        query = Appointment.query.filter_by(
            clinic_id=self.clinic.id,
            patient_id=patient.id
        ).filter(
            Appointment.status.notin_([AppointmentStatus.CANCELLED])
        )

        if not include_past:
            query = query.filter(
                Appointment.scheduled_datetime >= datetime.now()
            )

        return query.order_by(Appointment.scheduled_datetime).all()
