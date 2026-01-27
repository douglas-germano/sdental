"""
Professional management routes.
"""
from flask import Blueprint, request, jsonify

from app import db
from app.models import Professional
from app.utils.auth import clinic_required

bp = Blueprint('professionals', __name__, url_prefix='/api/professionals')


@bp.route('', methods=['GET'])
@clinic_required
def list_professionals(current_clinic):
    """List all professionals for the clinic."""
    active_only = request.args.get('active', 'true').lower() == 'true'

    query = Professional.query.filter_by(clinic_id=current_clinic.id)

    if active_only:
        query = query.filter_by(active=True)

    professionals = query.order_by(Professional.name).all()

    return jsonify({
        'professionals': [p.to_dict() for p in professionals]
    })


@bp.route('', methods=['POST'])
@clinic_required
def create_professional(current_clinic):
    """Create a new professional."""
    data = request.get_json()

    if not data.get('name'):
        return jsonify({'error': 'Nome é obrigatório'}), 400

    # Check if this is the first professional (make it default)
    existing_count = Professional.query.filter_by(clinic_id=current_clinic.id).count()

    professional = Professional(
        clinic_id=current_clinic.id,
        name=data['name'],
        email=data.get('email'),
        phone=data.get('phone'),
        specialty=data.get('specialty'),
        color=data.get('color', '#3B82F6'),
        business_hours=data.get('business_hours'),
        is_default=(existing_count == 0)  # First professional is default
    )

    db.session.add(professional)
    db.session.commit()

    return jsonify({
        'message': 'Profissional criado com sucesso',
        'professional': professional.to_dict()
    }), 201


@bp.route('/<professional_id>', methods=['GET'])
@clinic_required
def get_professional(professional_id, current_clinic):
    """Get a specific professional."""
    professional = Professional.query.filter_by(
        id=professional_id,
        clinic_id=current_clinic.id
    ).first()

    if not professional:
        return jsonify({'error': 'Profissional não encontrado'}), 404

    return jsonify(professional.to_dict())


@bp.route('/<professional_id>', methods=['PUT'])
@clinic_required
def update_professional(professional_id, current_clinic):
    """Update a professional."""
    professional = Professional.query.filter_by(
        id=professional_id,
        clinic_id=current_clinic.id
    ).first()

    if not professional:
        return jsonify({'error': 'Profissional não encontrado'}), 404

    data = request.get_json()

    # Update allowed fields
    allowed_fields = ['name', 'email', 'phone', 'specialty', 'color', 'active', 'business_hours']
    for field in allowed_fields:
        if field in data:
            setattr(professional, field, data[field])

    # Handle is_default separately (ensure only one default)
    if data.get('is_default') and not professional.is_default:
        # Remove default from other professionals
        Professional.query.filter(
            Professional.clinic_id == current_clinic.id,
            Professional.id != professional.id
        ).update({'is_default': False})
        professional.is_default = True

    db.session.commit()

    return jsonify({
        'message': 'Profissional atualizado com sucesso',
        'professional': professional.to_dict()
    })


@bp.route('/<professional_id>', methods=['DELETE'])
@clinic_required
def delete_professional(professional_id, current_clinic):
    """Deactivate a professional (soft delete)."""
    professional = Professional.query.filter_by(
        id=professional_id,
        clinic_id=current_clinic.id
    ).first()

    if not professional:
        return jsonify({'error': 'Profissional não encontrado'}), 404

    # Don't allow deactivating if it's the only active professional
    active_count = Professional.query.filter_by(
        clinic_id=current_clinic.id,
        active=True
    ).count()

    if active_count == 1 and professional.active:
        return jsonify({
            'error': 'Não é possível desativar o único profissional ativo'
        }), 400

    professional.active = False

    # If this was the default, assign default to another professional
    if professional.is_default:
        professional.is_default = False
        other = Professional.query.filter(
            Professional.clinic_id == current_clinic.id,
            Professional.id != professional.id,
            Professional.active == True
        ).first()
        if other:
            other.is_default = True

    db.session.commit()

    return jsonify({'message': 'Profissional desativado com sucesso'})


@bp.route('/<professional_id>/appointments', methods=['GET'])
@clinic_required
def get_professional_appointments(professional_id, current_clinic):
    """Get appointments for a specific professional."""
    from datetime import datetime
    from app.models import Appointment, AppointmentStatus

    professional = Professional.query.filter_by(
        id=professional_id,
        clinic_id=current_clinic.id
    ).first()

    if not professional:
        return jsonify({'error': 'Profissional não encontrado'}), 404

    # Get query parameters
    date_from = request.args.get('date_from')
    date_to = request.args.get('date_to')
    include_past = request.args.get('include_past', 'false').lower() == 'true'

    query = Appointment.query.filter(
        Appointment.clinic_id == current_clinic.id,
        Appointment.professional_id == professional_id,
        Appointment.status.notin_([AppointmentStatus.CANCELLED])
    )

    if not include_past:
        query = query.filter(Appointment.scheduled_datetime >= datetime.now())

    if date_from:
        query = query.filter(Appointment.scheduled_datetime >= datetime.fromisoformat(date_from))

    if date_to:
        query = query.filter(Appointment.scheduled_datetime <= datetime.fromisoformat(date_to))

    appointments = query.order_by(Appointment.scheduled_datetime).all()

    return jsonify({
        'professional': professional.to_dict(),
        'appointments': [a.to_dict() for a in appointments]
    })
