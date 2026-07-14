import hashlib
import logging

from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import create_access_token, create_refresh_token, jwt_required, get_jwt_identity

from app import db
from app.models import Clinic, SubscriptionStatus
from app.utils.validators import validate_email, validate_phone, validate_password, normalize_phone
from app.utils.rate_limiter import limiter
from app.services.email_service import EmailService
from app.services.billing_service import BillingService

bp = Blueprint('auth', __name__, url_prefix='/api/auth')
logger = logging.getLogger(__name__)


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

    # Check if email already exists (the model stores emails lowercased, so
    # compare against the normalized form to return 409 instead of tripping
    # the unique constraint on insert)
    if Clinic.query.filter_by(email=data['email'].lower()).first():
        return jsonify({'error': 'Email already registered'}), 409

    # Normalize phone number to expected format
    normalized_phone = normalize_phone(data['phone'])

    # Create new clinic. Access is gated on payment - no free trial - so the
    # clinic starts inactive until a Kiwify webhook confirms the first charge.
    clinic = Clinic(
        name=data['name'],
        email=data['email'],
        phone=normalized_phone,
        active=False,
        subscription_status=SubscriptionStatus.PENDING_PAYMENT
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

    # Best-effort welcome e-mail - must never fail registration
    try:
        EmailService().send_welcome_email(clinic)
    except Exception:
        logger.exception('Failed to send welcome email to clinic %s', clinic.id)

    # Generate tokens
    access_token = create_access_token(identity=str(clinic.id))
    refresh_token = create_refresh_token(identity=str(clinic.id))

    return jsonify({
        'message': 'Clinic registered successfully',
        'clinic': clinic.to_dict(),
        'access_token': access_token,
        'refresh_token': refresh_token,
        'checkout_url': BillingService.checkout_url_for(clinic)
    }), 201


@bp.route('/login', methods=['POST'])
@limiter.limit("10 per minute")
def login():
    """Login and get JWT tokens."""
    data = request.get_json()

    if not data.get('email') or not data.get('password'):
        return jsonify({'error': 'Email and password are required'}), 400

    # Emails are stored lowercased (see Clinic.validate_email), so normalize
    # the lookup - otherwise logging in with a different casing fails.
    clinic = Clinic.query.filter_by(email=data['email'].lower()).first()

    if not clinic or not clinic.check_password(data['password']):
        return jsonify({'error': 'Invalid email or password'}), 401

    if not clinic.active:
        return jsonify({
            'error': 'Assinatura inativa. Finalize o pagamento para continuar.',
            'error_code': 'SUBSCRIPTION_INACTIVE',
            'subscription_status': clinic.subscription_status,
            'checkout_url': BillingService.checkout_url_for(clinic)
        }), 403

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


GENERIC_FORGOT_PASSWORD_MESSAGE = (
    'Se o e-mail informado estiver cadastrado, voce recebera um link para redefinir sua senha.'
)


@bp.route('/forgot-password', methods=['POST'])
@limiter.limit("5 per minute")
def forgot_password():
    """Request a password reset e-mail. Always returns a generic message to avoid user enumeration."""
    data = request.get_json() or {}
    email = data.get('email')

    if not email:
        return jsonify({'error': 'email is required'}), 400

    clinic = Clinic.query.filter_by(email=email.lower()).first()

    if clinic and clinic.active:
        raw_token = clinic.generate_password_reset_token()
        db.session.commit()

        reset_url = f"{current_app.config['FRONTEND_URL']}/redefinir-senha?token={raw_token}"
        try:
            EmailService().send_password_reset_email(clinic, reset_url)
        except Exception:
            logger.exception('Failed to send password reset email to clinic %s', clinic.id)

    return jsonify({'message': GENERIC_FORGOT_PASSWORD_MESSAGE})


@bp.route('/reset-password', methods=['POST'])
@limiter.limit("10 per minute")
def reset_password():
    """Reset a clinic's password using a token issued by /forgot-password."""
    data = request.get_json() or {}
    token = data.get('token')
    new_password = data.get('password')

    if not token or not new_password:
        return jsonify({'error': 'token and password are required'}), 400

    is_valid, error_msg = validate_password(new_password)
    if not is_valid:
        return jsonify({'error': error_msg}), 400

    token_hash = hashlib.sha256(token.encode()).hexdigest()
    clinic = Clinic.query.filter_by(password_reset_token_hash=token_hash).first()

    if not clinic or not clinic.verify_password_reset_token(token):
        return jsonify({'error': 'Invalid or expired token'}), 400

    clinic.set_password(new_password)
    clinic.clear_password_reset_token()
    db.session.commit()

    return jsonify({'message': 'Senha redefinida com sucesso'})
