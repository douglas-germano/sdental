import logging
from datetime import datetime, timedelta, time
from typing import List, Optional
from uuid import UUID

from app import db
from app.models import Appointment, Patient, AvailabilitySlot, AppointmentStatus, Professional
from app.utils.validators import normalize_phone

logger = logging.getLogger(__name__)


class AppointmentService:
    """Service for appointment-related operations."""

    def __init__(self, clinic):
        self.clinic = clinic

    def get_available_slots(
        self,
        date: datetime.date,
        service_name: Optional[str] = None,
        professional_id: Optional[UUID] = None
    ) -> List[dict]:
        """
        Get available time slots for a specific date.

        Args:
            date: The date to check availability
            service_name: Optional service to get specific duration
            professional_id: Optional professional to check availability for.
                            If None and clinic has professionals, returns slots where ANY is available.

        Returns:
            List of available slot dicts with start_time and end_time
        """
        # If no professional specified and clinic has professionals, aggregate all
        if professional_id is None:
            professionals = Professional.query.filter_by(
                clinic_id=self.clinic.id,
                active=True
            ).all()

            if professionals:
                # Get slots for each professional and return union
                all_slots = {}
                for prof in professionals:
                    prof_slots = self._get_slots_for_professional(date, service_name, prof)
                    for slot in prof_slots:
                        key = slot['start_time']
                        if key not in all_slots:
                            all_slots[key] = slot
                            all_slots[key]['available_professionals'] = []
                        all_slots[key]['available_professionals'].append({
                            'id': str(prof.id),
                            'name': prof.name
                        })

                return sorted(all_slots.values(), key=lambda x: x['start_time'])

        # Get specific professional or use clinic-wide availability
        professional = None
        if professional_id:
            professional = Professional.query.filter_by(
                id=professional_id,
                clinic_id=self.clinic.id,
                active=True
            ).first()

        return self._get_slots_for_professional(date, service_name, professional)

    def _get_slots_for_professional(
        self,
        date: datetime.date,
        service_name: Optional[str],
        professional: Optional[Professional]
    ) -> List[dict]:
        """Get available slots for a specific professional or clinic-wide."""
        # Get day of week (0 = Monday)
        day_of_week = date.weekday()

        # Use professional's business hours if set, otherwise clinic's
        if professional and professional.business_hours:
            business_hours = professional.business_hours
        else:
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

        query = Appointment.query.filter(
            Appointment.clinic_id == self.clinic.id,
            Appointment.scheduled_datetime >= date_start,
            Appointment.scheduled_datetime <= date_end,
            Appointment.status.notin_([AppointmentStatus.CANCELLED])
        )

        # Filter by professional if specified
        if professional:
            query = query.filter(Appointment.professional_id == professional.id)

        existing_appointments = query.all()

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
                    slot_data = {
                        'start_time': current_time.strftime('%H:%M'),
                        'end_time': slot_end.strftime('%H:%M'),
                        'datetime': current_time.isoformat()
                    }
                    if professional:
                        slot_data['professional_id'] = str(professional.id)
                        slot_data['professional_name'] = professional.name
                    slots.append(slot_data)

            current_time += timedelta(minutes=duration_minutes)

        return slots

    def is_slot_available(
        self,
        scheduled_datetime: datetime,
        duration_minutes: int = 30,
        exclude_appointment_id: Optional[UUID] = None,
        professional_id: Optional[UUID] = None
    ) -> bool:
        """
        Check if a specific time slot is available.

        Args:
            scheduled_datetime: The datetime to check
            duration_minutes: Duration of the appointment
            exclude_appointment_id: Optional appointment ID to exclude (for updates)
            professional_id: Optional professional ID to check availability for

        Returns:
            True if available, False otherwise
        """
        # Get business hours (professional-specific or clinic-wide)
        business_hours = self.clinic.business_hours or {}
        if professional_id:
            professional = Professional.query.get(professional_id)
            if professional and professional.business_hours:
                business_hours = professional.business_hours

        day_of_week = scheduled_datetime.weekday()
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

        # Filter by professional if specified
        if professional_id:
            query = query.filter(Appointment.professional_id == professional_id)

        if exclude_appointment_id:
            query = query.filter(Appointment.id != exclude_appointment_id)

        return query.count() == 0

    def find_available_professional(
        self,
        scheduled_datetime: datetime,
        duration_minutes: int = 30
    ) -> Optional[Professional]:
        """
        Find any available professional for a given time slot.

        Args:
            scheduled_datetime: The datetime to check
            duration_minutes: Duration of the appointment

        Returns:
            An available Professional or None
        """
        professionals = Professional.query.filter_by(
            clinic_id=self.clinic.id,
            active=True
        ).all()

        for prof in professionals:
            if self.is_slot_available(scheduled_datetime, duration_minutes, professional_id=prof.id):
                return prof

        return None

    def create_appointment(
        self,
        patient_name: str,
        patient_phone: str,
        scheduled_datetime: datetime,
        service_name: str,
        duration_minutes: int = 30,
        notes: Optional[str] = None,
        professional_id: Optional[UUID] = None
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
            professional_id: Optional professional to assign. If None and clinic has professionals,
                            will try to find any available professional.

        Returns:
            Tuple of (Appointment, error_message)
        """
        phone = normalize_phone(patient_phone)

        # If no professional specified, try to find one
        assigned_professional_id = professional_id
        if assigned_professional_id is None:
            # Check if clinic has professionals configured
            has_professionals = Professional.query.filter_by(
                clinic_id=self.clinic.id,
                active=True
            ).count() > 0

            if has_professionals:
                # Find an available professional
                available_prof = self.find_available_professional(scheduled_datetime, duration_minutes)
                if available_prof:
                    assigned_professional_id = available_prof.id
                else:
                    return None, 'Nenhum profissional disponível neste horário'

        # Check availability (considering professional if specified)
        if not self.is_slot_available(scheduled_datetime, duration_minutes, professional_id=assigned_professional_id):
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
            professional_id=assigned_professional_id,
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

        # Schedule reminders if enabled
        try:
            from app.services.reminder_service import ReminderService
            reminder_service = ReminderService(self.clinic)
            reminder_service.schedule_reminders_for_appointment(appointment)
        except Exception as e:
            logger.error('Failed to schedule reminders: %s', str(e))
            # Don't fail the appointment creation if reminders fail

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

        # Cancel any pending reminders
        try:
            from app.services.reminder_service import ReminderService
            reminder_service = ReminderService(self.clinic)
            reminder_service.cancel_reminders_for_appointment(appointment_id)
        except Exception as e:
            logger.error('Failed to cancel reminders: %s', str(e))

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
