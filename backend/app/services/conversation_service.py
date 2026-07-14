import logging
from typing import Optional

from app import db
from app.models import Conversation, Patient, BotTransfer, ConversationStatus
from app.utils.validators import normalize_phone
from app.services.realtime_service import publish_event

logger = logging.getLogger(__name__)

# Synthetic conversations created by the "test agent" preview feature
# (see routes/agents.py) use this phone prefix and should never be
# broadcast to the clinic's live realtime channel.
TEST_PHONE_PREFIX = 'TEST-'


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
        content: str,
        message_id: str = None,
        evolution_id: str = None,
        status: str = 'sent',
        message_type: str = 'text',
        media_url: str = None,
        media_mimetype: str = None,
        caption: str = None,
        sent_via: str = None
    ) -> dict:
        """
        Add a message to the conversation history and broadcast it in realtime.

        Args:
            conversation: The conversation to add to
            role: 'user' or 'assistant'
            content: Message content
        """
        message = conversation.add_message(
            role,
            content,
            message_id=message_id,
            evolution_id=evolution_id,
            status=status,
            message_type=message_type,
            media_url=media_url,
            media_mimetype=media_mimetype,
            caption=caption,
            sent_via=sent_via
        )
        db.session.commit()

        if not conversation.phone_number.startswith(TEST_PHONE_PREFIX):
            publish_event(str(self.clinic.id), 'new_message', {
                'conversation_id': str(conversation.id),
                'conversation_status': conversation.status,
                'message': message
            })

        return message

    def find_conversation_with_message(self, phone_number: str, evolution_id: str) -> Optional[Conversation]:
        """Find the conversation (active or not) for this phone that contains a message with this evolution_id."""
        phone = normalize_phone(phone_number)
        conversations = Conversation.query.filter_by(
            clinic_id=self.clinic.id,
            phone_number=phone
        ).order_by(Conversation.last_message_at.desc()).all()

        for conversation in conversations:
            if conversation.find_message(evolution_id):
                return conversation

        return None

    def update_message_status(
        self,
        conversation: Conversation,
        message_id: str,
        status: str
    ) -> Optional[dict]:
        """Update a message's delivery/read status and broadcast the change."""
        updated = conversation.update_message_status(message_id, status)
        if not updated:
            return None

        db.session.commit()

        publish_event(str(self.clinic.id), 'message_status', {
            'conversation_id': str(conversation.id),
            'message_id': updated.get('id'),
            'status': status
        })

        return updated

    def attach_evolution_id_to_last_reply(
        self,
        conversation: Conversation,
        evolution_id: str
    ) -> Optional[dict]:
        """Attach the real WhatsApp message id to the bot's most recent reply, for later ACK matching."""
        updated = conversation.set_evolution_id_for_last_message(evolution_id, role='assistant')
        if updated:
            db.session.commit()
        return updated

    def attach_evolution_id_to_last_inbound(
        self,
        conversation: Conversation,
        evolution_id: str
    ) -> Optional[dict]:
        """Attach the real WhatsApp message id to the patient's most recent message."""
        updated = conversation.set_evolution_id_for_last_message(evolution_id, role='user')
        if updated:
            db.session.commit()
        return updated

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
        reason: str,
        urgent: bool = False
    ) -> BotTransfer:
        """
        Transfer conversation to human handling.

        Args:
            conversation: The conversation to transfer
            reason: Reason for transfer
            urgent: Whether this needs priority attention (e.g. dental emergency)

        Returns:
            BotTransfer record
        """
        conversation.status = ConversationStatus.TRANSFERRED_TO_HUMAN
        conversation.urgent = urgent

        transfer = BotTransfer(
            conversation_id=conversation.id,
            reason=reason,
            urgent=urgent
        )

        db.session.add(transfer)
        db.session.commit()

        logger.info(
            'Conversation %s transferred to human (urgent=%s). Reason: %s',
            conversation.id, urgent, reason
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

        # Format for Claude API. Skip empty-content entries (e.g. a media
        # message stored without a caption in older data) - Claude's API
        # rejects empty text blocks.
        formatted = []
        for msg in recent_messages:
            if not msg.get('content'):
                continue
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

    def sync_history_from_whatsapp(self, conversation: Conversation, max_messages: int = 2000) -> int:
        """
        Fetch this conversation's WhatsApp message history from Evolution API
        and merge in anything we don't already have, so older messages (sent
        before the instance was connected, or directly from the linked phone)
        become part of the stored history and available to the AI as context.

        Returns the number of messages actually added.
        """
        from app.services.evolution_service import EvolutionService

        historical = EvolutionService(self.clinic).fetch_chat_history(
            conversation.phone_number, max_messages=max_messages
        )
        added = conversation.merge_history_messages(historical)

        if added:
            db.session.commit()
            if not conversation.phone_number.startswith(TEST_PHONE_PREFIX):
                publish_event(str(self.clinic.id), 'history_synced', {
                    'conversation_id': str(conversation.id),
                    'added': added,
                })

        return added

    def sync_all_conversations_history(
        self,
        max_messages_per_conversation: int = 500,
        time_budget_seconds: float = 90.0
    ) -> dict:
        """
        Sync WhatsApp history for every existing conversation of this clinic,
        oldest-touched first. Bounded by a wall-clock time budget so a clinic
        with many contacts can't time out the request - call again to pick up
        where it left off (already-synced messages are deduped, so repeat
        calls are safe and just make incremental progress).

        Returns {'synced': N, 'total_added': M, 'remaining': K}.
        """
        import time

        start = time.monotonic()
        conversations = Conversation.query.filter_by(clinic_id=self.clinic.id).order_by(
            Conversation.last_message_at.asc()
        ).all()

        synced = 0
        total_added = 0

        for conversation in conversations:
            if time.monotonic() - start >= time_budget_seconds:
                break
            total_added += self.sync_history_from_whatsapp(
                conversation, max_messages=max_messages_per_conversation
            )
            synced += 1

        return {
            'synced': synced,
            'total_added': total_added,
            'remaining': max(len(conversations) - synced, 0),
        }
