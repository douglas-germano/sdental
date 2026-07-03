import logging
import json
from datetime import datetime
from typing import Optional
from zoneinfo import ZoneInfo

from flask import current_app
import anthropic

from app import db
from app.models import Conversation, Patient, ConversationStatus, Professional, PipelineStage, AppointmentStatus, Appointment
from app.services.appointment_service import AppointmentService
from app.services.conversation_service import ConversationService
from app.services.evolution_service import EvolutionService

logger = logging.getLogger(__name__)

WEEKDAY_NAMES = ['segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo']

SYSTEM_PROMPT_TEMPLATE = """{current_datetime}

Você é um assistente virtual de agendamento para a clínica {clinic_name}.

INFORMAÇÕES DA CLÍNICA:
- Serviços oferecidos: {services}
- Profissionais: {professionals}
- Horários de funcionamento: {business_hours}
- Duração padrão das consultas: 30 minutos
- Estágios do funil de pacientes (CRM): {pipeline_stages}

SUA FUNÇÃO:
1. Receber solicitações de agendamento de pacientes via WhatsApp
2. Verificar disponibilidade de horários (por profissional, se o paciente pedir)
3. Confirmar agendamentos com nome, telefone e horário escolhido
4. Listar, reagendar e cancelar agendamentos existentes
5. Confirmar presença quando o paciente responder a um lembrete
6. Atualizar dados de cadastro (email, endereço, observações) quando o paciente informar
7. Mover o paciente no funil (CRM) quando a conversa indicar uma mudança de interesse/estágio
8. Reenviar lembretes e enviar instruções de preparo quando solicitado
9. Transferir para atendimento humano quando necessário, sinalizando urgência em casos de emergência

DADOS DO PACIENTE:
- Se o paciente for NOVO (não aparecer nome no contexto), você DEVE coletar:
  * Nome completo
  * Email (opcional, mas recomendado)
  * Confirmar o número de telefone
- Faça isso de forma natural e educada ANTES de marcar a consulta
- Exemplo: "Para confirmar seu agendamento, preciso de algumas informações. Qual o seu nome completo?"
- Se o paciente mencionar naturalmente informações novas (email, endereço, alergias, observações), use a função update_patient_info para salvar - não precisa perguntar tudo de uma vez

EMERGÊNCIAS E URGÊNCIA:
- Se o paciente relatar dor intensa, sangramento, trauma dental, inchaço súbito ou outro sinal de emergência odontológica, use IMEDIATAMENTE a função transfer_to_human com urgent=true, mesmo no meio de outro fluxo
- Nesses casos, oriente o paciente a procurar atendimento de urgência caso a situação pareça grave, além de transferir a conversa

REGRAS IMPORTANTES:
- Sempre seja educado e profissional
- Colete nome completo antes de agendar (se não souber)
- Confirme todos os detalhes antes de finalizar agendamento
- Se não conseguir resolver, use a função transfer_to_human
- Horários devem estar dentro do funcionamento da clínica
- Não agende em horários já ocupados
- Sempre envie mensagem de confirmação após agendar
- Para remarcar uma consulta existente, use reschedule_appointment em vez de cancelar e criar uma nova
- Se o paciente disser algo como "sim, vou comparecer" em resposta a um lembrete, use confirm_appointment

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
                        },
                        "professional_name": {
                            "type": "string",
                            "description": "Nome do profissional preferido pelo paciente (opcional). Use apenas se o paciente pedir um profissional específico."
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
                        },
                        "professional_name": {
                            "type": "string",
                            "description": "Nome do profissional preferido pelo paciente (opcional)"
                        }
                    },
                    "required": ["patient_name", "datetime", "service"]
                }
            },
            {
                "name": "reschedule_appointment",
                "description": "Reagenda (remarca) um agendamento existente para uma nova data/hora, mantendo o mesmo paciente, serviço e profissional. Prefira esta função a cancelar e criar um novo agendamento.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "appointment_id": {
                            "type": "string",
                            "description": "ID do agendamento a ser remarcado"
                        },
                        "new_datetime": {
                            "type": "string",
                            "description": "Nova data e hora (formato: YYYY-MM-DDTHH:MM)"
                        }
                    },
                    "required": ["appointment_id", "new_datetime"]
                }
            },
            {
                "name": "confirm_appointment",
                "description": "Marca um agendamento como confirmado pelo próprio paciente. Use quando o paciente responder positivamente a um lembrete de consulta (ex: 'sim', 'vou comparecer', 'confirmado').",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "appointment_id": {
                            "type": "string",
                            "description": "ID do agendamento a confirmar. Se o paciente tiver apenas uma consulta futura, use o ID dela."
                        }
                    },
                    "required": ["appointment_id"]
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
                "name": "list_professionals",
                "description": "Lista os profissionais da clínica disponíveis para atendimento, com suas especialidades",
                "input_schema": {
                    "type": "object",
                    "properties": {},
                    "required": []
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
                "name": "update_patient_info",
                "description": "Atualiza dados de cadastro do paciente (email, endereço, observações) quando ele informar essas informações espontaneamente na conversa",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "email": {"type": "string", "description": "E-mail do paciente"},
                        "notes": {"type": "string", "description": "Observações relevantes (ex: alergias, preferências)"},
                        "address_zip_code": {"type": "string", "description": "CEP"},
                        "address_street": {"type": "string", "description": "Rua/logradouro"},
                        "address_number": {"type": "string", "description": "Número do endereço"},
                        "address_complement": {"type": "string", "description": "Complemento do endereço"},
                        "address_neighborhood": {"type": "string", "description": "Bairro"},
                        "address_city": {"type": "string", "description": "Cidade"},
                        "address_state": {"type": "string", "description": "UF (2 letras)"}
                    },
                    "required": []
                }
            },
            {
                "name": "update_pipeline_stage",
                "description": "Move o paciente para outro estágio do funil de CRM da clínica, de acordo com o andamento da conversa (ex: passou a demonstrar interesse real, virou paciente ativo)",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "stage_name": {
                            "type": "string",
                            "description": "Nome do estágio (deve ser um dos estágios listados nas informações da clínica)"
                        }
                    },
                    "required": ["stage_name"]
                }
            },
            {
                "name": "resend_reminder",
                "description": "Reenvia imediatamente um lembrete com os detalhes da próxima consulta do paciente, por exemplo quando ele pede para ser lembrado novamente",
                "input_schema": {
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            },
            {
                "name": "send_procedure_instructions",
                "description": "Envia as instruções de preparo/pós-procedimento cadastradas para um serviço específico, se houver",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "service": {
                            "type": "string",
                            "description": "Nome do serviço/procedimento"
                        }
                    },
                    "required": ["service"]
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
                        },
                        "urgent": {
                            "type": "boolean",
                            "description": "true se for uma emergência odontológica (dor intensa, sangramento, trauma, inchaço súbito) que precisa de atenção prioritária"
                        }
                    },
                    "required": ["reason"]
                }
            },
            {
                "name": "send_booking_link",
                "description": "Envia o link do calendário de agendamento online para o paciente agendar por conta própria. Use quando o paciente preferir escolher o horário sozinho ou quando houver muitas opções disponíveis.",
                "input_schema": {
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            }
        ]

    def _format_services(self) -> str:
        """Format clinic services for the prompt, including price and prep instructions when set."""
        services = self.clinic.services or []
        if not services:
            return "Consulta Geral (30 min)"
        parts = []
        for s in services:
            entry = f"{s.get('name')} ({s.get('duration', 30)} min"
            if s.get('price'):
                entry += f", R$ {s['price']}"
            entry += ")"
            parts.append(entry)
        return ", ".join(parts)

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

    def _format_professionals(self) -> str:
        """Format the clinic's active professionals for the prompt."""
        professionals = Professional.query.filter_by(
            clinic_id=self.clinic.id,
            active=True
        ).all()
        if not professionals:
            return "Nenhum profissional específico cadastrado (qualquer horário disponível serve)"
        return ", ".join([
            f"{p.name}" + (f" ({p.specialty})" if p.specialty else "")
            for p in professionals
        ])

    def _format_pipeline_stages(self) -> str:
        """Format the clinic's CRM pipeline stages for the prompt."""
        stages = PipelineStage.query.filter_by(clinic_id=self.clinic.id).order_by(PipelineStage.order).all()
        if not stages:
            return "Nenhum estágio configurado"
        return ", ".join([s.name for s in stages])

    def _find_service(self, service_name: Optional[str]) -> Optional[dict]:
        """Find a service config dict by name (case-insensitive)."""
        if not service_name:
            return None
        for s in (self.clinic.services or []):
            if s.get('name', '').strip().lower() == service_name.strip().lower():
                return s
        return None

    def _resolve_patient(self, conversation: Conversation) -> Optional[Patient]:
        """Find the patient linked to this conversation, by id or by phone number."""
        if conversation.patient_id:
            return Patient.query.get(conversation.patient_id)
        return Patient.query.filter_by(
            clinic_id=self.clinic.id,
            phone=conversation.phone_number
        ).first()

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

                professional_id = None
                professional_name = tool_input.get('professional_name')
                if professional_name:
                    professional = self.appointment_service.find_professional_by_name(professional_name)
                    if not professional:
                        return f"Não encontrei o profissional '{professional_name}'. Use list_professionals para ver os disponíveis."
                    professional_id = professional.id

                slots = self.appointment_service.get_available_slots(
                    date,
                    tool_input.get('service'),
                    professional_id=professional_id
                )
                if not slots:
                    return f"Não há horários disponíveis em {tool_input['date']}."

                weekday = WEEKDAY_NAMES[date.weekday()]

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
                    return f"A clínica não funciona às {WEEKDAY_NAMES[dt.weekday()]}s. Por favor, escolha outro dia."

                professional_id = None
                professional_name = tool_input.get('professional_name')
                if professional_name:
                    professional = self.appointment_service.find_professional_by_name(professional_name)
                    if not professional:
                        return f"Não encontrei o profissional '{professional_name}'. Use list_professionals para ver os disponíveis."
                    professional_id = professional.id

                appointment, error = self.appointment_service.create_appointment(
                    patient_name=tool_input['patient_name'],
                    patient_phone=conversation.phone_number,
                    scheduled_datetime=dt,
                    service_name=tool_input['service'],
                    professional_id=professional_id,
                    consent_source='whatsapp'
                )
                if error:
                    return f"Não foi possível agendar: {error}"

                # Link patient to conversation if not linked
                if not conversation.patient_id and appointment:
                    patient = Patient.query.get(appointment.patient_id)
                    self.conversation_service.link_patient(conversation, patient)

                weekday = WEEKDAY_NAMES[dt.weekday()]

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

        elif tool_name == "reschedule_appointment":
            try:
                new_dt = datetime.fromisoformat(tool_input['new_datetime'])

                now = datetime.now(ZoneInfo('America/Sao_Paulo'))
                if new_dt.replace(tzinfo=None) <= now.replace(tzinfo=None):
                    return "Não é possível remarcar para uma data/hora que já passou. Por favor, escolha um horário futuro."

                appointment, error = self.appointment_service.reschedule_appointment(
                    tool_input['appointment_id'],
                    new_dt
                )
                if error:
                    return f"Não foi possível remarcar: {error}"

                weekday = WEEKDAY_NAMES[new_dt.weekday()]
                return (
                    f"Agendamento remarcado com sucesso!\n"
                    f"Novo horário: {weekday}, {new_dt.strftime('%d/%m/%Y às %H:%M')}"
                )
            except Exception as e:
                logger.error('Error rescheduling appointment: %s', str(e))
                return f"Erro ao remarcar agendamento: {str(e)}"

        elif tool_name == "confirm_appointment":
            try:
                appointment = Appointment.query.filter_by(
                    id=tool_input['appointment_id'],
                    clinic_id=self.clinic.id
                ).first()
                if not appointment:
                    return "Agendamento não encontrado."
                if appointment.status == AppointmentStatus.CANCELLED:
                    return "Esse agendamento está cancelado e não pode ser confirmado."
                appointment.confirm_by_patient()
                db.session.commit()
                return "Presença confirmada, obrigado!"
            except Exception as e:
                logger.error('Error confirming appointment: %s', str(e))
                return f"Erro ao confirmar agendamento: {str(e)}"

        elif tool_name == "list_professionals":
            try:
                professionals = Professional.query.filter_by(
                    clinic_id=self.clinic.id,
                    active=True
                ).all()
                if not professionals:
                    return "Esta clínica não tem profissionais específicos cadastrados."
                lines = ["Profissionais disponíveis:"]
                for p in professionals:
                    line = f"- {p.name}"
                    if p.specialty:
                        line += f" ({p.specialty})"
                    lines.append(line)
                return "\n".join(lines)
            except Exception as e:
                logger.error('Error listing professionals: %s', str(e))
                return f"Erro ao listar profissionais: {str(e)}"

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

        elif tool_name == "update_patient_info":
            try:
                patient = self._resolve_patient(conversation)
                if not patient:
                    return "Ainda não temos um cadastro para este paciente. Colete o nome completo e crie um agendamento primeiro."

                updatable_fields = [
                    'email', 'notes', 'address_zip_code', 'address_street', 'address_number',
                    'address_complement', 'address_neighborhood', 'address_city', 'address_state'
                ]
                updated = []
                for field in updatable_fields:
                    if tool_input.get(field):
                        setattr(patient, field, tool_input[field])
                        updated.append(field)

                if not updated:
                    return "Nenhuma informação para atualizar foi fornecida."

                db.session.commit()
                return "Dados do paciente atualizados com sucesso."
            except Exception as e:
                logger.error('Error updating patient info: %s', str(e))
                return f"Erro ao atualizar dados do paciente: {str(e)}"

        elif tool_name == "update_pipeline_stage":
            try:
                patient = self._resolve_patient(conversation)
                if not patient:
                    return "Ainda não temos um cadastro para este paciente."

                stage_name = tool_input['stage_name']
                stage = PipelineStage.query.filter(
                    PipelineStage.clinic_id == self.clinic.id,
                    db.func.lower(PipelineStage.name) == stage_name.strip().lower()
                ).first()
                if not stage:
                    return f"Estágio '{stage_name}' não encontrado. Estágios disponíveis: {self._format_pipeline_stages()}"

                patient.pipeline_stage_id = stage.id
                db.session.commit()
                return f"Paciente movido para o estágio '{stage.name}'."
            except Exception as e:
                logger.error('Error updating pipeline stage: %s', str(e))
                return f"Erro ao mover estágio: {str(e)}"

        elif tool_name == "resend_reminder":
            try:
                appointments = self.appointment_service.get_patient_appointments(conversation.phone_number)
                if not appointments:
                    return "Não há consultas futuras para lembrar."

                appointment = appointments[0]
                patient = appointment.patient
                weekday = WEEKDAY_NAMES[appointment.scheduled_datetime.weekday()]
                message = (
                    f"Olá {patient.name.split()[0]}! 👋\n\n"
                    f"Passando para lembrar da sua consulta:\n\n"
                    f"📅 Data: {weekday}, {appointment.scheduled_datetime.strftime('%d/%m/%Y')}\n"
                    f"⏰ Horário: {appointment.scheduled_datetime.strftime('%H:%M')}\n"
                    f"🏥 Serviço: {appointment.service_name}\n\n"
                    f"Até lá! 😊"
                )
                result = EvolutionService(self.clinic).send_message(patient.phone, message)
                if 'error' in result:
                    return f"Não foi possível reenviar o lembrete: {result['error']}"
                return "Lembrete reenviado com sucesso."
            except Exception as e:
                logger.error('Error resending reminder: %s', str(e))
                return f"Erro ao reenviar lembrete: {str(e)}"

        elif tool_name == "send_procedure_instructions":
            try:
                service = self._find_service(tool_input.get('service'))
                if not service or not service.get('instructions'):
                    return "Não há instruções cadastradas para este serviço."

                patient = self._resolve_patient(conversation)
                patient_first_name = patient.name.split()[0] if patient else ''
                message = (
                    f"Olá{' ' + patient_first_name if patient_first_name else ''}! 👋\n\n"
                    f"Instruções para *{service.get('name')}*:\n\n"
                    f"{service['instructions']}"
                )
                result = EvolutionService(self.clinic).send_message(conversation.phone_number, message)
                if 'error' in result:
                    return f"Não foi possível enviar as instruções: {result['error']}"
                return "Instruções enviadas com sucesso."
            except Exception as e:
                logger.error('Error sending procedure instructions: %s', str(e))
                return f"Erro ao enviar instruções: {str(e)}"

        elif tool_name == "get_current_datetime":
            try:
                now = datetime.now(ZoneInfo('America/Sao_Paulo'))
                month_names = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
                weekday = WEEKDAY_NAMES[now.weekday()]
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
                    tool_input.get('reason', 'Solicitação do paciente'),
                    urgent=bool(tool_input.get('urgent', False))
                )
                return "Conversa transferida para atendimento humano."
            except Exception as e:
                logger.error('Error transferring to human: %s', str(e))
                return f"Erro ao transferir: {str(e)}"

        elif tool_name == "send_booking_link":
            try:
                base_url = current_app.config.get('BASE_URL', 'https://sdental.onrender.com')
                slug = self.clinic.slug
                if not slug:
                    return "O agendamento online não está configurado para esta clínica."
                booking_url = f"{base_url}/agendar/{slug}"
                return f"Link de agendamento: {booking_url}"
            except Exception as e:
                logger.error('Error generating booking link: %s', str(e))
                return f"Erro ao gerar link: {str(e)}"

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
                    professionals=self._format_professionals(),
                    pipeline_stages=self._format_pipeline_stages(),
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
                professionals=self._format_professionals(),
                pipeline_stages=self._format_pipeline_stages(),
                business_hours=self._format_business_hours(),
                context_info=f"CONTEXTO DO PACIENTE:\n{context_info}" if context_info else ""
            )

        # Get message history
        messages = self.conversation_service.get_message_history_for_claude(conversation)

        try:
            # Call Claude API
            response = self.client.messages.create(
                model=current_app.config.get('CLAUDE_MODEL', 'claude-sonnet-4-20250514'),
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
                    model=current_app.config.get('CLAUDE_MODEL', 'claude-sonnet-4-20250514'),
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
