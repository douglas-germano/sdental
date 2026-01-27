"""
Public booking routes - No authentication required.
"""
from datetime import datetime, timedelta, time
from flask import Blueprint, jsonify, request

from app import db
from app.models.clinic import Clinic
from app.models.patient import Patient
from app.models.appointment import Appointment, AppointmentStatus
from app.models.professional import Professional

bp = Blueprint('public', __name__, url_prefix='/api/public')


def _get_business_hours_for_day(clinic, day_of_week: int) -> dict:
    """Get business hours configuration for a specific day of week."""
    business_hours = clinic.business_hours or {}
    return business_hours.get(str(day_of_week), {})


def _is_slot_conflicting(slot_start: datetime, slot_duration: int, existing_appointments: list) -> bool:
    """Check if a time slot conflicts with any existing appointment."""
    slot_end = slot_start + timedelta(minutes=slot_duration)

    for apt in existing_appointments:
        apt_start = apt.scheduled_datetime
        apt_end = apt_start + timedelta(minutes=apt.duration_minutes)

        # Conflict exists if slots overlap
        # No conflict only if: slot ends before apt starts OR slot starts after apt ends
        if not (slot_end <= apt_start or slot_start >= apt_end):
            return True

    return False


@bp.route('/clinic/<slug>', methods=['GET'])
def get_clinic_info(slug: str):
    """Get public clinic information for booking page."""
    clinic = Clinic.query.filter_by(slug=slug, active=True).first()
    
    if not clinic:
        return jsonify({'error': 'Clínica não encontrada'}), 404
    
    if not clinic.booking_enabled:
        return jsonify({'error': 'Agendamento online não disponível'}), 403
    
    # Get professionals for this clinic
    professionals = Professional.query.filter_by(
        clinic_id=clinic.id,
        active=True
    ).order_by(Professional.name).all()

    return jsonify({
        'name': clinic.name,
        'phone': clinic.phone,
        'services': clinic.services or [],
        'business_hours': clinic.business_hours or {},
        'professionals': [
            {
                'id': str(p.id),
                'name': p.name,
                'specialty': p.specialty,
                'color': p.color
            }
            for p in professionals
        ],
        'has_professionals': len(professionals) > 0
    })


@bp.route('/clinic/<slug>/professionals', methods=['GET'])
def get_professionals(slug: str):
    """Get available professionals for booking."""
    clinic = Clinic.query.filter_by(slug=slug, active=True, booking_enabled=True).first()

    if not clinic:
        return jsonify({'error': 'Clínica não encontrada'}), 404

    professionals = Professional.query.filter_by(
        clinic_id=clinic.id,
        active=True
    ).order_by(Professional.name).all()

    return jsonify({
        'professionals': [
            {
                'id': str(p.id),
                'name': p.name,
                'specialty': p.specialty,
                'color': p.color
            }
            for p in professionals
        ],
        'allow_any': True  # Allow "any available" option
    })


@bp.route('/clinic/<slug>/availability', methods=['GET'])
def get_availability(slug: str):
    """Get available time slots for a specific date."""
    clinic = Clinic.query.filter_by(slug=slug, active=True, booking_enabled=True).first()

    if not clinic:
        return jsonify({'error': 'Clínica não encontrada'}), 404

    date_str = request.args.get('date')
    service_name = request.args.get('service')

    if not date_str:
        return jsonify({'error': 'Data é obrigatória'}), 400

    try:
        target_date = datetime.strptime(date_str, '%Y-%m-%d').date()
    except ValueError:
        return jsonify({'error': 'Formato de data inválido. Use YYYY-MM-DD'}), 400

    # Don't allow booking in the past
    if target_date < datetime.now().date():
        return jsonify({'error': 'Não é possível agendar em datas passadas'}), 400

    # Get day of week (0 = Monday, 6 = Sunday)
    day_of_week = target_date.weekday()

    # Get business hours for this day (unified source of truth)
    day_config = _get_business_hours_for_day(clinic, day_of_week)

    if not day_config.get('active', False):
        return jsonify({'available_slots': [], 'message': 'Clínica fechada neste dia'})

    # Parse business hours
    try:
        start_hour, start_min = map(int, day_config['start'].split(':'))
        end_hour, end_min = map(int, day_config['end'].split(':'))
        business_start = time(start_hour, start_min)
        business_end = time(end_hour, end_min)
    except (KeyError, ValueError):
        return jsonify({'available_slots': [], 'message': 'Horário não configurado'})

    # Get service duration (default 30 min)
    slot_duration = 30
    if service_name:
        for service in (clinic.services or []):
            if service.get('name') == service_name:
                slot_duration = service.get('duration', 30)
                break

    # Get existing appointments for this date
    start_of_day = datetime.combine(target_date, datetime.min.time())
    end_of_day = datetime.combine(target_date, datetime.max.time())

    existing_appointments = Appointment.query.filter(
        Appointment.clinic_id == clinic.id,
        Appointment.scheduled_datetime >= start_of_day,
        Appointment.scheduled_datetime <= end_of_day,
        Appointment.status.notin_([AppointmentStatus.CANCELLED])
    ).all()

    # Generate available time slots
    available_slots = []
    current_time = datetime.combine(target_date, business_start)
    end_time = datetime.combine(target_date, business_end)
    now = datetime.now()

    while current_time + timedelta(minutes=slot_duration) <= end_time:
        # Skip past slots for today
        if target_date == now.date() and current_time <= now:
            current_time += timedelta(minutes=slot_duration)
            continue

        # Check if slot conflicts with any existing appointment (considering duration)
        if not _is_slot_conflicting(current_time, slot_duration, existing_appointments):
            available_slots.append({
                'time': current_time.strftime('%H:%M'),
                'duration': slot_duration
            })

        current_time += timedelta(minutes=slot_duration)

    return jsonify({'available_slots': available_slots})


@bp.route('/clinic/<slug>/book', methods=['POST'])
def create_booking(slug: str):
    """Create a new appointment."""
    clinic = Clinic.query.filter_by(slug=slug, active=True, booking_enabled=True).first()
    
    if not clinic:
        return jsonify({'error': 'Clínica não encontrada'}), 404
    
    data = request.get_json()
    
    # Validate required fields
    required = ['name', 'phone', 'date', 'time', 'service']
    for field in required:
        if not data.get(field):
            return jsonify({'error': f'{field} é obrigatório'}), 400
    
    # Parse datetime
    try:
        scheduled_datetime = datetime.strptime(
            f"{data['date']} {data['time']}", 
            '%Y-%m-%d %H:%M'
        )
    except ValueError:
        return jsonify({'error': 'Formato de data/hora inválido'}), 400
    
    # Don't allow booking in the past
    if scheduled_datetime <= datetime.now():
        return jsonify({'error': 'Não é possível agendar em horários passados'}), 400
    
    # Normalize phone
    phone = data['phone'].replace(' ', '').replace('-', '').replace('(', '').replace(')', '')
    if not phone.startswith('55'):
        phone = '55' + phone
    
    # Find or create patient
    patient = Patient.query.filter_by(
        clinic_id=clinic.id,
        phone=phone
    ).first()
    
    if not patient:
        patient = Patient(
            clinic_id=clinic.id,
            name=data['name'],
            phone=phone,
            email=data.get('email'),
            notes=data.get('notes')
        )
        db.session.add(patient)
        db.session.flush()
    else:
        # Update patient name if provided
        patient.name = data['name']
        if data.get('email'):
            patient.email = data['email']
    
    # Find service duration
    duration = 30
    services = clinic.services or []
    for service in services:
        if service.get('name') == data['service']:
            duration = service.get('duration', 30)
            break

    # Get professional_id if provided
    professional_id = data.get('professional_id')

    # Use AppointmentService to create the appointment (handles professional assignment)
    from app.services.appointment_service import AppointmentService
    appointment_service = AppointmentService(clinic)

    appointment, error = appointment_service.create_appointment(
        patient_name=data['name'],
        patient_phone=phone,
        scheduled_datetime=scheduled_datetime,
        service_name=data['service'],
        duration_minutes=duration,
        notes=data.get('notes'),
        professional_id=professional_id
    )

    if error:
        return jsonify({'error': error}), 409

    response_data = {
        'success': True,
        'message': 'Agendamento confirmado!',
        'appointment': {
            'id': str(appointment.id),
            'service': appointment.service_name,
            'date': scheduled_datetime.strftime('%d/%m/%Y'),
            'time': scheduled_datetime.strftime('%H:%M'),
            'patient_name': patient.name
        }
    }

    # Add professional info if assigned
    if appointment.professional:
        response_data['appointment']['professional'] = {
            'id': str(appointment.professional.id),
            'name': appointment.professional.name
        }

    return jsonify(response_data), 201


@bp.route('/clinic/<slug>/calendar', methods=['GET'])
def get_calendar(slug: str):
    """Get calendar data for the next 30 days."""
    clinic = Clinic.query.filter_by(slug=slug, active=True, booking_enabled=True).first()

    if not clinic:
        return jsonify({'error': 'Clínica não encontrada'}), 404

    # Get business hours to determine available days (unified source of truth)
    business_hours = clinic.business_hours or {}

    # Days with availability based on business_hours
    available_days = set()
    for day_str, config in business_hours.items():
        if config.get('active', False):
            available_days.add(int(day_str))

    # Generate calendar for next 30 days
    calendar = []
    today = datetime.now().date()

    for i in range(30):
        date = today + timedelta(days=i)
        day_of_week = date.weekday()

        calendar.append({
            'date': date.strftime('%Y-%m-%d'),
            'day': date.day,
            'weekday': ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'][day_of_week],
            'available': day_of_week in available_days
        })

    return jsonify({'calendar': calendar})
