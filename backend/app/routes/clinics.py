from flask import Blueprint, request, jsonify
from marshmallow import ValidationError

from app import db
from app.schemas.clinic import BusinessHoursSchema, ServiceSchema
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

    # Autonomous / proactive automation toggles
    bool_automation_fields = [
        'proactive_outreach_enabled', 'noshow_recovery_enabled', 'waitlist_enabled',
        'recall_enabled', 'funnel_automation_enabled', 'weekly_report_enabled',
    ]
    for field in bool_automation_fields:
        if field in data:
            setattr(current_clinic, field, bool(data[field]))

    if 'recall_inactive_days' in data:
        try:
            days = int(data['recall_inactive_days'])
            # Clamp to a sane range (1 month to 2 years)
            current_clinic.recall_inactive_days = max(30, min(730, days))
        except (TypeError, ValueError):
            return jsonify({'error': 'recall_inactive_days deve ser um número'}), 400

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
    """Get QR Code for connecting WhatsApp, plus expiry info for the connection wizard."""
    from app.services.evolution_service import EvolutionService

    service = EvolutionService(current_clinic)
    result = service.get_qr_code_info()

    if not result:
        return jsonify({'error': 'Could not generate QR code'}), 400

    return jsonify(result)


@bp.route('/business-hours', methods=['PUT'])
@clinic_required
def update_business_hours(current_clinic):
    """Configure business hours."""
    data = request.get_json()

    if 'business_hours' not in data:
        return jsonify({'error': 'business_hours is required'}), 400

    try:
        BusinessHoursSchema().load(data['business_hours'] or {})
    except ValidationError as err:
        return jsonify({'error': 'Invalid business_hours', 'details': err.messages}), 400

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

    try:
        validated_services = ServiceSchema(many=True).load(data['services'] or [])
    except ValidationError as err:
        return jsonify({'error': 'Invalid services', 'details': err.messages}), 400

    current_clinic.services = validated_services
    db.session.commit()

    return jsonify({
        'message': 'Services updated',
        'services': current_clinic.services
    })


@bp.route('/openrouter-config', methods=['PUT'])
@clinic_required
def update_openrouter_config(current_clinic):
    """Configure OpenRouter API key (optional - uses global key by default)."""
    data = request.get_json()

    if 'openrouter_api_key' in data:
        current_clinic.openrouter_api_key = data['openrouter_api_key'] or None

    db.session.commit()

    return jsonify({
        'message': 'OpenRouter API configuration updated',
        'has_custom_key': bool(current_clinic.openrouter_api_key)
    })
