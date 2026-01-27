"""
Public booking routes - No authentication required.
"""
from datetime import datetime, timedelta
from flask import Blueprint, jsonify, request

from app import db
from app.models.clinic import Clinic
from app.models.patient import Patient
from app.models.appointment import Appointment, AppointmentStatus
from app.models.availability_slot import AvailabilitySlot

bp = Blueprint('public', __name__, url_prefix='/api/public')


@bp.route('/clinic/<slug>', methods=['GET'])
def get_clinic_info(slug: str):
    """Get public clinic information for booking page."""
    clinic = Clinic.query.filter_by(slug=slug, active=True).first()
    
    if not clinic:
        return jsonify({'error': 'Clínica não encontrada'}), 404
    
    if not clinic.booking_enabled:
        return jsonify({'error': 'Agendamento online não disponível'}), 403
    
    return jsonify({
        'name': clinic.name,
        'phone': clinic.phone,
        'services': clinic.services or [],
        'business_hours': clinic.business_hours or {}
    })


@bp.route('/clinic/<slug>/availability', methods=['GET'])
def get_availability(slug: str):
    """Get available time slots for a specific date."""
    clinic = Clinic.query.filter_by(slug=slug, active=True, booking_enabled=True).first()
    
    if not clinic:
        return jsonify({'error': 'Clínica não encontrada'}), 404
    
    date_str = request.args.get('date')
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
    
    # Get availability slots for this day
    slots = AvailabilitySlot.query.filter_by(
        clinic_id=clinic.id,
        day_of_week=day_of_week,
        active=True
    ).all()
    
    if not slots:
        return jsonify({'available_slots': [], 'message': 'Sem horários neste dia'})
    
    # Get existing appointments for this date
    start_of_day = datetime.combine(target_date, datetime.min.time())
    end_of_day = datetime.combine(target_date, datetime.max.time())
    
    existing_appointments = Appointment.query.filter(
        Appointment.clinic_id == clinic.id,
        Appointment.scheduled_datetime >= start_of_day,
        Appointment.scheduled_datetime <= end_of_day,
        Appointment.status.notin_(['cancelled'])
    ).all()
    
    booked_times = set()
    for apt in existing_appointments:
        booked_times.add(apt.scheduled_datetime.strftime('%H:%M'))
    
    # Generate available time slots
    available_slots = []
    for slot in slots:
        current_time = datetime.combine(target_date, slot.start_time)
        end_time = datetime.combine(target_date, slot.end_time)
        
        while current_time < end_time:
            time_str = current_time.strftime('%H:%M')
            
            # Check if slot is in the future (for today) and not booked
            if target_date == datetime.now().date():
                if current_time <= datetime.now():
                    current_time += timedelta(minutes=slot.slot_duration_minutes)
                    continue
            
            if time_str not in booked_times:
                available_slots.append({
                    'time': time_str,
                    'duration': slot.slot_duration_minutes
                })
            
            current_time += timedelta(minutes=slot.slot_duration_minutes)
    
    # Sort by time
    available_slots.sort(key=lambda x: x['time'])
    
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
    
    # Check if slot is still available
    existing = Appointment.query.filter(
        Appointment.clinic_id == clinic.id,
        Appointment.scheduled_datetime == scheduled_datetime,
        Appointment.status.notin_(['cancelled'])
    ).first()
    
    if existing:
        return jsonify({'error': 'Este horário já está ocupado'}), 409
    
    # Find service duration
    duration = 30
    services = clinic.services or []
    for service in services:
        if service.get('name') == data['service']:
            duration = service.get('duration', 30)
            break
    
    # Create appointment
    appointment = Appointment(
        clinic_id=clinic.id,
        patient_id=patient.id,
        service_name=data['service'],
        scheduled_datetime=scheduled_datetime,
        duration_minutes=duration,
        status=AppointmentStatus.CONFIRMED,
        notes=data.get('notes')
    )
    db.session.add(appointment)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'message': 'Agendamento confirmado!',
        'appointment': {
            'id': str(appointment.id),
            'service': appointment.service_name,
            'date': scheduled_datetime.strftime('%d/%m/%Y'),
            'time': scheduled_datetime.strftime('%H:%M'),
            'patient_name': patient.name
        }
    }), 201


@bp.route('/clinic/<slug>/calendar', methods=['GET'])
def get_calendar(slug: str):
    """Get calendar data for the next 30 days."""
    clinic = Clinic.query.filter_by(slug=slug, active=True, booking_enabled=True).first()
    
    if not clinic:
        return jsonify({'error': 'Clínica não encontrada'}), 404
    
    # Get all active availability slots
    slots = AvailabilitySlot.query.filter_by(
        clinic_id=clinic.id,
        active=True
    ).all()
    
    # Days with availability
    available_days = set(slot.day_of_week for slot in slots)
    
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
