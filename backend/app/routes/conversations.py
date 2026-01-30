from flask import Blueprint, request, jsonify

from app import db
from app.models import Conversation, BotTransfer, ConversationStatus, Patient, PipelineStage
from app.utils.auth import clinic_required
from app.utils.validators import normalize_phone

bp = Blueprint('conversations', __name__, url_prefix='/api/conversations')


@bp.route('', methods=['GET'])
@clinic_required
def list_conversations(current_clinic):
    """List conversations with filters."""
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    status = request.args.get('status')
    needs_attention = request.args.get('needs_attention', type=bool)

    query = Conversation.query.filter_by(clinic_id=current_clinic.id)

    if status:
        query = query.filter_by(status=status)

    if needs_attention:
        query = query.filter_by(status=ConversationStatus.TRANSFERRED_TO_HUMAN)

    query = query.order_by(Conversation.last_message_at.desc())

    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        'conversations': [c.to_dict(include_messages=False, include_last_message_only=True) for c in pagination.items],
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': page,
        'needs_attention_count': Conversation.query.filter_by(
            clinic_id=current_clinic.id,
            status=ConversationStatus.TRANSFERRED_TO_HUMAN
        ).count()
    })


@bp.route('/<conversation_id>', methods=['GET'])
@clinic_required
def get_conversation(conversation_id, current_clinic):
    """Get conversation details with full message history."""
    conversation = Conversation.query.filter_by(
        id=conversation_id,
        clinic_id=current_clinic.id
    ).first()

    if not conversation:
        return jsonify({'error': 'Conversation not found'}), 404

    # Get bot transfers for this conversation
    transfers = BotTransfer.query.filter_by(
        conversation_id=conversation.id
    ).order_by(BotTransfer.transferred_at.desc()).all()

    data = conversation.to_dict(include_messages=True)
    data['transfers'] = [t.to_dict() for t in transfers]

    return jsonify(data)


@bp.route('/<conversation_id>/transfer', methods=['POST'])
@clinic_required
def transfer_conversation(conversation_id, current_clinic):
    """Transfer conversation to human (manual trigger)."""
    conversation = Conversation.query.filter_by(
        id=conversation_id,
        clinic_id=current_clinic.id
    ).first()

    if not conversation:
        return jsonify({'error': 'Conversation not found'}), 404

    data = request.get_json()
    reason = data.get('reason', 'Manual transfer by operator')

    # Update conversation status
    conversation.status = ConversationStatus.TRANSFERRED_TO_HUMAN

    # Create transfer record
    transfer = BotTransfer(
        conversation_id=conversation.id,
        reason=reason
    )

    db.session.add(transfer)
    db.session.commit()

    return jsonify({
        'message': 'Conversation transferred to human',
        'transfer': transfer.to_dict()
    })


@bp.route('/<conversation_id>/resolve', methods=['PUT'])
@clinic_required
def resolve_conversation(conversation_id, current_clinic):
    """Mark conversation as resolved."""
    conversation = Conversation.query.filter_by(
        id=conversation_id,
        clinic_id=current_clinic.id
    ).first()

    if not conversation:
        return jsonify({'error': 'Conversation not found'}), 404

    # Mark conversation as completed
    conversation.status = ConversationStatus.COMPLETED

    # Resolve any pending transfers
    pending_transfers = BotTransfer.query.filter_by(
        conversation_id=conversation.id,
        resolved=False
    ).all()

    for transfer in pending_transfers:
        transfer.resolve()

    db.session.commit()

    return jsonify({
        'message': 'Conversation resolved',
        'conversation': conversation.to_dict(include_messages=False)
    })


@bp.route('/<conversation_id>/reactivate', methods=['PUT'])
@clinic_required
def reactivate_conversation(conversation_id, current_clinic):
    """Reactivate a conversation (return to bot handling)."""
    conversation = Conversation.query.filter_by(
        id=conversation_id,
        clinic_id=current_clinic.id
    ).first()

    if not conversation:
        return jsonify({'error': 'Conversation not found'}), 404

    conversation.status = ConversationStatus.ACTIVE

    db.session.commit()

    return jsonify({
        'message': 'Conversation reactivated',
        'conversation': conversation.to_dict(include_messages=False)
    })


@bp.route('/<conversation_id>/link-patient', methods=['POST'])
@clinic_required
def link_patient(conversation_id, current_clinic):
    """Link or create a patient for a conversation."""
    conversation = Conversation.query.filter_by(
        id=conversation_id,
        clinic_id=current_clinic.id
    ).first()

    if not conversation:
        return jsonify({'error': 'Conversation not found'}), 404

    data = request.get_json()

    name = data.get('name')
    phone = normalize_phone(data.get('phone') or conversation.phone_number)
    email = data.get('email')
    notes = data.get('notes')

    if not name:
        return jsonify({'error': 'Nome é obrigatório'}), 400

    if not phone:
        return jsonify({'error': 'Telefone é obrigatório'}), 400

    # Try to find existing patient with this phone (including soft deleted)
    patient = Patient.query.filter_by(
        clinic_id=current_clinic.id,
        phone=phone
    ).first()

    if patient:
        # Restore if soft deleted
        if patient.deleted_at is not None:
            patient.restore()

        # Update existing patient
        patient.name = name
        if email:
            patient.email = email
        if notes:
            patient.notes = notes

        # Ensure patient has a pipeline stage
        if not patient.pipeline_stage_id:
            default_stage = PipelineStage.query.filter_by(
                clinic_id=current_clinic.id,
                is_default=True
            ).first()
            if not default_stage:
                default_stage = PipelineStage.query.filter_by(
                    clinic_id=current_clinic.id
                ).order_by(PipelineStage.order).first()
            if default_stage:
                patient.pipeline_stage_id = default_stage.id
    else:
        # Find default pipeline stage for new patients
        default_stage = PipelineStage.query.filter_by(
            clinic_id=current_clinic.id,
            is_default=True
        ).first()

        # If no default set, get the first one by order
        if not default_stage:
            default_stage = PipelineStage.query.filter_by(
                clinic_id=current_clinic.id
            ).order_by(PipelineStage.order).first()

        # Create new patient with pipeline stage
        patient = Patient(
            clinic_id=current_clinic.id,
            name=name,
            phone=phone,
            email=email,
            notes=notes,
            pipeline_stage_id=default_stage.id if default_stage else None
        )
        db.session.add(patient)
        db.session.flush()

    # Link patient to conversation
    conversation.patient_id = patient.id
    db.session.commit()

    return jsonify({
        'message': 'Paciente vinculado com sucesso',
        'patient': patient.to_dict()
    })

