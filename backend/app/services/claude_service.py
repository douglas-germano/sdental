import logging
import json
from datetime import datetime
from typing import Optional
from zoneinfo import ZoneInfo

from flask import current_app
import anthropic

from app import db
from app.models import Conversation, Patient, ConversationStatus
from app.services.appointment_service import AppointmentService
from app.services.conversation_service import ConversationService

logger = logging.getLogger(__name__)

SYSTEM_PROMPT_TEMPLATE = """{current_datetime}

Você é um assistente virtual de agendamento para a clínica {clinic_name}.

INFORMAÇÕES DA CLÍNICA:
- Serviços oferecidos: {services}
- Horários de funcionamento: {business_hours}
- Duração padrão das consultas: 30 minutos

SUA FUNÇÃO:
1. Receber solicitações de agendamento de pacientes via WhatsApp
2. Verificar disponibilidade de horários
3. Confirmar agendamentos com nome, telefone e horário escolhido
4. Listar agendamentos existentes quando solicitado
5. Permitir cancelamentos
6. Transferir para atendimento humano quando necessário

DADOS DO PACIENTE:
- Se o paciente for NOVO (não aparecer nome no contexto), você DEVE coletar:
  * Nome completo
  * Email (opcional, mas recomendado)
  * Confirmar o número de telefone
- Faça isso de forma natural e educada ANTES de marcar a consulta
- Exemplo: "Para confirmar seu agendamento, preciso de algumas informações. Qual o seu nome completo?"

REGRAS IMPORTANTES:
- Sempre seja educado e profissional
- Colete nome completo antes de agendar (se não souber)
- Confirme todos os detalhes antes de finalizar agendamento
- Se não conseguir resolver, use a função transfer_to_human
- Horários devem estar dentro do funcionamento da clínica
- Não agende em horários já ocupados
- Sempre envie mensagem de confirmação após agendar

FORMATO DE RESPOSTAS:
- Seja conciso e objetivo
- Use quebras de linha para melhor legibilidade
- Não use markdown ou formatação especial
- Emojis podem ser usados moderadamente para tornar a conversa amigável

{context_info}
"""


class ClaudeService:
    """Service for processing messages with Claude AI."""

    def __init__(self, clinic):
        self.clinic = clinic
        api_key = clinic.claude_api_key or current_app.config.get('CLAUDE_API_KEY')
        if not api_key:
            raise ValueError('Claude API key not configured')
        self.client = anthropic.Anthropic(api_key=api_key)
        self.appointment_service = AppointmentService(clinic)
        self.conversation_service = ConversationService(clinic)

    def _get_tools(self) -> list:
        """Define tools available to Claude."""
        return [
            {
                "name": "check_availability",
                "description": "Verifica horários disponíveis para agendamento em uma data específica",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "date": {
                            "type": "string",
                            "description": "Data para verificar disponibilidade (formato: YYYY-MM-DD)"
                        },
                        "service": {
                            "type": "string",
                            "description": "Nome do serviço/procedimento (opcional)"
                        }
                    },
                    "required": ["date"]
                }
            },
            {
                "name": "create_appointment",
                "description": "Cria um novo agendamento para o paciente",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "patient_name": {
                            "type": "string",
                            "description": "Nome completo do paciente"
                        },
                        "datetime": {
                            "type": "string",
                            "description": "Data e hora do agendamento (formato: YYYY-MM-DDTHH:MM)"
                        },
                        "service": {
                            "type": "string",
                            "description": "Nome do serviço/procedimento"
                        }
                    },
                    "required": ["patient_name", "datetime", "service"]
                }
            },
            {
                "name": "list_appointments",
                "description": "Lista os agendamentos futuros do paciente",
                "input_schema": {
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            },
            {
                "name": "cancel_appointment",
                "description": "Cancela um agendamento existente",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "appointment_id": {
                            "type": "string",
                            "description": "ID do agendamento a ser cancelado"
                        }
                    },
                    "required": ["appointment_id"]
                }
            },
            {
                "name": "get_current_datetime",
                "description": "Retorna a data e hora atual, incluindo o dia da semana. Use esta ferramenta quando tiver dúvida sobre que dia é hoje ou qual o dia da semana de uma data.",
                "input_schema": {
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            },
            {
                "name": "transfer_to_human",
                "description": "Transfere a conversa para atendimento humano quando não conseguir resolver a solicitação",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "reason": {
                            "type": "string",
                            "description": "Motivo da transferência"
                        }
                    },
                    "required": ["reason"]
                }
            }
        ]

    def _format_services(self) -> str:
        """Format clinic services for the prompt."""
        services = self.clinic.services or []
        if not services:
            return "Consulta Geral (30 min)"
        return ", ".join([
            f"{s.get('name')} ({s.get('duration', 30)} min)"
            for s in services
        ])

    def _format_business_hours(self) -> str:
        """Format business hours for the prompt."""
        hours = self.clinic.business_hours or {}
        days = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']
        parts = []
        for i, day in enumerate(days):
            config = hours.get(str(i), {})
            if config.get('active'):
                parts.append(f"{day}: {config.get('start', '08:00')} - {config.get('end', '18:00')}")
        return ", ".join(parts) if parts else "Segunda a Sexta: 08:00 - 18:00"

    def _execute_tool(
        self,
        tool_name: str,
        tool_input: dict,
        conversation: Conversation
    ) -> str:
        """Execute a tool and return the result."""
        logger.info('Executing tool: %s with input: %s', tool_name, tool_input)

        if tool_name == "check_availability":
            try:
                date = datetime.strptime(tool_input['date'], '%Y-%m-%d').date()
                slots = self.appointment_service.get_available_slots(
                    date,
                    tool_input.get('service')
                )
                if not slots:
                    return f"Não há horários disponíveis em {tool_input['date']}."
                
                # Get day of week
                weekday_names = ['segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo']
                weekday = weekday_names[date.weekday()]
                
                slots_str = ", ".join([s['start_time'] for s in slots[:10]])
                return f"Horários disponíveis para {weekday}, {date.strftime('%d/%m/%Y')}:\n{slots_str}"
            except Exception as e:
                logger.error('Error checking availability: %s', str(e))
                return f"Erro ao verificar disponibilidade: {str(e)}"

        elif tool_name == "create_appointment":
            try:
                dt = datetime.fromisoformat(tool_input['datetime'])
                
                # Validate date is in the future
                now = datetime.now(ZoneInfo('America/Sao_Paulo'))
                if dt.replace(tzinfo=None) <= now.replace(tzinfo=None):
                    return "Não é possível agendar para uma data/hora que já passou. Por favor, escolha um horário futuro."
                
                # Validate it's a business day
                day_config = self.clinic.business_hours.get(str(dt.weekday()), {})
                if not day_config.get('active', False):
                    weekday_names = ['segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo']
                    return f"A clínica não funciona às {weekday_names[dt.weekday()]}s. Por favor, escolha outro dia."
                
                appointment, error = self.appointment_service.create_appointment(
                    patient_name=tool_input['patient_name'],
                    patient_phone=conversation.phone_number,
                    scheduled_datetime=dt,
                    service_name=tool_input['service']
                )
                if error:
                    return f"Não foi possível agendar: {error}"

                # Link patient to conversation if not linked
                if not conversation.patient_id and appointment:
                    patient = Patient.query.get(appointment.patient_id)
                    self.conversation_service.link_patient(conversation, patient)
                
                # Get day of week for confirmation
                weekday_names = ['segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo']
                weekday = weekday_names[dt.weekday()]

                return (
                    f"Agendamento confirmado!\n"
                    f"Paciente: {tool_input['patient_name']}\n"
                    f"Serviço: {tool_input['service']}\n"
                    f"Data/Hora: {weekday}, {dt.strftime('%d/%m/%Y às %H:%M')}\n"
                    f"ID: {appointment.id}"
                )
            except Exception as e:
                logger.error('Error creating appointment: %s', str(e))
                return f"Erro ao criar agendamento: {str(e)}"

        elif tool_name == "list_appointments":
            try:
                appointments = self.appointment_service.get_patient_appointments(
                    conversation.phone_number
                )
                if not appointments:
                    return "Você não possui agendamentos futuros."

                lines = ["Seus agendamentos:"]
                for apt in appointments[:5]:
                    lines.append(
                        f"- {apt.scheduled_datetime.strftime('%d/%m/%Y %H:%M')} "
                        f"- {apt.service_name} (ID: {apt.id})"
                    )
                return "\n".join(lines)
            except Exception as e:
                logger.error('Error listing appointments: %s', str(e))
                return f"Erro ao listar agendamentos: {str(e)}"

        elif tool_name == "cancel_appointment":
            try:
                success, error = self.appointment_service.cancel_appointment(
                    tool_input['appointment_id']
                )
                if not success:
                    return f"Não foi possível cancelar: {error}"
                return "Agendamento cancelado com sucesso."
            except Exception as e:
                logger.error('Error cancelling appointment: %s', str(e))
                return f"Erro ao cancelar agendamento: {str(e)}"

        elif tool_name == "get_current_datetime":
            try:
                now = datetime.now(ZoneInfo('America/Sao_Paulo'))
                weekday_names = ['segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo']
                month_names = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
                weekday = weekday_names[now.weekday()]
                month = month_names[now.month - 1]
                
                return (
                    f"Data e hora atual:\n"
                    f"{weekday}, {now.day} de {month} de {now.year}\n"
                    f"Horário: {now.strftime('%H:%M')} (Horário de Brasília)"
                )
            except Exception as e:
                logger.error('Error getting current datetime: %s', str(e))
                return f"Erro ao obter data/hora: {str(e)}"

        elif tool_name == "transfer_to_human":
            try:
                self.conversation_service.transfer_to_human(
                    conversation,
                    tool_input.get('reason', 'Solicitação do paciente')
                )
                return "Conversa transferida para atendimento humano."
            except Exception as e:
                logger.error('Error transferring to human: %s', str(e))
                return f"Erro ao transferir: {str(e)}"

        return "Ferramenta não reconhecida."

    def process_message(
        self,
        conversation: Conversation,
        new_message: str
    ) -> str:
        """
        Process an incoming message and generate a response.

        Args:
            conversation: The conversation context
            new_message: The new message from the user

        Returns:
            Response message to send back
        """
        # Check if conversation is transferred to human
        if conversation.status == ConversationStatus.TRANSFERRED_TO_HUMAN:
            return (
                "Sua conversa está sendo atendida por um de nossos colaboradores. "
                "Por favor, aguarde."
            )

        # Add user message to history
        self.conversation_service.add_message(conversation, 'user', new_message)

        # Build system prompt
        context_info = self.conversation_service.get_context_summary(conversation)
        
        # Add custom advisor context if available
        if self.clinic.agent_context:
            context_info = f"{context_info}\n\nINFORMAÇÕES ADICIONAIS:\n{self.clinic.agent_context}"
        
        # Get current datetime in Brazil timezone
        now = datetime.now(ZoneInfo('America/Sao_Paulo'))
        weekday_names = ['segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo']
        weekday = weekday_names[now.weekday()]
        current_datetime_str = f"CONTEXTO TEMPORAL:\nHOJE É: {weekday}, {now.strftime('%d de %B de %Y')} às {now.strftime('%H:%M')} (Horário de Brasília)"
            
        # Determine strictness of system prompt
        if self.clinic.agent_system_prompt:
            # If user provided a custom prompt, use it. 
            # We try to format it with available variables if they are present in the text
            try:
                # Check what keys are in the custom prompt
                system_prompt = self.clinic.agent_system_prompt.format(
                    current_datetime=current_datetime_str,
                    clinic_name=self.clinic.name,
                    services=self._format_services(),
                    business_hours=self._format_business_hours(),
                    context_info=f"CONTEXTO DO PACIENTE:\n{context_info}" if context_info else ""
                )
            except KeyError:
                # If custom prompt doesn't have matching keys, just use it as is (or append context manually)
                # But to be safe and ensure context is passed, we might append it if missing
                system_prompt = self.clinic.agent_system_prompt
                if "{context_info}" not in self.clinic.agent_system_prompt and context_info:
                     system_prompt += f"\n\nCONTEXTO DO PACIENTE:\n{context_info}"
        else:
            # Fallback to default template
            system_prompt = SYSTEM_PROMPT_TEMPLATE.format(
                current_datetime=current_datetime_str,
                clinic_name=self.clinic.name,
                services=self._format_services(),
                business_hours=self._format_business_hours(),
                context_info=f"CONTEXTO DO PACIENTE:\n{context_info}" if context_info else ""
            )

        # Get message history
        messages = self.conversation_service.get_message_history_for_claude(conversation)

        try:
            # Call Claude API
            response = self.client.messages.create(
                model=self.clinic.agent_model or "claude-3-5-sonnet-20240620",
                max_tokens=1024,
                temperature=self.clinic.agent_temperature if self.clinic.agent_temperature is not None else 0.7,
                system=system_prompt,
                tools=self._get_tools(),
                messages=messages
            )

            # Process response
            final_response = ""

            while response.stop_reason == "tool_use":
                # Find tool use blocks
                tool_results = []
                for block in response.content:
                    if block.type == "tool_use":
                        result = self._execute_tool(
                            block.name,
                            block.input,
                            conversation
                        )
                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": result
                        })
                    elif block.type == "text":
                        final_response += block.text

                # Continue conversation with tool results
                messages.append({"role": "assistant", "content": response.content})
                messages.append({"role": "user", "content": tool_results})

                response = self.client.messages.create(
                    model=self.clinic.agent_model or "claude-3-5-sonnet-20240620",
                    max_tokens=1024,
                    temperature=self.clinic.agent_temperature if self.clinic.agent_temperature is not None else 0.7,
                    system=system_prompt,
                    tools=self._get_tools(),
                    messages=messages
                )

            # Get final text response
            for block in response.content:
                if hasattr(block, 'text'):
                    final_response = block.text
                    break

            # Add assistant response to history
            self.conversation_service.add_message(conversation, 'assistant', final_response)

            return final_response

        except anthropic.APIError as e:
            logger.error('Claude API error: %s', str(e))
            return (
                "Desculpe, estou com dificuldades técnicas no momento. "
                "Por favor, tente novamente em alguns instantes."
            )
        except Exception as e:
            logger.error('Unexpected error in Claude service: %s', str(e))
            return (
                "Ocorreu um erro inesperado. "
                "Nossa equipe foi notificada e resolverá em breve."
            )
