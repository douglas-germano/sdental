from flask import Blueprint, request, jsonify

from app import db
from app.utils.auth import clinic_required

bp = Blueprint('clinics', __name__, url_prefix='/api/clinics')


@bp.route('/profile', methods=['GET'])
@clinic_required
def get_profile(current_clinic):
    """Get clinic profile."""
    return jsonify(current_clinic.to_dict(include_sensitive=True))


@bp.route('/profile', methods=['PUT'])
@clinic_required
def update_profile(current_clinic):
    """Update clinic profile."""
    data = request.get_json()

    # Fields that can be updated
    allowed_fields = ['name', 'phone', 'slug', 'agent_enabled']
    for field in allowed_fields:
        if field in data:
            setattr(current_clinic, field, data[field])

    db.session.commit()

    return jsonify({
        'message': 'Profile updated successfully',
        'clinic': current_clinic.to_dict(include_sensitive=True)
    })


@bp.route('/evolution/instance', methods=['POST'])
@clinic_required
def create_evolution_instance(current_clinic):
    """Create a new Evolution API instance for the clinic."""
    from app.services.evolution_service import EvolutionService
    
    service = EvolutionService(current_clinic)
    result = service.create_instance()
    
    if 'error' in result:
        return jsonify(result), 500
        
    return jsonify(result)


@bp.route('/evolution/status', methods=['GET'])
@clinic_required
def get_evolution_status(current_clinic):
    """Get connection status of the Evolution API instance."""
    from app.services.evolution_service import EvolutionService
    
    service = EvolutionService(current_clinic)
    result = service.get_instance_status()
    
    return jsonify(result)


@bp.route('/evolution/qrcode', methods=['GET'])
@clinic_required
def get_evolution_qrcode(current_clinic):
    """Get QR Code for connecting WhatsApp."""
    from app.services.evolution_service import EvolutionService
    
    service = EvolutionService(current_clinic)
    qr_code = service.get_qr_code()
    
    if not qr_code:
        return jsonify({'error': 'Could not generate QR code'}), 400
        
    return jsonify({'qrcode': qr_code})


@bp.route('/business-hours', methods=['PUT'])
@clinic_required
def update_business_hours(current_clinic):
    """Configure business hours."""
    data = request.get_json()

    if 'business_hours' not in data:
        return jsonify({'error': 'business_hours is required'}), 400

    current_clinic.business_hours = data['business_hours']
    db.session.commit()

    return jsonify({
        'message': 'Business hours updated',
        'business_hours': current_clinic.business_hours
    })


@bp.route('/services', methods=['PUT'])
@clinic_required
def update_services(current_clinic):
    """Configure clinic services."""
    data = request.get_json()

    if 'services' not in data:
        return jsonify({'error': 'services is required'}), 400

    # Validate services format
    for service in data['services']:
        if 'name' not in service:
            return jsonify({'error': 'Each service must have a name'}), 400
        if 'duration' not in service:
            service['duration'] = 30  # Default duration

    current_clinic.services = data['services']
    db.session.commit()

    return jsonify({
        'message': 'Services updated',
        'services': current_clinic.services
    })


@bp.route('/claude-config', methods=['PUT'])
@clinic_required
def update_claude_config(current_clinic):
    """Configure Claude API key (optional - uses global key by default)."""
    data = request.get_json()

    if 'claude_api_key' in data:
        current_clinic.claude_api_key = data['claude_api_key'] or None

    db.session.commit()

    return jsonify({
        'message': 'Claude API configuration updated',
        'has_custom_key': bool(current_clinic.claude_api_key)
    })
