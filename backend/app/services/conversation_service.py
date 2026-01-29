import logging
from datetime import datetime
from typing import Optional

from app import db
from app.models import Conversation, Patient, BotTransfer, ConversationStatus
from app.utils.validators import normalize_phone

logger = logging.getLogger(__name__)


class ConversationService:
    """Service for managing conversation context and history."""

    def __init__(self, clinic):
        self.clinic = clinic

    def get_or_create_conversation(self, phone_number: str) -> Conversation:
        """
        Get active conversation or create a new one.

        Args:
            phone_number: Phone number of the contact

        Returns:
            Conversation instance
        """
        phone = normalize_phone(phone_number)

        # Look for active conversation
        conversation = Conversation.query.filter(
            Conversation.clinic_id == self.clinic.id,
            Conversation.phone_number == phone,
            Conversation.status.in_([
                ConversationStatus.ACTIVE,
                ConversationStatus.TRANSFERRED_TO_HUMAN
            ])
        ).first()

        if conversation:
            return conversation

        # Find or create patient
        patient = Patient.query.filter_by(
            clinic_id=self.clinic.id,
            phone=phone
        ).first()

        # Create new conversation
        conversation = Conversation(
            clinic_id=self.clinic.id,
            patient_id=patient.id if patient else None,
            phone_number=phone,
            messages=[],
            context={}
        )

        db.session.add(conversation)
        db.session.commit()

        logger.info('New conversation created for %s', phone)

        return conversation

    def add_message(
        self,
        conversation: Conversation,
        role: str,
        content: str
    ) -> None:
        """
        Add a message to the conversation history.

        Args:
            conversation: The conversation to add to
            role: 'user' or 'assistant'
            content: Message content
        """
        conversation.add_message(role, content)
        db.session.commit()

    def update_context(
        self,
        conversation: Conversation,
        context_updates: dict
    ) -> None:
        """
        Update conversation context.

        Args:
            conversation: The conversation to update
            context_updates: Dict of context values to update
        """
        current_context = conversation.context or {}
        current_context.update(context_updates)
        conversation.context = current_context
        db.session.commit()

    def link_patient(
        self,
        conversation: Conversation,
        patient: Patient
    ) -> None:
        """
        Link a patient to a conversation.

        Args:
            conversation: The conversation
            patient: The patient to link
        """
        conversation.patient_id = patient.id
        db.session.commit()

    def transfer_to_human(
        self,
        conversation: Conversation,
        reason: str
    ) -> BotTransfer:
        """
        Transfer conversation to human handling.

        Args:
            conversation: The conversation to transfer
            reason: Reason for transfer

        Returns:
            BotTransfer record
        """
        conversation.status = ConversationStatus.TRANSFERRED_TO_HUMAN

        transfer = BotTransfer(
            conversation_id=conversation.id,
            reason=reason
        )

        db.session.add(transfer)
        db.session.commit()

        logger.info(
            'Conversation %s transferred to human. Reason: %s',
            conversation.id, reason
        )

        return transfer

    def complete_conversation(self, conversation: Conversation) -> None:
        """
        Mark conversation as completed.

        Args:
            conversation: The conversation to complete
        """
        conversation.status = ConversationStatus.COMPLETED
        db.session.commit()

        logger.info('Conversation %s completed', conversation.id)

    def get_message_history_for_claude(
        self,
        conversation: Conversation,
        max_messages: int = 20
    ) -> list:
        """
        Get message history formatted for Claude API.

        Args:
            conversation: The conversation
            max_messages: Maximum number of messages to include

        Returns:
            List of message dicts for Claude API
        """
        messages = conversation.messages or []

        # Take last N messages
        recent_messages = messages[-max_messages:]

        # Format for Claude API
        formatted = []
        for msg in recent_messages:
            formatted.append({
                'role': msg['role'],
                'content': msg['content']
            })

        return formatted

    def get_context_summary(self, conversation: Conversation) -> str:
        """
        Get a summary of the conversation context for Claude.

        Args:
            conversation: The conversation

        Returns:
            Context summary string
        """
        context = conversation.context or {}
        patient = conversation.patient

        parts = []

        if patient:
            parts.append(f"Nome do paciente: {patient.name}")
            parts.append(f"Telefone: {patient.phone}")
            if patient.email:
                parts.append(f"Email: {patient.email}")
            if patient.notes:
                parts.append(f"Observações: {patient.notes}")

        # Add any stored context
        if context.get('last_service_discussed'):
            parts.append(f"Último serviço discutido: {context['last_service_discussed']}")

        if context.get('preferred_time'):
            parts.append(f"Horário preferido: {context['preferred_time']}")

        return '\n'.join(parts) if parts else 'Novo contato, sem histórico.'
