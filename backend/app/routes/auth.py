from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, create_refresh_token, jwt_required, get_jwt_identity

from app import db
from app.models import Clinic
from app.utils.validators import validate_email, validate_phone, validate_password, normalize_phone
from app.utils.rate_limiter import limiter

bp = Blueprint('auth', __name__, url_prefix='/api/auth')


@bp.route('/register', methods=['POST'])
@limiter.limit("5 per minute")
def register():
    """Register a new clinic."""
    data = request.get_json()

    # Validate required fields
    required_fields = ['name', 'email', 'phone', 'password']
    for field in required_fields:
        if not data.get(field):
            return jsonify({'error': f'{field} is required'}), 400

    # Validate email format
    if not validate_email(data['email']):
        return jsonify({'error': 'Invalid email format'}), 400

    # Validate phone format
    if not validate_phone(data['phone']):
        return jsonify({'error': 'Invalid phone format'}), 400

    # Validate password strength
    is_valid, error_msg = validate_password(data['password'])
    if not is_valid:
        return jsonify({'error': error_msg}), 400

    # Check if email already exists
    if Clinic.query.filter_by(email=data['email']).first():
        return jsonify({'error': 'Email already registered'}), 409

    # Normalize phone number to expected format
    normalized_phone = normalize_phone(data['phone'])

    # Create new clinic
    clinic = Clinic(
        name=data['name'],
        email=data['email'],
        phone=normalized_phone
    )
    clinic.set_password(data['password'])

    # Set default business hours (Monday to Friday, 8:00-18:00)
    clinic.business_hours = {
        '0': {'start': '08:00', 'end': '18:00', 'active': True},   # Monday
        '1': {'start': '08:00', 'end': '18:00', 'active': True},   # Tuesday
        '2': {'start': '08:00', 'end': '18:00', 'active': True},   # Wednesday
        '3': {'start': '08:00', 'end': '18:00', 'active': True},   # Thursday
        '4': {'start': '08:00', 'end': '18:00', 'active': True},   # Friday
        '5': {'start': '08:00', 'end': '12:00', 'active': False},  # Saturday
        '6': {'start': '08:00', 'end': '12:00', 'active': False}   # Sunday
    }

    # Set default services
    clinic.services = [
        {'name': 'Consulta Geral', 'duration': 30},
        {'name': 'Retorno', 'duration': 15}
    ]

    db.session.add(clinic)
    db.session.commit()

    # Generate tokens
    access_token = create_access_token(identity=str(clinic.id))
    refresh_token = create_refresh_token(identity=str(clinic.id))

    return jsonify({
        'message': 'Clinic registered successfully',
        'clinic': clinic.to_dict(),
        'access_token': access_token,
        'refresh_token': refresh_token
    }), 201


@bp.route('/login', methods=['POST'])
@limiter.limit("10 per minute")
def login():
    """Login and get JWT tokens."""
    data = request.get_json()

    if not data.get('email') or not data.get('password'):
        return jsonify({'error': 'Email and password are required'}), 400

    clinic = Clinic.query.filter_by(email=data['email']).first()

    if not clinic or not clinic.check_password(data['password']):
        return jsonify({'error': 'Invalid email or password'}), 401

    if not clinic.active:
        return jsonify({'error': 'Account is inactive'}), 403

    access_token = create_access_token(identity=str(clinic.id))
    refresh_token = create_refresh_token(identity=str(clinic.id))

    return jsonify({
        'message': 'Login successful',
        'clinic': clinic.to_dict(include_sensitive=True),
        'access_token': access_token,
        'refresh_token': refresh_token
    })


@bp.route('/refresh', methods=['POST'])
@limiter.limit("30 per minute")
@jwt_required(refresh=True)
def refresh():
    """Refresh access token."""
    clinic_id = get_jwt_identity()
    clinic = Clinic.query.get(clinic_id)

    if not clinic:
        return jsonify({'error': 'Clinic not found'}), 404

    if not clinic.active:
        return jsonify({'error': 'Account is inactive'}), 403

    access_token = create_access_token(identity=str(clinic.id))

    return jsonify({
        'access_token': access_token
    })


@bp.route('/me', methods=['GET'])
@jwt_required()
def me():
    """Get current clinic info."""
    clinic_id = get_jwt_identity()
    clinic = Clinic.query.get(clinic_id)

    if not clinic:
        return jsonify({'error': 'Clinic not found'}), 404

    return jsonify(clinic.to_dict(include_sensitive=True))
