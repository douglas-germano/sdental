Você vai criar um MVP de plataforma SaaS de chatbot para clínicas médicas com agendamento automatizado via WhatsApp.

# STACK TÉCNICA
- Frontend: Next.js 14 com App Router, TypeScript, Tailwind CSS, shadcn/ui
- Backend: Flask (Python) com Blueprint para organização modular
- Banco: PostgreSQL com SQLAlchemy ORM
- WhatsApp: Evolution API (self-hosted ou instância)
- IA: Claude API (Anthropic) para processamento de linguagem natural
- Autenticação: JWT tokens
- Deploy: Backend em container Docker, frontend em Vercel

# ARQUITETURA DO SISTEMA

## 1. BANCO DE DADOS POSTGRESQL

Crie as seguintes tabelas com relacionamentos adequados:

**clinics**
- id (UUID, PK)
- name (VARCHAR)
- email (VARCHAR, unique)
- phone (VARCHAR)
- password_hash (VARCHAR)
- evolution_api_url (VARCHAR)
- evolution_api_key (VARCHAR)
- evolution_instance_name (VARCHAR)
- claude_api_key (VARCHAR, nullable - usar chave global por padrão)
- business_hours (JSONB) - horários de funcionamento
- services (JSONB) - lista de procedimentos/consultas oferecidos
- active (BOOLEAN)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)

**patients**
- id (UUID, PK)
- clinic_id (UUID, FK -> clinics)
- name (VARCHAR)
- phone (VARCHAR) - formato: 5511999999999
- email (VARCHAR, nullable)
- notes (TEXT, nullable)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
- UNIQUE(clinic_id, phone)

**appointments**
- id (UUID, PK)
- clinic_id (UUID, FK -> clinics)
- patient_id (UUID, FK -> patients)
- service_name (VARCHAR)
- scheduled_datetime (TIMESTAMP)
- duration_minutes (INTEGER, default 30)
- status (VARCHAR) - pending, confirmed, cancelled, completed, no_show
- notes (TEXT, nullable)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
- cancelled_at (TIMESTAMP, nullable)

**conversations**
- id (UUID, PK)
- clinic_id (UUID, FK -> clinics)
- patient_id (UUID, FK -> patients, nullable)
- phone_number (VARCHAR)
- messages (JSONB) - array de mensagens [{role, content, timestamp}]
- context (JSONB) - contexto da conversa para o Claude
- status (VARCHAR) - active, transferred_to_human, completed
- last_message_at (TIMESTAMP)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)

**availability_slots**
- id (UUID, PK)
- clinic_id (UUID, FK -> clinics)
- day_of_week (INTEGER) - 0-6 (segunda-domingo)
- start_time (TIME)
- end_time (TIME)
- slot_duration_minutes (INTEGER, default 30)
- active (BOOLEAN)

**bot_transfers**
- id (UUID, PK)
- conversation_id (UUID, FK -> conversations)
- reason (TEXT)
- transferred_at (TIMESTAMP)
- resolved (BOOLEAN)
- resolved_at (TIMESTAMP, nullable)

## 2. BACKEND FLASK

Estrutura de pastas:
backend/
├── app/
│   ├── init.py (factory pattern)
│   ├── config.py
│   ├── models/
│   │   ├── init.py
│   │   ├── clinic.py
│   │   ├── patient.py
│   │   ├── appointment.py
│   │   └── conversation.py
│   ├── routes/
│   │   ├── init.py
│   │   ├── auth.py
│   │   ├── clinics.py
│   │   ├── patients.py
│   │   ├── appointments.py
│   │   ├── webhook.py (Evolution API)
│   │   └── analytics.py
│   ├── services/
│   │   ├── init.py
│   │   ├── claude_service.py (integração Claude API)
│   │   ├── evolution_service.py (integração Evolution API)
│   │   ├── appointment_service.py (lógica de agendamento)
│   │   └── conversation_service.py (gerenciamento de contexto)
│   └── utils/
│       ├── init.py
│       ├── auth.py (JWT helpers)
│       └── validators.py
├── migrations/
├── requirements.txt
├── Dockerfile
└── run.py

### Endpoints principais:

**Autenticação:**
- POST /api/auth/register (cadastro de clínica)
- POST /api/auth/login (login e geração de JWT)
- POST /api/auth/refresh (refresh token)

**Clínicas:**
- GET /api/clinics/profile (dados da clínica logada)
- PUT /api/clinics/profile (atualizar dados)
- PUT /api/clinics/evolution-config (configurar Evolution API)
- PUT /api/clinics/business-hours (configurar horários)
- PUT /api/clinics/services (configurar serviços)

**Pacientes:**
- GET /api/patients (listar pacientes da clínica)
- GET /api/patients/:id (detalhes de um paciente)
- PUT /api/patients/:id (atualizar paciente)

**Agendamentos:**
- GET /api/appointments (listar agendamentos com filtros)
- POST /api/appointments (criar agendamento manual)
- PUT /api/appointments/:id (atualizar status)
- DELETE /api/appointments/:id (cancelar)
- GET /api/appointments/availability (horários disponíveis)

**Conversas:**
- GET /api/conversations (listar conversas)
- GET /api/conversations/:id (detalhes e histórico)
- POST /api/conversations/:id/transfer (transferir para humano)
- PUT /api/conversations/:id/resolve (marcar como resolvida)

**Webhook:**
- POST /api/webhook/evolution (receber mensagens do WhatsApp)

**Analytics:**
- GET /api/analytics/overview (métricas gerais)
- GET /api/analytics/appointments-by-period
- GET /api/analytics/conversion-rate

### Claude Service (services/claude_service.py):

Crie uma classe ClaudeService com:

**process_message(clinic, patient, conversation_history, new_message)**
- Monta o prompt do sistema com contexto da clínica (horários, serviços)
- Inclui histórico da conversa
- Define tools disponíveis para o Claude:
  - check_availability(date, service) - verifica horários disponíveis
  - create_appointment(patient_info, datetime, service) - agenda consulta
  - list_appointments(patient_phone) - lista agendamentos do paciente
  - cancel_appointment(appointment_id) - cancela agendamento
  - transfer_to_human(reason) - transfere para atendimento humano
- Chama a API do Claude com tool use
- Processa tool calls executando as funções correspondentes
- Retorna a resposta final para enviar ao paciente

**Prompt do sistema base:**
Você é um assistente virtual de agendamento para a clínica {clinic_name}.
INFORMAÇÕES DA CLÍNICA:

Serviços oferecidos: {services}
Horários de funcionamento: {business_hours}
Duração padrão das consultas: 30 minutos

SUA FUNÇÃO:

Receber solicitações de agendamento de pacientes via WhatsApp
Verificar disponibilidade de horários
Confirmar agendamentos com nome, telefone e horário escolhido
Listar agendamentos existentes quando solicitado
Permitir cancelamentos
Transferir para atendimento humano quando necessário

REGRAS IMPORTANTES:

Sempre seja educado e profissional
Colete nome completo e telefone antes de agendar
Confirme todos os detalhes antes de finalizar agendamento
Se não conseguir resolver, use a função transfer_to_human
Horários devem estar dentro do funcionamento da clínica
Não agende em horários já ocupados
Sempre envie mensagem de confirmação após agendar

FORMATO DE RESPOSTAS:

Seja conciso e objetivo
Use quebras de linha para melhor legibilidade
Não use markdown ou formatação especial
Emojis podem ser usados moderadamente para tornar a conversa amigável

Histórico da conversa está disponível no contexto.

### Evolution Service (services/evolution_service.py):

Classe EvolutionService com:
- send_message(instance_name, phone, message) - envia mensagem via Evolution API
- get_instance_status(instance_name) - verifica status da instância
- set_webhook(instance_name, webhook_url) - configura webhook

### Appointment Service (services/appointment_service.py):

Lógica para:
- get_available_slots(clinic_id, date, service) - retorna slots livres
- create_appointment(clinic_id, patient_data, datetime, service)
- send_reminder(appointment_id) - envia lembrete 24h antes
- update_status(appointment_id, new_status)

## 3. FRONTEND NEXT.JS

Estrutura:
frontend/
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── register/page.tsx
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx (sidebar navigation)
│   │   │   ├── page.tsx (overview/analytics)
│   │   │   ├── appointments/page.tsx
│   │   │   ├── patients/page.tsx
│   │   │   ├── conversations/page.tsx
│   │   │   ├── conversations/[id]/page.tsx
│   │   │   └── settings/page.tsx
│   │   ├── layout.tsx
│   │   └── providers.tsx
│   ├── components/
│   │   ├── ui/ (shadcn components)
│   │   ├── appointments/
│   │   │   ├── AppointmentCalendar.tsx
│   │   │   ├── AppointmentList.tsx
│   │   │   └── CreateAppointmentDialog.tsx
│   │   ├── conversations/
│   │   │   ├── ConversationList.tsx
│   │   │   ├── MessageThread.tsx
│   │   │   └── TransferDialog.tsx
│   │   ├── analytics/
│   │   │   ├── MetricsCards.tsx
│   │   │   └── AppointmentsChart.tsx
│   │   └── settings/
│   │       ├── EvolutionAPIConfig.tsx
│   │       ├── BusinessHoursConfig.tsx
│   │       └── ServicesConfig.tsx
│   ├── lib/
│   │   ├── api.ts (axios instance com interceptors)
│   │   ├── auth.ts (auth helpers)
│   │   └── utils.ts
│   └── types/
│       └── index.ts
├── public/
└── package.json

### Páginas principais:

**Dashboard (/):**
- Cards com métricas: total agendamentos mês, taxa conversão, conversas ativas, próximos agendamentos
- Gráfico de agendamentos por período
- Lista de conversas recentes aguardando atenção

**Agendamentos (/appointments):**
- Calendário visual com agendamentos
- Filtros: data, status, serviço
- Ações: criar manual, cancelar, marcar status
- Lista/grid view toggle

**Pacientes (/patients):**
- Tabela com busca e filtros
- Detalhes: histórico de agendamentos e conversas
- Edição de informações

**Conversas (/conversations):**
- Lista de conversas ativas/arquivadas
- Preview da última mensagem
- Badge para conversas que precisam atenção humana
- Detalhes: thread completo, opção de transferir/resolver

**Configurações (/settings):**
- Aba Evolution API: URL, API key, instance name, teste de conexão
- Aba Horários: configurar dias/horários de funcionamento
- Aba Serviços: lista de procedimentos, duração
- Aba Perfil: dados da clínica

## 4. FLUXO DE FUNCIONAMENTO

### Recebimento de mensagem:

1. Evolution API envia POST para /api/webhook/evolution
2. Webhook extrai: phone, message, instance
3. Identifica clínica pela instance
4. Busca/cria patient pelo phone
5. Busca/cria conversation ativa
6. Adiciona mensagem ao histórico
7. Chama ClaudeService.process_message()
8. Claude processa e pode chamar tools:
   - Se check_availability: consulta availability_slots e appointments
   - Se create_appointment: valida e cria em appointments
   - Se transfer_to_human: marca conversation e cria bot_transfer
9. Resposta do Claude é enviada via EvolutionService.send_message()
10. Atualiza conversation com nova mensagem

### Criação de agendamento:

1. Valida se horário está disponível
2. Cria registro em appointments
3. Cria/atualiza patient se necessário
4. Envia confirmação via WhatsApp com detalhes
5. Agenda job para enviar lembrete 24h antes

### Transferência para humano:

1. Bot detecta necessidade (via tool ou regra)
2. Marca conversation.status = 'transferred_to_human'
3. Cria registro em bot_transfers
4. Notifica dashboard (badge/destaque)
5. Atendente visualiza conversa completa
6. Atendente pode resolver e marcar como resolvida

## 5. IMPLEMENTAÇÃO

### Prioridades:

**Fase 1 - Core (Semana 1-2):**
- Setup banco PostgreSQL com migrations
- Modelos SQLAlchemy
- Auth JWT (register/login)
- Integração Evolution API (webhook + send)
- Integração Claude API básica (sem tools)
- Frontend: login, dashboard básico

**Fase 2 - Agendamento (Semana 3):**
- Sistema de availability slots
- Tool use do Claude para agendamento
- CRUD appointments no backend
- Tela de agendamentos no frontend
- Sistema de lembretes

**Fase 3 - Conversas (Semana 4):**
- Tela de conversas com histórico
- Transfer to human
- Analytics básico
- Configurações (Evolution, horários, serviços)

### Variáveis de ambiente (.env):
Database
DATABASE_URL=postgresql://user:pass@localhost:5432/chatbot_clinicas
Flask
FLASK_ENV=development
SECRET_KEY=your-secret-key-here
JWT_SECRET_KEY=your-jwt-secret
Claude API
CLAUDE_API_KEY=sk-ant-...
Evolution API (default - pode ser sobrescrito por clínica)
EVOLUTION_API_URL=https://your-evolution-instance.com
EVOLUTION_API_KEY=your-api-key
Frontend
NEXT_PUBLIC_API_URL=http://localhost:5000/api

### Requirements.txt principais:
Flask==3.0.0
Flask-SQLAlchemy==3.1.1
Flask-Migrate==4.0.5
Flask-JWT-Extended==4.6.0
Flask-CORS==4.0.0
psycopg2-binary==2.9.9
anthropic==0.39.0
requests==2.31.0
python-dotenv==1.0.0
APScheduler==3.10.4

## 6. DIFERENCIAIS DO MVP

1. **Context Memory**: conversation.context armazena preferências e histórico
2. **Multi-tenant seguro**: todas queries filtram por clinic_id
3. **Tool use inteligente**: Claude decide quando agendar vs pedir mais info
4. **Transfer gracioso**: contexto completo mantido para atendente humano
5. **Analytics acionável**: métricas que importam (conversão, economia de tempo)

## INSTRUÇÕES DE DESENVOLVIMENTO

1. Comece pelo banco: crie as migrations e modelos
2. Implemente auth básico (register/login)
3. Configure Evolution webhook e teste recebimento
4. Implemente ClaudeService SEM tools primeiro (echo bot)
5. Adicione tools um por um: availability → create_appointment → cancel → transfer
6. Frontend: autenticação → dashboard vazio → telas com dados mockados → integração real
7. Teste fluxo completo: mensagem WhatsApp → agendamento → dashboard

Use SQLAlchemy relationships para facilitar queries. Adicione indexes em: clinic_id (todas tabelas), phone (patients), scheduled_datetime (appointments), last_message_at (conversations).

Implemente logging adequado em todos os serviços. Use try/except para capturar erros da API do Claude e Evolution.

Crie um arquivo seed.py para popular banco com dados de teste (1 clínica, horários, serviços).

Docker compose com PostgreSQL para desenvolvimento local.

Mantenha código limpo, comentado e seguindo PEP 8. Use type hints em Python.

Está claro? Comece a implementação.Claude é uma IA e pode cometer erros. Por favor, verifique as respostas.