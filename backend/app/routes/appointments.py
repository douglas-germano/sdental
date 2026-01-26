from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify

from app import db
from app.models import Appointment, Patient, AppointmentStatus
from app.utils.auth import clinic_required
from app.services.appointment_service import AppointmentService

bp = Blueprint('appointments', __name__, url_prefix='/api/appointments')


@bp.route('', methods=['GET'])
@clinic_required
def list_appointments(current_clinic):
    """List appointments with filters."""
    # Get query parameters
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    status = request.args.get('status')
    date_from = request.args.get('date_from')
    date_to = request.args.get('date_to')
    service = request.args.get('service')

    # Build query
    query = Appointment.query.filter_by(clinic_id=current_clinic.id)

    # Apply filters
    if status:
        query = query.filter_by(status=status)

    if date_from:
        try:
            date_from = datetime.fromisoformat(date_from)
            query = query.filter(Appointment.scheduled_datetime >= date_from)
        except ValueError:
            pass

    if date_to:
        try:
            date_to = datetime.fromisoformat(date_to)
            query = query.filter(Appointment.scheduled_datetime <= date_to)
        except ValueError:
            pass

    if service:
        query = query.filter(Appointment.service_name.ilike(f'%{service}%'))

    # Order by scheduled datetime
    query = query.order_by(Appointment.scheduled_datetime.desc())

    # Paginate
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        'appointments': [a.to_dict() for a in pagination.items],
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': page
    })


@bp.route('/upcoming', methods=['GET'])
@clinic_required
def upcoming_appointments(current_clinic):
    """Get upcoming appointments for today and tomorrow."""
    now = datetime.utcnow()
    tomorrow_end = now.replace(hour=23, minute=59, second=59) + timedelta(days=1)

    appointments = Appointment.query.filter(
        Appointment.clinic_id == current_clinic.id,
        Appointment.scheduled_datetime >= now,
        Appointment.scheduled_datetime <= tomorrow_end,
        Appointment.status.in_([AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED])
    ).order_by(Appointment.scheduled_datetime).all()

    return jsonify({
        'appointments': [a.to_dict() for a in appointments]
    })


@bp.route('/availability', methods=['GET'])
@clinic_required
def get_availability(current_clinic):
    """Get available slots for a specific date."""
    date_str = request.args.get('date')
    service_name = request.args.get('service')

    if not date_str:
        return jsonify({'error': 'Date is required'}), 400

    try:
        date = datetime.fromisoformat(date_str).date()
    except ValueError:
        return jsonify({'error': 'Invalid date format'}), 400

    service = AppointmentService(current_clinic)
    slots = service.get_available_slots(date, service_name)

    return jsonify({
        'date': date.isoformat(),
        'slots': slots
    })


@bp.route('/<appointment_id>', methods=['GET'])
@clinic_required
def get_appointment(appointment_id, current_clinic):
    """Get appointment details."""
    appointment = Appointment.query.filter_by(
        id=appointment_id,
        clinic_id=current_clinic.id
    ).first()

    if not appointment:
        return jsonify({'error': 'Appointment not found'}), 404

    return jsonify(appointment.to_dict())


@bp.route('', methods=['POST'])
@clinic_required
def create_appointment(current_clinic):
    """Create a new appointment manually."""
    data = request.get_json()

    required_fields = ['patient_id', 'service_name', 'scheduled_datetime']
    for field in required_fields:
        if not data.get(field):
            return jsonify({'error': f'{field} is required'}), 400

    # Verify patient belongs to clinic
    patient = Patient.query.filter_by(
        id=data['patient_id'],
        clinic_id=current_clinic.id
    ).first()

    if not patient:
        return jsonify({'error': 'Patient not found'}), 404

    try:
        scheduled_datetime = datetime.fromisoformat(data['scheduled_datetime'])
    except ValueError:
        return jsonify({'error': 'Invalid datetime format'}), 400

    # Check if slot is available
    service = AppointmentService(current_clinic)
    if not service.is_slot_available(scheduled_datetime, data.get('duration_minutes', 30)):
        return jsonify({'error': 'Time slot is not available'}), 409

    appointment = Appointment(
        clinic_id=current_clinic.id,
        patient_id=patient.id,
        service_name=data['service_name'],
        scheduled_datetime=scheduled_datetime,
        duration_minutes=data.get('duration_minutes', 30),
        status=data.get('status', AppointmentStatus.CONFIRMED),
        notes=data.get('notes')
    )

    db.session.add(appointment)
    db.session.commit()

    return jsonify({
        'message': 'Appointment created successfully',
        'appointment': appointment.to_dict()
    }), 201


@bp.route('/<appointment_id>', methods=['PUT'])
@clinic_required
def update_appointment(appointment_id, current_clinic):
    """Update appointment status or details."""
    appointment = Appointment.query.filter_by(
        id=appointment_id,
        clinic_id=current_clinic.id
    ).first()

    if not appointment:
        return jsonify({'error': 'Appointment not found'}), 404

    data = request.get_json()

    if 'status' in data:
        valid_statuses = [
            AppointmentStatus.PENDING,
            AppointmentStatus.CONFIRMED,
            AppointmentStatus.CANCELLED,
            AppointmentStatus.COMPLETED,
            AppointmentStatus.NO_SHOW
        ]
        if data['status'] not in valid_statuses:
            return jsonify({'error': 'Invalid status'}), 400

        if data['status'] == AppointmentStatus.CANCELLED:
            appointment.cancel()
        else:
            appointment.status = data['status']

    if 'notes' in data:
        appointment.notes = data['notes']

    if 'scheduled_datetime' in data:
        try:
            new_datetime = datetime.fromisoformat(data['scheduled_datetime'])
            # Check availability for new time
            service = AppointmentService(current_clinic)
            if not service.is_slot_available(
                new_datetime,
                appointment.duration_minutes,
                exclude_appointment_id=appointment.id
            ):
                return jsonify({'error': 'New time slot is not available'}), 409
            appointment.scheduled_datetime = new_datetime
        except ValueError:
            return jsonify({'error': 'Invalid datetime format'}), 400

    db.session.commit()

    return jsonify({
        'message': 'Appointment updated successfully',
        'appointment': appointment.to_dict()
    })


@bp.route('/<appointment_id>', methods=['DELETE'])
@clinic_required
def delete_appointment(appointment_id, current_clinic):
    """Cancel an appointment."""
    appointment = Appointment.query.filter_by(
        id=appointment_id,
        clinic_id=current_clinic.id
    ).first()

    if not appointment:
        return jsonify({'error': 'Appointment not found'}), 404

    appointment.cancel()
    db.session.commit()

    return jsonify({'message': 'Appointment cancelled successfully'})
