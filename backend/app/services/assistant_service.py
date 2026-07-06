"""
Internal AI assistant for the clinic owner/staff.

This is a SEPARATE agent from ClaudeService (which talks to patients over
WhatsApp). AssistantService only talks to the authenticated clinic user
through the dashboard, is strictly read-only + advisory (it cannot create,
change or cancel appointments/patients/settings), and has broad read access
across the clinic's own data via tool calls so it can act as an analytical
"right hand" for business decisions.

It "learns" over time through AssistantMemory: whenever the owner shares a
fact worth remembering (a goal, a preference, an operational quirk), the
assistant can call remember_fact to persist it, and every future system
prompt is built with the accumulated memories injected as context.
"""
import json
import logging
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from flask import current_app
import openai

from app import db
from app.models import (
    Patient, Appointment, AppointmentStatus, Professional, PipelineStage,
    Conversation, AgentAction, AssistantMemory,
)

logger = logging.getLogger(__name__)

WEEKDAY_NAMES = ['segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo']

MAX_HISTORY_MESSAGES = 30
MAX_MEMORIES_IN_PROMPT = 30

SYSTEM_PROMPT_TEMPLATE = """{current_datetime}

Você é o braço direito do dono/gestor da clínica {clinic_name} - um assistente interno de análise e apoio à decisão, acessado pelo painel administrativo.

Você é DIFERENTE do assistente de WhatsApp que atende pacientes: você conversa apenas com a equipe da clínica, nunca com pacientes, e não participa do agendamento.

SUA FUNÇÃO:
- Ajudar o gestor a entender o desempenho da clínica (agendamentos, pacientes, funil de CRM, conversas de atendimento, ações que a IA tomou por iniciativa própria)
- Responder perguntas usando SEMPRE as ferramentas disponíveis para buscar dados reais - nunca invente números, nomes ou datas
- Dar sugestões práticas e diretas para apoiar a tomada de decisão
- Usar a ferramenta remember_fact para guardar metas, preferências e particularidades da clínica que o gestor mencionar, para lembrar em conversas futuras

REGRAS IMPORTANTES:
- Você é SOMENTE CONSULTIVO. Não pode criar, alterar ou cancelar agendamentos, pacientes ou configurações. Se pedirem uma ação desse tipo, oriente a fazer isso nas telas do sistema (Agendamentos, Pacientes, Pipeline, Configurações).
- Sempre que a pergunta envolver números ou fatos sobre a clínica, use uma ferramenta antes de responder.
- Seja direto, objetivo e traga números concretos. Pode usar listas simples, sem markdown pesado.
- Português do Brasil.

{memories_block}
"""


class AssistantService:
    """Service for the internal, tool-using clinic-management copilot."""

    def __init__(self, clinic):
        self.clinic = clinic
        api_key = clinic.openrouter_api_key or current_app.config.get('OPENROUTER_API_KEY')
        if not api_key:
            raise ValueError('OpenRouter API key not configured')
        self.client = openai.OpenAI(
            api_key=api_key,
            base_url=current_app.config.get('OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1'),
        )

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

    # ------------------------------------------------------------------ #
    # Tool declarations                                                   #
    # ------------------------------------------------------------------ #

    def _get_tools(self) -> list:
        return [
            {
                "name": "get_metrics_overview",
                "description": "Retorna um resumo das métricas da clínica (agendamentos por status, novos pacientes, conversas ativas, taxa de conclusão/cancelamento/falta) em um período de dias.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "days": {"type": "integer", "description": "Quantidade de dias para trás a considerar (padrão 30)"}
                    },
                    "required": []
                }
            },
            {
                "name": "list_patients",
                "description": "Lista pacientes da clínica, com filtro opcional por nome/telefone ou por estágio do funil de CRM.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "search": {"type": "string", "description": "Busca por nome ou telefone (opcional)"},
                        "pipeline_stage_name": {"type": "string", "description": "Filtrar por nome do estágio do funil (opcional)"},
                        "limit": {"type": "integer", "description": "Máximo de resultados (padrão 20, máx 50)"}
                    },
                    "required": []
                }
            },
            {
                "name": "get_patient_details",
                "description": "Retorna detalhes completos de um paciente específico (por nome ou telefone), incluindo seus últimos agendamentos.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "patient_name": {"type": "string", "description": "Nome (ou parte do nome) do paciente"},
                        "patient_phone": {"type": "string", "description": "Telefone do paciente (formato 5511999999999)"}
                    },
                    "required": []
                }
            },
            {
                "name": "list_appointments",
                "description": "Lista agendamentos da clínica com filtros opcionais por período, status, profissional ou paciente.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "date_from": {"type": "string", "description": "Data inicial (YYYY-MM-DD, opcional)"},
                        "date_to": {"type": "string", "description": "Data final (YYYY-MM-DD, opcional)"},
                        "status": {"type": "string", "description": "pending, confirmed, cancelled, completed ou no_show (opcional)"},
                        "professional_name": {"type": "string", "description": "Nome do profissional (opcional)"},
                        "patient_name": {"type": "string", "description": "Nome do paciente (opcional)"},
                        "limit": {"type": "integer", "description": "Máximo de resultados (padrão 20, máx 100)"}
                    },
                    "required": []
                }
            },
            {
                "name": "list_professionals",
                "description": "Lista os profissionais cadastrados na clínica e suas especialidades.",
                "input_schema": {"type": "object", "properties": {}, "required": []}
            },
            {
                "name": "get_pipeline_overview",
                "description": "Retorna os estágios do funil de CRM da clínica com a quantidade de pacientes em cada um.",
                "input_schema": {"type": "object", "properties": {}, "required": []}
            },
            {
                "name": "list_conversations",
                "description": "Lista as conversas de WhatsApp mais recentes da clínica, com status e um resumo da última mensagem.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "status": {"type": "string", "description": "active, transferred_to_human ou completed (opcional)"},
                        "limit": {"type": "integer", "description": "Máximo de resultados (padrão 10, máx 30)"}
                    },
                    "required": []
                }
            },
            {
                "name": "get_conversation_transcript",
                "description": "Retorna as últimas mensagens da conversa de WhatsApp de um paciente específico, para entender o histórico de atendimento.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "patient_name": {"type": "string", "description": "Nome do paciente dono da conversa"}
                    },
                    "required": ["patient_name"]
                }
            },
            {
                "name": "list_agent_actions",
                "description": "Lista o histórico de ações que a IA de atendimento tomou por iniciativa própria (recuperação de faltas, lista de espera, reativação de pacientes, relatórios), para auditoria.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "action_type": {"type": "string", "description": "Filtrar por tipo de ação (opcional)"},
                        "limit": {"type": "integer", "description": "Máximo de resultados (padrão 20, máx 50)"}
                    },
                    "required": []
                }
            },
            {
                "name": "get_billing_status",
                "description": "Retorna o status da assinatura da clínica na plataforma (ativa, atrasada, cancelada etc).",
                "input_schema": {"type": "object", "properties": {}, "required": []}
            },
            {
                "name": "get_clinic_settings",
                "description": "Retorna as configurações da clínica: horário de funcionamento, serviços oferecidos e status das automações de IA proativa.",
                "input_schema": {"type": "object", "properties": {}, "required": []}
            },
            {
                "name": "remember_fact",
                "description": "Salva um fato, meta ou preferência importante sobre a clínica para lembrar em conversas futuras (ex: metas do gestor, particularidades da operação). Use quando o gestor compartilhar algo que valha a pena lembrar depois.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "content": {"type": "string", "description": "O fato a ser lembrado, de forma objetiva e curta"}
                    },
                    "required": ["content"]
                }
            },
        ]

    # ------------------------------------------------------------------ #
    # Tool dispatch                                                       #
    # ------------------------------------------------------------------ #

    _TOOL_HANDLERS = {
        "get_metrics_overview": ("_tool_get_metrics_overview", "buscar métricas"),
        "list_patients": ("_tool_list_patients", "listar pacientes"),
        "get_patient_details": ("_tool_get_patient_details", "buscar paciente"),
        "list_appointments": ("_tool_list_appointments", "listar agendamentos"),
        "list_professionals": ("_tool_list_professionals", "listar profissionais"),
        "get_pipeline_overview": ("_tool_get_pipeline_overview", "buscar funil"),
        "list_conversations": ("_tool_list_conversations", "listar conversas"),
        "get_conversation_transcript": ("_tool_get_conversation_transcript", "buscar transcrição"),
        "list_agent_actions": ("_tool_list_agent_actions", "listar ações da IA"),
        "get_billing_status": ("_tool_get_billing_status", "buscar assinatura"),
        "get_clinic_settings": ("_tool_get_clinic_settings", "buscar configurações"),
        "remember_fact": ("_tool_remember_fact", "salvar fato"),
    }

    def _execute_tool(self, tool_name: str, tool_input: dict) -> str:
        logger.info('Assistant executing tool: %s with input: %s', tool_name, tool_input)
        handler_entry = self._TOOL_HANDLERS.get(tool_name)
        if not handler_entry:
            return "Ferramenta não reconhecida."

        handler_name, action_phrase = handler_entry
        try:
            return getattr(self, handler_name)(tool_input)
        except Exception as e:
            logger.error('Error executing assistant tool %s: %s', tool_name, str(e))
            return f"Erro ao {action_phrase}: {str(e)}"

    @staticmethod
    def _to_json(data) -> str:
        return json.dumps(data, ensure_ascii=False, default=str)

    def _tool_get_metrics_overview(self, tool_input: dict) -> str:
        from app.services.automation_service import collect_metrics
        days = int(tool_input.get('days') or 30)
        days = max(1, min(days, 365))
        metrics = collect_metrics(self.clinic, days=days)
        return self._to_json(metrics)

    def _tool_list_patients(self, tool_input: dict) -> str:
        limit = min(int(tool_input.get('limit') or 20), 50)
        query = Patient.query.filter_by(clinic_id=self.clinic.id)

        search = (tool_input.get('search') or '').strip()
        if search:
            like = f"%{search}%"
            query = query.filter(db.or_(Patient.name.ilike(like), Patient.phone.ilike(like)))

        stage_name = (tool_input.get('pipeline_stage_name') or '').strip()
        if stage_name:
            query = query.join(PipelineStage, Patient.pipeline_stage_id == PipelineStage.id).filter(
                db.func.lower(PipelineStage.name) == stage_name.lower()
            )

        patients = query.order_by(Patient.created_at.desc()).limit(limit).all()
        if not patients:
            return "Nenhum paciente encontrado com esses filtros."

        results = [
            {
                'name': p.name,
                'phone': p.phone,
                'email': p.email,
                'pipeline_stage': p.pipeline_stage.name if p.pipeline_stage else None,
                'created_at': p.created_at.isoformat() if p.created_at else None,
            }
            for p in patients
        ]
        return self._to_json(results)

    def _tool_get_patient_details(self, tool_input: dict) -> str:
        query = Patient.query.filter_by(clinic_id=self.clinic.id)
        name = (tool_input.get('patient_name') or '').strip()
        phone = (tool_input.get('patient_phone') or '').strip()
        if phone:
            query = query.filter(Patient.phone == phone)
        elif name:
            query = query.filter(Patient.name.ilike(f"%{name}%"))
        else:
            return "Informe o nome ou telefone do paciente."

        patient = query.first()
        if not patient:
            return "Paciente não encontrado."

        recent_appointments = (
            Appointment.query.filter_by(clinic_id=self.clinic.id, patient_id=patient.id)
            .order_by(Appointment.scheduled_datetime.desc())
            .limit(5)
            .all()
        )
        data = {
            'name': patient.name,
            'phone': patient.phone,
            'email': patient.email,
            'notes': patient.notes,
            'pipeline_stage': patient.pipeline_stage.name if patient.pipeline_stage else None,
            'whatsapp_opt_out': patient.whatsapp_opt_out,
            'created_at': patient.created_at.isoformat() if patient.created_at else None,
            'recent_appointments': [
                {
                    'service_name': a.service_name,
                    'scheduled_datetime': a.scheduled_datetime.isoformat(),
                    'status': a.status,
                }
                for a in recent_appointments
            ],
        }
        return self._to_json(data)

    def _tool_list_appointments(self, tool_input: dict) -> str:
        limit = min(int(tool_input.get('limit') or 20), 100)
        query = Appointment.query.filter_by(clinic_id=self.clinic.id)

        date_from = tool_input.get('date_from')
        date_to = tool_input.get('date_to')
        if date_from:
            query = query.filter(Appointment.scheduled_datetime >= datetime.strptime(date_from, '%Y-%m-%d'))
        if date_to:
            query = query.filter(
                Appointment.scheduled_datetime < datetime.strptime(date_to, '%Y-%m-%d') + timedelta(days=1)
            )

        status = (tool_input.get('status') or '').strip()
        if status:
            query = query.filter(Appointment.status == status)

        professional_name = (tool_input.get('professional_name') or '').strip()
        if professional_name:
            query = query.join(Professional, Appointment.professional_id == Professional.id).filter(
                Professional.name.ilike(f"%{professional_name}%")
            )

        patient_name = (tool_input.get('patient_name') or '').strip()
        if patient_name:
            query = query.join(Patient, Appointment.patient_id == Patient.id).filter(
                Patient.name.ilike(f"%{patient_name}%")
            )

        appointments = query.order_by(Appointment.scheduled_datetime.desc()).limit(limit).all()
        if not appointments:
            return "Nenhum agendamento encontrado com esses filtros."

        results = [
            {
                'patient_name': a.patient.name if a.patient else None,
                'professional_name': a.professional.name if a.professional else None,
                'service_name': a.service_name,
                'scheduled_datetime': a.scheduled_datetime.isoformat(),
                'status': a.status,
            }
            for a in appointments
        ]
        return self._to_json(results)

    def _tool_list_professionals(self, tool_input: dict) -> str:
        professionals = Professional.query.filter_by(clinic_id=self.clinic.id).all()
        if not professionals:
            return "Esta clínica não tem profissionais cadastrados."
        results = [
            {'name': p.name, 'specialty': p.specialty, 'active': p.active}
            for p in professionals
        ]
        return self._to_json(results)

    def _tool_get_pipeline_overview(self, tool_input: dict) -> str:
        stages = PipelineStage.query.filter_by(clinic_id=self.clinic.id).order_by(PipelineStage.order).all()
        if not stages:
            return "Nenhum estágio de funil configurado."
        results = [
            {
                'stage_name': s.name,
                'patient_count': s.patients.filter(Patient.deleted_at.is_(None)).count(),
            }
            for s in stages
        ]
        return self._to_json(results)

    def _tool_list_conversations(self, tool_input: dict) -> str:
        limit = min(int(tool_input.get('limit') or 10), 30)
        query = Conversation.query.filter_by(clinic_id=self.clinic.id)

        status = (tool_input.get('status') or '').strip()
        if status:
            query = query.filter(Conversation.status == status)

        conversations = query.order_by(Conversation.last_message_at.desc()).limit(limit).all()
        if not conversations:
            return "Nenhuma conversa encontrada."

        results = []
        for c in conversations:
            last_message = c.messages[-1] if c.messages else None
            results.append({
                'patient_name': c.patient.name if c.patient else None,
                'phone_number': c.phone_number,
                'status': c.status,
                'urgent': c.urgent,
                'message_count': len(c.messages or []),
                'last_message_snippet': (last_message.get('content') or '')[:140] if last_message else None,
                'last_message_at': c.last_message_at.isoformat() if c.last_message_at else None,
            })
        return self._to_json(results)

    def _tool_get_conversation_transcript(self, tool_input: dict) -> str:
        name = (tool_input.get('patient_name') or '').strip()
        if not name:
            return "Informe o nome do paciente."

        patient = Patient.query.filter_by(clinic_id=self.clinic.id).filter(
            Patient.name.ilike(f"%{name}%")
        ).first()
        if not patient:
            return "Paciente não encontrado."

        conversation = Conversation.query.filter_by(
            clinic_id=self.clinic.id, patient_id=patient.id
        ).order_by(Conversation.last_message_at.desc()).first()
        if not conversation or not conversation.messages:
            return "Este paciente não tem conversas registradas."

        transcript = [
            {'role': m.get('role'), 'content': m.get('content'), 'timestamp': m.get('timestamp')}
            for m in conversation.messages[-30:]
        ]
        return self._to_json(transcript)

    def _tool_list_agent_actions(self, tool_input: dict) -> str:
        limit = min(int(tool_input.get('limit') or 20), 50)
        query = AgentAction.query.filter_by(clinic_id=self.clinic.id)

        action_type = (tool_input.get('action_type') or '').strip()
        if action_type:
            query = query.filter(AgentAction.action_type == action_type)

        actions = query.order_by(AgentAction.created_at.desc()).limit(limit).all()
        if not actions:
            return "Nenhuma ação registrada."

        results = [
            {
                'action_type': a.action_type,
                'status': a.status,
                'detail': a.detail,
                'created_at': a.created_at.isoformat() if a.created_at else None,
            }
            for a in actions
        ]
        return self._to_json(results)

    def _tool_get_billing_status(self, tool_input: dict) -> str:
        data = {
            'subscription_status': self.clinic.subscription_status,
            'subscription_period_end': (
                self.clinic.subscription_period_end.isoformat()
                if self.clinic.subscription_period_end else None
            ),
        }
        return self._to_json(data)

    def _tool_get_clinic_settings(self, tool_input: dict) -> str:
        data = {
            'business_hours': self.clinic.business_hours,
            'services': self.clinic.services,
            'booking_enabled': self.clinic.booking_enabled,
            'agent_enabled': self.clinic.agent_enabled,
            'proactive_outreach_enabled': self.clinic.proactive_outreach_enabled,
            'noshow_recovery_enabled': self.clinic.noshow_recovery_enabled,
            'waitlist_enabled': self.clinic.waitlist_enabled,
            'recall_enabled': self.clinic.recall_enabled,
            'funnel_automation_enabled': self.clinic.funnel_automation_enabled,
            'weekly_report_enabled': self.clinic.weekly_report_enabled,
        }
        return self._to_json(data)

    def _tool_remember_fact(self, tool_input: dict) -> str:
        content = (tool_input.get('content') or '').strip()
        if not content:
            return "Nenhum conteúdo fornecido para lembrar."
        memory = AssistantMemory(clinic_id=self.clinic.id, content=content[:500])
        db.session.add(memory)
        db.session.commit()
        return "Anotado, vou lembrar disso."

    # ------------------------------------------------------------------ #
    # Conversation loop                                                   #
    # ------------------------------------------------------------------ #

    def _memories_block(self) -> str:
        memories = (
            AssistantMemory.query.filter_by(clinic_id=self.clinic.id)
            .order_by(AssistantMemory.created_at.desc())
            .limit(MAX_MEMORIES_IN_PROMPT)
            .all()
        )
        if not memories:
            return ""
        lines = "\n".join(f"- {m.content}" for m in reversed(memories))
        return f"O QUE VOCÊ JÁ APRENDEU SOBRE ESTA CLÍNICA:\n{lines}"

    def _build_system_prompt(self) -> str:
        now = datetime.now(ZoneInfo('America/Sao_Paulo'))
        weekday = WEEKDAY_NAMES[now.weekday()]
        current_datetime_str = (
            f"CONTEXTO TEMPORAL:\nHOJE É: {weekday}, {now.strftime('%d de %B de %Y')} "
            f"às {now.strftime('%H:%M')} (Horário de Brasília)"
        )
        return SYSTEM_PROMPT_TEMPLATE.format(
            current_datetime=current_datetime_str,
            clinic_name=self.clinic.name,
            memories_block=self._memories_block(),
        )

    def _history_for_claude(self, conversation) -> list:
        messages = (conversation.messages or [])[-MAX_HISTORY_MESSAGES:]
        return [{"role": m["role"], "content": m["content"]} for m in messages]

    def process_message(self, conversation, new_message: str) -> str:
        """Process a message from the clinic owner/staff and return the assistant's reply."""
        conversation.add_message('user', new_message)
        db.session.commit()

        system_prompt = self._build_system_prompt()
        history = self._history_for_claude(conversation)
        api_messages = [{"role": "system", "content": system_prompt}] + history
        model = current_app.config.get('OPENROUTER_MODEL', 'anthropic/claude-sonnet-4.5')
        tools = self._to_openai_tools(self._get_tools())

        try:
            response = self.client.chat.completions.create(
                model=model,
                max_tokens=1024,
                temperature=0.4,
                tools=tools,
                messages=api_messages,
            )

            while response.choices[0].finish_reason == "tool_calls":
                message = response.choices[0].message
                tool_calls = message.tool_calls or []

                api_messages.append({
                    "role": "assistant",
                    "content": message.content,
                    "tool_calls": [tc.model_dump() for tc in tool_calls],
                })

                for tool_call in tool_calls:
                    tool_input = json.loads(tool_call.function.arguments or "{}")
                    result = self._execute_tool(tool_call.function.name, tool_input)
                    api_messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "content": result,
                    })

                response = self.client.chat.completions.create(
                    model=model,
                    max_tokens=1024,
                    temperature=0.4,
                    tools=tools,
                    messages=api_messages,
                )

            final_response = response.choices[0].message.content or ""

            conversation.add_message('assistant', final_response)
            db.session.commit()
            return final_response

        except openai.APIError as e:
            logger.error('Assistant OpenRouter API error: %s', str(e))
            return (
                "Desculpe, estou com dificuldades técnicas no momento. "
                "Por favor, tente novamente em alguns instantes."
            )
