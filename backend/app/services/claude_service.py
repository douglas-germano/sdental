import logging
import json
from datetime import datetime
from typing import Optional

from flask import current_app
import openai

from app.utils.datetime_utils import local_now
from app import db
from app.models import Conversation, Patient, ConversationStatus, Professional, PipelineStage, AppointmentStatus, Appointment, AiUsageService
from app.services.appointment_service import AppointmentService
from app.services.conversation_service import ConversationService
from app.services.evolution_service import EvolutionService
from app.utils.business_hours import parse_time
from app.utils.cache import cache
from app.utils.ai_usage import record_ai_usage, USAGE_INCLUDE_COST

logger = logging.getLogger(__name__)

WEEKDAY_NAMES = ['segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo']

# Max rounds of tool-calls the agent loop will follow before giving up and
# handing off to a human, so a model stuck repeatedly calling tools can't
# loop (and burn tokens) indefinitely.
MAX_TOOL_ROUNDS = 6


@cache.memoize(timeout=60)
def _cached_active_professionals_text(clinic_id: str) -> str:
    """Module-level (not a method) so the cache key is keyed purely by
    clinic_id, not by the ClaudeService instance - a new instance is created
    per request, so keying on `self` would defeat the cache entirely."""
    professionals = Professional.query.filter_by(clinic_id=clinic_id, active=True).all()
    if not professionals:
        return "Nenhum profissional específico cadastrado (qualquer horário disponível serve)"
    return ", ".join([
        f"{p.name}" + (f" ({p.specialty})" if p.specialty else "")
        for p in professionals
    ])


@cache.memoize(timeout=60)
def _cached_pipeline_stages_text(clinic_id: str) -> str:
    stages = PipelineStage.query.filter_by(clinic_id=clinic_id).order_by(PipelineStage.order).all()
    if not stages:
        return "Nenhum estágio configurado"
    return ", ".join([s.name for s in stages])


# Static instructions block - identical for every message of every
# conversation for a given clinic (until the clinic edits its config), so
# it's sent as a separate, cache_control-marked content block in
# process_message() and gets billed at the (much cheaper) cached-read rate
# on OpenRouter/Anthropic instead of full price on every single turn.
SYSTEM_PROMPT_STATIC_TEMPLATE = """Você é um assistente virtual de agendamento para a clínica {clinic_name}.

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

EMERGÊNCIAS E URGÊNCIA (TRIAGEM):
- Se o paciente relatar dor, sangramento, trauma dental, inchaço súbito ou outro sinal de emergência odontológica, faça uma TRIAGEM RÁPIDA antes de transferir, com no máximo 1-2 perguntas objetivas:
  * Intensidade da dor de 0 a 10
  * Há quanto tempo começou
  * Sintomas principais (ex: inchaço, sangramento, febre, trauma)
- Depois use transfer_to_human com urgent=true, preenchendo os campos pain_level e symptoms com o que o paciente relatou, para a recepção já receber a conversa priorizada e com o quadro resumido
- Se o quadro parecer grave (dor 8+, sangramento intenso, trauma, dificuldade de respirar/engolir), oriente o paciente a procurar um pronto-socorro imediatamente, além de transferir
- Não faça a triagem virar interrogatório: se o paciente já deu as informações, transfira direto

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
"""

SCOPE_GUARDRAIL_TEMPLATE = """

LIMITES DE ESCOPO (sempre válido, mesmo que instruções acima digam outra coisa):
- Os únicos serviços que esta clínica realmente oferece são: {services}
- Você só pode falar sobre esses serviços. Nunca invente, estime ou descreva preço, duração,
  disponibilidade ou qualquer detalhe de um procedimento que não esteja nessa lista.
- Se o paciente perguntar sobre um procedimento que não está na lista, diga claramente que a
  clínica não tem esse procedimento cadastrado no momento. Ofereça transferir para um atendente
  humano confirmar, ou apresente os serviços que a clínica realmente oferece.
- Não dê diagnósticos, indicações de tratamento nem explicações clínicas/médicas gerais (o que é,
  para que serve, riscos, contraindicações) - isso é responsabilidade do profissional da clínica,
  não sua. Seu papel é agendamento e informações operacionais dos serviços já cadastrados.
"""


class ClaudeService:
    """Service for processing messages with Claude AI."""

    def __init__(self, clinic):
        self.clinic = clinic
        api_key = clinic.openrouter_api_key or current_app.config.get('OPENROUTER_API_KEY')
        if not api_key:
            raise ValueError('OpenRouter API key not configured')
        self.client = openai.OpenAI(
            api_key=api_key,
            base_url=current_app.config.get('OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1'),
        )
        self.appointment_service = AppointmentService(clinic)
        self.conversation_service = ConversationService(clinic)

    @staticmethod
    def _to_openai_tools(tools: list) -> list:
        """Convert Anthropic-style tool defs ({name, description, input_schema}) to
        the OpenAI-compatible function-calling shape OpenRouter expects."""
        return [
            {
                "type": "function",
                "function": {
                    "name": t["name"],
                    "description": t["description"],
                    "parameters": t["input_schema"],
                },
            }
            for t in tools
        ]

    @staticmethod
    def _first_choice(response):
        """
        Return response.choices[0], raising a clear, loggable error instead of
        a bare "'NoneType' object is not subscriptable" when there isn't one.

        Some OpenRouter providers (seen with free-tier/rate-limited models)
        respond HTTP 200 with an error embedded in the body instead of raising
        an HTTP error, which leaves `choices` empty/None on the parsed
        response - this surfaces what actually happened upstream.
        """
        if not response.choices:
            raise RuntimeError(
                f"OpenRouter response had no choices (model likely rate-limited "
                f"or unavailable). Raw response: {response.model_dump_json()[:500]}"
            )
        return response.choices[0]

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
                        },
                        "pain_level": {
                            "type": "integer",
                            "description": "Em emergências, intensidade da dor relatada pelo paciente de 0 a 10, se informada"
                        },
                        "symptoms": {
                            "type": "string",
                            "description": "Em emergências, resumo curto dos sintomas relatados (ex: 'inchaço na gengiva há 2 dias, dor 8, sem febre')"
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
                entry = f"{day}: {config.get('start', '08:00')} - {config.get('end', '18:00')}"
                if config.get('break_start') and config.get('break_end'):
                    entry += f" (pausa para almoço {config['break_start']}-{config['break_end']})"
                parts.append(entry)
        return ", ".join(parts) if parts else "Segunda a Sexta: 08:00 - 18:00"

    def _format_professionals(self) -> str:
        """Format the clinic's active professionals for the prompt (60s cache - see module-level helper)."""
        return _cached_active_professionals_text(str(self.clinic.id))

    def _format_pipeline_stages(self) -> str:
        """Format the clinic's CRM pipeline stages for the prompt (60s cache - see module-level helper)."""
        return _cached_pipeline_stages_text(str(self.clinic.id))

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
            return Patient.query.filter_by(
                id=conversation.patient_id,
                clinic_id=self.clinic.id
            ).filter(Patient.deleted_at.is_(None)).first()
        return Patient.query.filter_by(
            clinic_id=self.clinic.id,
            phone=conversation.phone_number
        ).filter(Patient.deleted_at.is_(None)).first()

    # Maps each tool name to its handler and the Portuguese action phrase
    # used to compose "Erro ao <phrase>: <exception>" on failure.
    _TOOL_HANDLERS = {
        "check_availability": ("_tool_check_availability", "verificar disponibilidade"),
        "create_appointment": ("_tool_create_appointment", "criar agendamento"),
        "reschedule_appointment": ("_tool_reschedule_appointment", "remarcar agendamento"),
        "confirm_appointment": ("_tool_confirm_appointment", "confirmar agendamento"),
        "list_professionals": ("_tool_list_professionals", "listar profissionais"),
        "list_appointments": ("_tool_list_appointments", "listar agendamentos"),
        "cancel_appointment": ("_tool_cancel_appointment", "cancelar agendamento"),
        "update_patient_info": ("_tool_update_patient_info", "atualizar dados do paciente"),
        "update_pipeline_stage": ("_tool_update_pipeline_stage", "mover estágio"),
        "resend_reminder": ("_tool_resend_reminder", "reenviar lembrete"),
        "send_procedure_instructions": ("_tool_send_procedure_instructions", "enviar instruções"),
        "get_current_datetime": ("_tool_get_current_datetime", "obter data/hora"),
        "transfer_to_human": ("_tool_transfer_to_human", "transferir"),
        "send_booking_link": ("_tool_send_booking_link", "gerar link"),
    }

    def _execute_tool(
        self,
        tool_name: str,
        tool_input: dict,
        conversation: Conversation
    ) -> str:
        """Execute a tool and return the result."""
        logger.info('Executing tool: %s with input: %s', tool_name, tool_input)

        handler_entry = self._TOOL_HANDLERS.get(tool_name)
        if not handler_entry:
            return "Ferramenta não reconhecida."

        handler_name, action_phrase = handler_entry
        try:
            return getattr(self, handler_name)(tool_input, conversation)
        except Exception as e:
            logger.error('Error executing tool %s: %s', tool_name, str(e))
            return f"Erro ao {action_phrase}: {str(e)}"

    def _tool_check_availability(self, tool_input: dict, conversation: Conversation) -> str:
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

    def _tool_create_appointment(self, tool_input: dict, conversation: Conversation) -> str:
        dt = datetime.fromisoformat(tool_input['datetime'])

        # Validate date is in the future
        now = local_now()
        if dt.replace(tzinfo=None) <= now:
            return "Não é possível agendar para uma data/hora que já passou. Por favor, escolha um horário futuro."

        # Validate it's a business day
        day_config = (self.clinic.business_hours or {}).get(str(dt.weekday()), {})
        if not day_config.get('active', False):
            return f"A clínica não funciona às {WEEKDAY_NAMES[dt.weekday()]}s. Por favor, escolha outro dia."

        # Give a friendlier error when the requested time falls inside the
        # lunch break, instead of the generic "Horário não disponível" from
        # the deeper slot-availability check.
        break_start = day_config.get('break_start')
        break_end = day_config.get('break_end')
        if break_start and break_end:
            try:
                if parse_time(break_start) <= dt.time() < parse_time(break_end):
                    return (
                        f"A clínica fecha para almoço das {break_start} às {break_end}. "
                        f"Por favor, escolha outro horário."
                    )
            except (ValueError, AttributeError):
                pass

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
            patient = Patient.query.filter_by(
                id=appointment.patient_id,
                clinic_id=self.clinic.id
            ).first()
            self.conversation_service.link_patient(conversation, patient)

        weekday = WEEKDAY_NAMES[dt.weekday()]

        return (
            f"Agendamento confirmado!\n"
            f"Paciente: {tool_input['patient_name']}\n"
            f"Serviço: {tool_input['service']}\n"
            f"Data/Hora: {weekday}, {dt.strftime('%d/%m/%Y às %H:%M')}\n"
            f"ID: {appointment.id}"
        )

    def _tool_reschedule_appointment(self, tool_input: dict, conversation: Conversation) -> str:
        new_dt = datetime.fromisoformat(tool_input['new_datetime'])

        now = local_now()
        if new_dt.replace(tzinfo=None) <= now:
            return "Não é possível remarcar para uma data/hora que já passou. Por favor, escolha um horário futuro."

        patient = self._resolve_patient(conversation)
        if not patient:
            return "Não encontrei um agendamento seu para remarcar."

        appointment, error = self.appointment_service.reschedule_appointment(
            tool_input['appointment_id'],
            new_dt,
            patient_id=patient.id
        )
        if error:
            return f"Não foi possível remarcar: {error}"

        weekday = WEEKDAY_NAMES[new_dt.weekday()]
        return (
            f"Agendamento remarcado com sucesso!\n"
            f"Novo horário: {weekday}, {new_dt.strftime('%d/%m/%Y às %H:%M')}"
        )

    def _tool_confirm_appointment(self, tool_input: dict, conversation: Conversation) -> str:
        patient = self._resolve_patient(conversation)
        if not patient:
            return "Não encontrei um agendamento seu para confirmar."

        appointment = Appointment.query.filter_by(
            id=tool_input['appointment_id'],
            clinic_id=self.clinic.id,
            patient_id=patient.id
        ).first()
        if not appointment:
            return "Agendamento não encontrado."
        if appointment.status == AppointmentStatus.CANCELLED:
            return "Esse agendamento está cancelado e não pode ser confirmado."
        appointment.confirm_by_patient()
        db.session.commit()
        return "Presença confirmada, obrigado!"

    def _tool_list_professionals(self, tool_input: dict, conversation: Conversation) -> str:
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

    def _tool_list_appointments(self, tool_input: dict, conversation: Conversation) -> str:
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

    def _tool_cancel_appointment(self, tool_input: dict, conversation: Conversation) -> str:
        patient = self._resolve_patient(conversation)
        if not patient:
            return "Não encontrei um agendamento seu para cancelar."

        success, error = self.appointment_service.cancel_appointment(
            tool_input['appointment_id'],
            patient_id=patient.id
        )
        if not success:
            return f"Não foi possível cancelar: {error}"
        return "Agendamento cancelado com sucesso."

    def _tool_update_patient_info(self, tool_input: dict, conversation: Conversation) -> str:
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

    def _tool_update_pipeline_stage(self, tool_input: dict, conversation: Conversation) -> str:
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

    def _tool_resend_reminder(self, tool_input: dict, conversation: Conversation) -> str:
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

    def _tool_send_procedure_instructions(self, tool_input: dict, conversation: Conversation) -> str:
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

    def _tool_get_current_datetime(self, tool_input: dict, conversation: Conversation) -> str:
        now = local_now()
        month_names = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
        weekday = WEEKDAY_NAMES[now.weekday()]
        month = month_names[now.month - 1]

        return (
            f"Data e hora atual:\n"
            f"{weekday}, {now.day} de {month} de {now.year}\n"
            f"Horário: {now.strftime('%H:%M')} (Horário de Brasília)"
        )

    def _tool_transfer_to_human(self, tool_input: dict, conversation: Conversation) -> str:
        reason = tool_input.get('reason', 'Solicitação do paciente')
        urgent = bool(tool_input.get('urgent', False))

        # For emergencies, prepend the structured triage to the reason so
        # reception sees the clinical picture at a glance.
        pain_level = tool_input.get('pain_level')
        symptoms = tool_input.get('symptoms')
        if urgent and (pain_level is not None or symptoms):
            triage_parts = []
            if pain_level is not None:
                triage_parts.append(f"dor {pain_level}/10")
            if symptoms:
                triage_parts.append(symptoms)
            reason = f"[TRIAGEM] {' - '.join(triage_parts)} | {reason}"

        # Generate an AI summary so the human agent doesn't have to read
        # the whole thread (best-effort; never blocks the transfer).
        summary = None
        try:
            summary = self.summarize_conversation_for_handoff(conversation)
        except Exception:
            logger.exception('Failed to generate handoff summary')

        transfer = self.conversation_service.transfer_to_human(
            conversation, reason, urgent=urgent
        )
        if summary and transfer is not None:
            transfer.summary = summary
            db.session.commit()
        return "Conversa transferida para atendimento humano."

    def _tool_send_booking_link(self, tool_input: dict, conversation: Conversation) -> str:
        base_url = current_app.config.get('BASE_URL', 'https://sdental.onrender.com')
        slug = self.clinic.slug
        if not slug:
            return "O agendamento online não está configurado para esta clínica."
        booking_url = f"{base_url}/agendar/{slug}"
        return f"Link de agendamento: {booking_url}"

    # ------------------------------------------------------------------ #
    # Autonomous / proactive capabilities                                #
    # These do NOT use tools: they only compose text. Any action that    #
    # changes data (booking, rescheduling) still happens through the     #
    # normal reactive flow when the patient replies - keeping the agent  #
    # from taking irreversible actions on its own initiative.            #
    # ------------------------------------------------------------------ #

    def _complete(self, system: str, user: str, max_tokens: int = 600,
                  temperature: Optional[float] = None, model: Optional[str] = None,
                  task: str = 'complete') -> str:
        """
        Single-shot completion returning plain text (no tools).

        `model` lets simple, non-patient-facing tasks (classification,
        internal summaries) opt into the cheaper OPENROUTER_MODEL_LIGHT tier
        instead of the default full-quality conversational model.
        """
        if temperature is None:
            temperature = self.clinic.agent_temperature if self.clinic.agent_temperature is not None else 0.7
        resolved_model = model or current_app.config.get('OPENROUTER_MODEL', 'anthropic/claude-sonnet-4.5')
        response = self.client.chat.completions.create(
            model=resolved_model,
            max_tokens=max_tokens,
            temperature=temperature,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            extra_body={"usage": USAGE_INCLUDE_COST},
        )
        record_ai_usage(self.clinic.id, AiUsageService.AUTOMATION, task, resolved_model, response)
        return (self._first_choice(response).message.content or "").strip()

    def _clinic_context_block(self) -> str:
        """Short clinic description reused across proactive prompts."""
        return (
            f"Clínica: {self.clinic.name}\n"
            f"Serviços: {self._format_services()}\n"
            f"Profissionais: {self._format_professionals()}\n"
            f"Horários: {self._format_business_hours()}"
        )

    def generate_proactive_message(
        self,
        objective: str,
        patient_first_name: Optional[str] = None,
        extra_context: Optional[str] = None,
    ) -> str:
        """
        Compose a WhatsApp opening message the clinic sends on its OWN
        initiative (no-show recovery, recall, waitlist offer...). The message
        must feel human, be short, and invite a reply - the actual booking
        happens reactively when the patient answers.
        """
        system = (
            "Você é o assistente de uma clínica odontológica escrevendo uma mensagem "
            "de WhatsApp para INICIAR uma conversa com um paciente (mensagem proativa). "
            "Regras:\n"
            "- Seja caloroso, humano e MUITO conciso (2 a 4 linhas).\n"
            "- Escreva em português do Brasil, tom informal e respeitoso.\n"
            "- Não use markdown. Emojis com moderação (no máximo 1).\n"
            "- Faça uma única pergunta clara que convide o paciente a responder.\n"
            "- Nunca invente horários, preços ou dados que não foram fornecidos.\n"
            "- Não se apresente como robô nem diga que é uma IA.\n\n"
            f"{self._clinic_context_block()}"
        )
        greeting = f"O primeiro nome do paciente é {patient_first_name}. " if patient_first_name else ""
        user = (
            f"{greeting}Objetivo desta mensagem: {objective}."
            + (f"\n\nContexto adicional: {extra_context}" if extra_context else "")
            + "\n\nEscreva APENAS o texto da mensagem, pronto para enviar."
        )
        return self._complete(system, user, max_tokens=400, task='generate_proactive_message')

    def summarize_conversation_for_handoff(self, conversation: Conversation) -> str:
        """Summarize the conversation so a human taking over is instantly up to speed."""
        history = self.conversation_service.get_message_history_for_claude(conversation, max_messages=40)
        if not history:
            return ""
        transcript = "\n".join(
            f"{'Paciente' if m['role'] == 'user' else 'Assistente'}: {m['content']}"
            for m in history
        )
        system = (
            "Você resume conversas de atendimento de uma clínica para que um "
            "atendente humano assuma sem precisar ler tudo. Produza um resumo "
            "telegráfico em português do Brasil, com no máximo 4 tópicos curtos, "
            "cobrindo: o que o paciente quer, informações já coletadas, pendências "
            "e nível de urgência. Não invente nada."
        )
        user = f"Transcrição:\n{transcript}\n\nResuma para o atendente."
        # Internal-only summary (a human reads it, not the patient) - light model is plenty.
        light_model = current_app.config.get('OPENROUTER_MODEL_LIGHT')
        return self._complete(
            system, user, max_tokens=350, temperature=0.3,
            model=light_model, task='summarize_conversation_for_handoff'
        )

    def classify_conversation_funnel(self, conversation: Conversation, stage_names: list) -> Optional[dict]:
        """
        Classify a conversation into one of the clinic's CRM stages and produce
        a short note. Returns {'stage_name': str, 'note': str} or None.
        """
        history = self.conversation_service.get_message_history_for_claude(conversation, max_messages=30)
        if not history:
            return None
        transcript = "\n".join(
            f"{'Paciente' if m['role'] == 'user' else 'Assistente'}: {m['content']}"
            for m in history
        )
        system = (
            "Você classifica leads de uma clínica odontológica no funil de CRM. "
            "Responda SOMENTE com um JSON válido no formato "
            '{"stage_name": "<um dos estágios>", "note": "<observação curta, máx 120 caracteres>"}. '
            f"Estágios permitidos (use exatamente um destes nomes): {', '.join(stage_names)}. "
            "A 'note' deve resumir o interesse/temperatura do lead. "
            "Se não houver sinal suficiente, use o primeiro estágio da lista."
        )
        user = f"Conversa:\n{transcript}"
        # Trivial classification task (short JSON output) - light model is plenty.
        light_model = current_app.config.get('OPENROUTER_MODEL_LIGHT')
        raw = self._complete(
            system, user, max_tokens=200, temperature=0.2,
            model=light_model, task='classify_conversation_funnel'
        )
        try:
            start = raw.index('{')
            end = raw.rindex('}') + 1
            data = json.loads(raw[start:end])
            if data.get('stage_name'):
                return {'stage_name': data['stage_name'], 'note': (data.get('note') or '')[:120]}
        except (ValueError, KeyError, json.JSONDecodeError):
            logger.warning('Could not parse funnel classification: %s', raw[:120])
        return None

    def answer_business_question(self, question: str, metrics: dict) -> str:
        """Answer a clinic owner's natural-language question about their own metrics."""
        system = (
            "Você é um analista de dados da clínica odontológica. Responda à pergunta "
            "do gestor em português do Brasil, de forma direta e objetiva, usando SOMENTE "
            "os dados fornecidos. Se algo não estiver nos dados, diga que não tem essa "
            "informação. Traga números concretos e, quando fizer sentido, 1 recomendação prática. "
            "Não use markdown pesado; pode usar listas simples."
        )
        user = (
            f"Dados da clínica (JSON):\n{json.dumps(metrics, ensure_ascii=False, default=str)}\n\n"
            f"Pergunta do gestor: {question}"
        )
        return self._complete(system, user, max_tokens=700, temperature=0.4, task='answer_business_question')

    def generate_report_digest(self, metrics: dict) -> str:
        """Compose a short proactive weekly performance digest for the clinic owner."""
        system = (
            "Você escreve um resumo semanal de desempenho para o dono de uma clínica "
            "odontológica, enviado por WhatsApp. Seja conciso e útil: destaque os números "
            "que importam, uma tendência e uma sugestão prática. Português do Brasil, "
            "tom profissional e amigável, sem markdown pesado, no máximo 8 linhas."
        )
        user = f"Métricas da semana (JSON):\n{json.dumps(metrics, ensure_ascii=False, default=str)}\n\nEscreva o resumo."
        return self._complete(system, user, max_tokens=500, temperature=0.5, task='generate_report_digest')

    # How many stored messages go verbatim to the model; older ones are
    # folded into the rolling summary below.
    HISTORY_WINDOW = 30

    def _maybe_update_rolling_summary(self, conversation: Conversation) -> None:
        """
        Keep a persistent summary of everything older than HISTORY_WINDOW in
        conversation.context, so the bot doesn't forget what was agreed 30+
        messages ago. Best-effort: any failure just means the summary lags.
        """
        try:
            messages = conversation.messages or []
            cut = len(messages) - self.HISTORY_WINDOW
            context = conversation.context or {}
            if cut <= 0 or context.get('summary_upto', 0) >= cut:
                return

            older = [
                m for m in messages[:cut]
                if m.get('content') and m.get('role') in ('user', 'assistant')
            ]
            if not older:
                return

            transcript = "\n".join(
                f"{'Paciente' if m['role'] == 'user' else 'Assistente'}: {m['content']}"
                for m in older[-80:]
            )
            previous = context.get('summary')
            if previous:
                transcript = f"Resumo anterior:\n{previous}\n\nMensagens seguintes:\n{transcript}"

            system = (
                "Você mantém a memória de longo prazo de uma conversa de WhatsApp "
                "entre um paciente e a assistente de uma clínica. Resuma em até 8 "
                "linhas, em português do Brasil, apenas fatos úteis para continuar o "
                "atendimento: nome e dados do paciente, o que ele quer, o que já foi "
                "combinado ou agendado, preferências e pendências. Não invente nada."
            )
            summary = self._complete(
                system, transcript, max_tokens=350, temperature=0.2,
                model=current_app.config.get('OPENROUTER_MODEL_LIGHT'),
                task='rolling_summary'
            )
            if summary:
                self.conversation_service.update_context(conversation, {
                    'summary': summary.strip(),
                    'summary_upto': cut,
                })
        except Exception as e:
            logger.warning('Rolling summary update failed (non-fatal): %s', e)

    def transcribe_audio(self, base64_data: str, mimetype: str = None) -> Optional[str]:
        """
        Transcribe a patient voice note so the bot can keep handling the
        conversation instead of handing every audio off to a human.

        Uses an audio-capable multimodal model through OpenRouter
        (AUDIO_TRANSCRIPTION_MODEL). Returns the transcript, or None on any
        failure - callers fall back to the human-handoff path.
        """
        if not base64_data:
            return None
        try:
            audio_format = 'ogg'
            if mimetype and '/' in mimetype:
                audio_format = mimetype.split('/')[-1].split(';')[0].strip() or 'ogg'

            model = current_app.config.get('AUDIO_TRANSCRIPTION_MODEL')
            response = self.client.chat.completions.create(
                model=model,
                max_tokens=800,
                temperature=0,
                messages=[{
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": (
                                "Transcreva este áudio em português do Brasil. "
                                "Responda somente com a transcrição literal, sem comentários."
                            ),
                        },
                        {
                            "type": "input_audio",
                            "input_audio": {"data": base64_data, "format": audio_format},
                        },
                    ],
                }],
                extra_body={"usage": USAGE_INCLUDE_COST},
            )
            record_ai_usage(self.clinic.id, AiUsageService.WHATSAPP, 'transcribe_audio', model, response)
            text = (self._first_choice(response).message.content or '').strip()
            return text or None
        except Exception as e:
            logger.warning('Audio transcription failed (falling back to human handoff): %s', e)
            return None

    def process_message(
        self,
        conversation: Conversation,
        new_message: str = None,
        store_user_message: bool = True
    ) -> str:
        """
        Generate the AI reply for the conversation's current state.

        Args:
            conversation: The conversation context
            new_message: The new user message. Required when
                store_user_message is True (test-chat/preview flows); the
                webhook pipeline stores messages up front and passes
                store_user_message=False, in which case the reply is built
                purely from the stored history (which lets one reply cover a
                whole burst of aggregated messages).

        Returns:
            Response message to send back
        """
        # Check if conversation is transferred to human
        if conversation.status == ConversationStatus.TRANSFERRED_TO_HUMAN:
            return (
                "Sua conversa está sendo atendida por um de nossos colaboradores. "
                "Por favor, aguarde."
            )

        if store_user_message:
            if not new_message:
                raise ValueError('new_message is required when store_user_message=True')
            self.conversation_service.add_message(conversation, 'user', new_message)

        # Keep long conversations coherent: fold everything older than the
        # history window into a rolling summary stored on the conversation.
        self._maybe_update_rolling_summary(conversation)

        # Build system prompt
        context_info = self.conversation_service.get_context_summary(conversation)
        
        # Add custom advisor context if available. This is free text the
        # clinic owner writes/edits by hand, so it can go stale (e.g. still
        # mentioning old business hours after Configurações is updated) -
        # the instruction below makes the always-fresh structured fields
        # above (horários, serviços) win over anything conflicting here.
        if self.clinic.agent_context:
            context_info = (
                f"{context_info}\n\nINFORMAÇÕES ADICIONAIS (este texto é editado manualmente e pode "
                f"estar desatualizado quanto a horários e serviços - em caso de conflito, confie sempre "
                f"nos horários de funcionamento e serviços informados na seção INFORMAÇÕES DA CLÍNICA acima):"
                f"\n{self.clinic.agent_context}"
            )
        
        # Get current datetime in Brazil timezone
        now = local_now()
        weekday_names = ['segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo']
        weekday = weekday_names[now.weekday()]
        current_datetime_str = f"CONTEXTO TEMPORAL:\nHOJE É: {weekday}, {now.strftime('%d de %B de %Y')} às {now.strftime('%H:%M')} (Horário de Brasília)"
            
        context_block = f"CONTEXTO DO PACIENTE:\n{context_info}" if context_info else ""

        # Determine strictness of system prompt
        if self.clinic.agent_system_prompt:
            # If user provided a custom prompt, use it.
            # We try to format it with available variables if they are present in the text.
            # A fully custom prompt bakes the ever-changing current_datetime/context_info
            # into the text itself, so it's sent as a plain (uncached) string - splitting
            # it into a stable cacheable prefix isn't safe to do generically here.
            try:
                # Check what keys are in the custom prompt
                system_prompt = self.clinic.agent_system_prompt.format(
                    current_datetime=current_datetime_str,
                    clinic_name=self.clinic.name,
                    services=self._format_services(),
                    professionals=self._format_professionals(),
                    pipeline_stages=self._format_pipeline_stages(),
                    business_hours=self._format_business_hours(),
                    context_info=context_block
                )
            except KeyError:
                # If custom prompt doesn't have matching keys, just use it as is (or append context manually)
                # But to be safe and ensure context is passed, we might append it if missing
                system_prompt = self.clinic.agent_system_prompt
                if "{context_info}" not in self.clinic.agent_system_prompt and context_info:
                     system_prompt += f"\n\nCONTEXTO DO PACIENTE:\n{context_info}"
        else:
            # Default template: split into a static, cache_control-marked block
            # (identical across every message for this clinic until its config
            # changes - billed at the cheap cached-read rate after the first
            # hit) and a dynamic suffix (today's date/time + this patient's
            # context, which change on every single message and so are never
            # cached).
            static_block = SYSTEM_PROMPT_STATIC_TEMPLATE.format(
                clinic_name=self.clinic.name,
                services=self._format_services(),
                professionals=self._format_professionals(),
                pipeline_stages=self._format_pipeline_stages(),
                business_hours=self._format_business_hours(),
            )
            dynamic_suffix = f"{current_datetime_str}\n\n{context_block}"
            system_prompt = [
                {"type": "text", "text": static_block, "cache_control": {"type": "ephemeral"}},
                {"type": "text", "text": dynamic_suffix},
            ]

        # Always enforce the service scope guardrail, even when the clinic
        # customized agent_system_prompt - prevents the agent from answering
        # about procedures the clinic doesn't actually offer using its own
        # general training knowledge instead of the clinic's real service list.
        guardrail_text = SCOPE_GUARDRAIL_TEMPLATE.format(services=self._format_services())
        if isinstance(system_prompt, list):
            # Default-template path: system_prompt is [static cached block,
            # dynamic uncached block] - append to the last (uncached) block
            # so the guardrail keeps landing at the very end of the prompt.
            system_prompt[-1]["text"] += guardrail_text
        else:
            system_prompt += guardrail_text

        # Get message history
        history = self.conversation_service.get_message_history_for_claude(conversation)
        api_messages = [{"role": "system", "content": system_prompt}] + history

        model = current_app.config.get('OPENROUTER_MODEL', 'anthropic/claude-sonnet-4.5')
        temperature = self.clinic.agent_temperature if self.clinic.agent_temperature is not None else 0.7
        tools = self._to_openai_tools(self._get_tools())
        if tools:
            # Cache the (large, otherwise-identical-every-call) tool schema block too.
            tools[-1] = {**tools[-1], "cache_control": {"type": "ephemeral"}}

        try:
            # Call OpenRouter
            response = self.client.chat.completions.create(
                model=model,
                max_tokens=1024,
                temperature=temperature,
                tools=tools,
                messages=api_messages,
                extra_body={"usage": USAGE_INCLUDE_COST},
            )
            record_ai_usage(self.clinic.id, AiUsageService.WHATSAPP, 'process_message', model, response)

            choice = self._first_choice(response)
            rounds = 0
            while choice.finish_reason == "tool_calls":
                rounds += 1
                if rounds > MAX_TOOL_ROUNDS:
                    logger.warning(
                        'Tool loop exceeded %d rounds for clinic %s, conversation %s - handing off to human',
                        MAX_TOOL_ROUNDS, self.clinic.id, conversation.id
                    )
                    final_response = (
                        "Desculpe, não estou conseguindo concluir sua solicitação agora. "
                        "Vou transferir você para um de nossos atendentes."
                    )
                    self.conversation_service.transfer_to_human(
                        conversation, 'Limite de chamadas de ferramentas excedido', urgent=False
                    )
                    self.conversation_service.add_message(conversation, 'assistant', final_response)
                    return final_response

                message = choice.message
                tool_calls = message.tool_calls or []

                api_messages.append({
                    "role": "assistant",
                    "content": message.content,
                    "tool_calls": [tc.model_dump() for tc in tool_calls],
                })

                for tool_call in tool_calls:
                    tool_input = json.loads(tool_call.function.arguments or "{}")
                    result = self._execute_tool(tool_call.function.name, tool_input, conversation)
                    api_messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "content": result,
                    })

                response = self.client.chat.completions.create(
                    model=model,
                    max_tokens=1024,
                    temperature=temperature,
                    tools=tools,
                    messages=api_messages,
                    extra_body={"usage": USAGE_INCLUDE_COST},
                )
                record_ai_usage(self.clinic.id, AiUsageService.WHATSAPP, 'process_message', model, response)
                choice = self._first_choice(response)

            final_response = choice.message.content or ""

            # Add assistant response to history
            self.conversation_service.add_message(conversation, 'assistant', final_response)

            return final_response

        except openai.APIError as e:
            logger.error('OpenRouter API error: %s', str(e))
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
