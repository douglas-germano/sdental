# CLAUDE.md

Guidance for AI assistants (and humans) working in this repository.

## What this project is

**SDental** is a multi-tenant SaaS platform for dental/medical clinics. Its core
feature is an **AI chatbot that handles patient appointment scheduling over
WhatsApp**. Each clinic (the tenant) connects its own WhatsApp number, and an
AI-powered agent (via OpenRouter, giving access to models from Anthropic, OpenAI,
Google, and others) answers patients, checks availability, books /
reschedules / cancels appointments, confirms reminders, and moves patients
through a CRM pipeline. Clinic staff use a web dashboard to manage patients,
appointments, professionals, conversations (with live human takeover), a Kanban
CRM pipeline, and analytics.

The product UI and all user-facing copy are in **Brazilian Portuguese**. Code
identifiers, comments, and docs are in English. Phone numbers use the Brazilian
format `5511999999999` (country code + area code + number).

## Tech stack

| Layer     | Tech |
|-----------|------|
| Backend   | Flask 3 (app-factory + Blueprints), SQLAlchemy, Flask-Migrate/Alembic, Flask-JWT-Extended, Marshmallow, Flask-Limiter, Flask-Caching, APScheduler, Gunicorn |
| Database  | PostgreSQL 16 (UUID PKs, JSONB columns) |
| AI        | OpenRouter (OpenAI-compatible multi-provider gateway) via the `openai` SDK, using tool/function calling |
| WhatsApp  | [Evolution API](https://github.com/EvolutionAPI/evolution-api) (self-hosted WhatsApp gateway) |
| Email     | Brevo (transactional email) |
| Realtime  | Server-Sent Events (SSE), backed by Redis pub/sub (with in-process fallback) |
| Frontend  | Next.js 15 (App Router), React 18, TypeScript, Tailwind CSS, Radix UI primitives, React Hook Form + Zod, Axios, Recharts, dnd-kit |

## Repository layout

```
sdental/
├── backend/                 # Flask API (the primary application)
│   ├── app/
│   │   ├── __init__.py      # create_app() factory: registers extensions, blueprints, scheduler
│   │   ├── config.py        # Config classes + validate_config() fail-fast checks
│   │   ├── scheduler.py     # APScheduler jobs (reminders)
│   │   ├── models/          # SQLAlchemy models (one file per entity) + mixins.py
│   │   ├── schemas/         # Marshmallow schemas for request validation
│   │   ├── routes/          # Blueprints (one file per resource) — the HTTP layer
│   │   ├── services/        # Business logic (Claude, Evolution, appointments, etc.)
│   │   ├── utils/           # Cross-cutting: auth, cache, rate limiting, errors, logging
│   │   └── templates/emails # Jinja2 HTML email templates
│   ├── migrations/          # Alembic migrations (versions/ holds each revision)
│   ├── tests/               # pytest suite (conftest.py has fixtures)
│   ├── run.py               # WSGI entrypoint: `app = create_app(...)`
│   ├── start.sh             # Prod startup: runs `flask db upgrade` then Gunicorn (gthread)
│   ├── requirements.txt
│   └── Dockerfile / Procfile / railway.json / runtime.txt
├── frontend/                # Next.js dashboard + public booking pages
│   └── src/
│       ├── app/             # App Router routes (see route groups below)
│       ├── components/      # Feature folders + ui/ (Radix-based primitives)
│       ├── hooks/           # useConversationStream, useConfirm, useDebounce
│       ├── lib/             # api.ts (axios client), auth.ts, validations.ts, utils
│       └── types/index.ts   # Shared TypeScript types
├── scripts/                 # One-off debug/seed scripts (run from backend/, not tests)
├── docker-compose.yml       # Local Postgres 16 only
├── render.yaml              # Render.com blueprint (backend + managed Postgres)
├── prompt.md                # Original product/spec brief (Portuguese) — historical context
└── *_DEPLOY.md              # Deploy guides: RENDER, RAILWAY, CLOUDFLARE
```

## Backend architecture & conventions

**Application factory.** `app/__init__.py` exposes `create_app(config_name)`.
Extensions (`db`, `migrate`, `jwt`) are module-level singletons initialized
inside the factory. Blueprints are all registered there — **when you add a new
route module, register its blueprint in `create_app`** (there are two
`register_blueprint` groups; add to the appropriate one).

**Layering.** Keep the separation:
- `routes/` = HTTP concerns only (parse request, auth, call a service, shape the
  JSON response). Each is a `Blueprint` with `url_prefix='/api/<resource>'`.
- `services/` = business logic. Services are **instantiated per-clinic**
  (`ServiceName(clinic)`) and hold no request state. Cross-service calls happen
  here (e.g. `ClaudeService` calls `AppointmentService`, `ConversationService`,
  `EvolutionService`).
- `models/` = persistence + light validation via `@validates`.

**Multi-tenancy.** Every domain row belongs to a `Clinic`. The JWT subject
(`get_jwt_identity()`) **is the clinic's UUID** — there is no separate users
table; a clinic account *is* the auth principal. Load the tenant with
`Clinic.query.get(get_jwt_identity())` and **always scope queries by
`clinic_id`**. Protect endpoints with `@jwt_required()`.

**Models.**
- Primary keys are `UUID` (`default=uuid.uuid4`); serialize as `str(self.id)`.
- Mixins in `models/mixins.py`: `TimestampMixin` (created_at/updated_at) and
  `SoftDeleteMixin` (adds `deleted_at`, `.soft_delete()`, `.restore()`). A
  custom `SoftDeleteQuery` auto-filters soft-deleted rows; use
  `.with_deleted()` to include them.
- Models expose a `to_dict()` method for serialization; sensitive fields are
  gated behind `include_sensitive=True` (and secrets are surfaced only as
  booleans like `has_evolution_key`, never the raw value).
- Status/enum values are plain classes with string constants (e.g.
  `AppointmentStatus`, `ConversationStatus`, `ReminderStatus`), not Python
  enums.
- Business config lives in JSONB columns on `Clinic` (`business_hours`,
  `services`).

**Validation.** Two coexisting styles — Marshmallow schemas in `schemas/`
(`BaseSchema` sets `unknown = EXCLUDE`) and manual field checks in some routes.
Prefer schemas for new endpoints. Reusable validators live in
`app/utils/validators.py` and `app/schemas/base.py`.

**The AI agent (`services/claude_service.py`).** This is the heart of the
product. It talks to the model through the `openai` SDK pointed at OpenRouter's
`base_url` (OpenAI-compatible chat-completions API), so `OPENROUTER_MODEL` can
be swapped to any provider OpenRouter offers with no code changes. It builds a
Portuguese system prompt from clinic config (`SYSTEM_PROMPT_TEMPLATE`) and
exposes a set of **tools** the model can call: `check_availability`,
`create_appointment`, `reschedule_appointment`, `confirm_appointment`,
`list_appointments`, `cancel_appointment`, `list_professionals`,
`get_current_datetime`, `update_patient_info`, `update_pipeline_stage`,
`resend_reminder`, `send_procedure_instructions`, `transfer_to_human`,
`send_booking_link`. Tools are declared in `_get_tools()` in Anthropic's
`{name, description, input_schema}` shape and converted to OpenAI's
function-calling format by `_to_openai_tools()` at the call site; dispatch
happens in `_execute_tool()`. **To add an agent capability: add the tool
schema in `_get_tools()`, add its branch in `_execute_tool()`, and (usually)
back it with a method on the relevant service.** The clinic can override
`agent_system_prompt`, `agent_context`, `agent_temperature`, and toggle
`agent_enabled`.

**WhatsApp (`services/evolution_service.py`).** Wraps Evolution API per clinic.
Each clinic gets an `evolution_instance_name` (auto-derived from clinic UUID if
unset). Global API URL/key come from config but can be overridden per clinic.
Inbound messages arrive at `routes/webhook.py` (`/api/webhook`), which resolves
the clinic by instance name, **stores the message synchronously** (dedup by
`evolution_message_id`; messages are never dropped, even with the agent off or
the conversation handed to a human) and returns 200 immediately. The AI reply
is generated by **`services/message_processor.py`**: a background worker with a
per-conversation quiet window (`MESSAGE_AGGREGATION_SECONDS`, Redis-coordinated
debounce with in-process fallback) that groups rapid-fire messages into one
reply, sends "typing..." presence, retries delivery with backoff and marks the
stored reply `failed` when the gateway is down. Patient **voice notes are
transcribed** (`AUDIO_TRANSCRIPTION_MODEL` via OpenRouter) so the bot keeps
handling them; other media hands off to a human. Inbound/outbound media bytes
are copied into `media_assets` (WhatsApp CDN URLs are E2E-encrypted and
expire) and served by `routes/media.py` (`/api/media/<id>`, JWT via header or
`?token=`). Message delivery ACKs update internal status via `ACK_STATUS_MAP`;
`connection.update` events persist `Clinic.whatsapp_connection_state`, publish
a `connection_status` SSE event (dashboard banner) and e-mail the clinic on
disconnect. Manual replies from the dashboard **pause the AI** (human
takeover) and are tagged `sent_via='dashboard'`.

**Realtime (`services/realtime_service.py`).** Live conversation updates use
SSE. Events are published to a Redis channel (`sdental:conversations:*`); when
`REDIS_URL` is unset it falls back to in-process pub/sub — **which only works
with a single Gunicorn worker.** The SSE stream authenticates via a
`?token=` query param because `EventSource` can't set headers (see
`JWT_QUERY_STRING_NAME = 'token'`).

**Background jobs (`scheduler.py`).** APScheduler runs reminder jobs
(send pending / retry failed) **and the autonomous-agent jobs** (recovery +
waitlist every 30 min, recall every 12h, funnel qualification every 2h, weekly
report daily). Gated by `ENABLE_SCHEDULER` (default on) and disabled under
`TESTING`. Note: with multiple Gunicorn workers this scheduler runs per-worker
— keep that in mind for idempotency (the autonomous jobs dedupe via
`agent_actions`).

**Autonomous / proactive layer.** Beyond the reactive WhatsApp agent, the system
can act on its own initiative:
- `services/outreach_service.py` — the single guarded gateway for every
  agent-initiated message. Enforces the guardrails (master switch
  `Clinic.proactive_outreach_enabled` — **off by default**, per-patient opt-out
  `Patient.whatsapp_opt_out` via replying "SAIR", quiet hours, a daily per-patient
  cap, and never interrupting a human handoff) and writes every send/skip to the
  `agent_actions` audit table (`models/agent_action.py`). Proactive messages only
  *open* a conversation — the actual booking still happens reactively when the
  patient replies, so the AI never takes an irreversible action unattended.
- `services/automation_service.py` — the scheduled behaviours (no-show/
  cancellation recovery, waitlist offers, recall of inactive patients, CRM funnel
  qualification, weekly performance digest) plus `collect_metrics()`, shared with
  the natural-language analytics endpoint.
- `ClaudeService` also exposes non-tool completions used by this layer
  (`generate_proactive_message`, `summarize_conversation_for_handoff`,
  `classify_conversation_funnel`, `answer_business_question`,
  `generate_report_digest`).
- `POST /api/analytics/ask` answers a clinic owner's natural-language question
  over their own metrics; `GET /api/analytics/agent-actions` is the audit feed.
- Per-clinic toggles live on `Clinic` and are edited from the dashboard
  **Configurações → Automação (IA proativa)** section.

**Cross-cutting utils.** Rate limiting (`utils/rate_limiter.py`, e.g.
`@limiter.limit("5 per minute")` on auth), caching (`utils/cache.py`),
structured logging (`utils/logging_config.py`), centralized error handlers
(`utils/error_handlers.py`), webhook auth (`utils/webhook_auth.py`).

## Frontend architecture & conventions

- **App Router with route groups.** `app/(auth)/` = login/register/password
  flows; `app/(dashboard)/` = the authenticated app (patients, appointments,
  conversations, pipeline, professionals, agents, settings, analytics home).
  `app/agendar/[slug]/` is the **public** per-clinic booking page; `privacidade`
  / `termos` are legal pages.
- **Auth** is JWT stored in `localStorage` (`access_token` / `refresh_token`)
  and managed by `AuthProvider` (`app/providers.tsx`, `useAuth()`). Helpers in
  `lib/auth.ts`. All calls are guarded with `typeof window !== 'undefined'`
  because of SSR.
- **API client** is a shared Axios instance (`lib/api.ts`) with interceptors
  that inject the bearer token and **transparently refresh on 401** (redirecting
  to `/login` on failure). Add new endpoints as grouped objects (e.g.
  `authApi`, `patientsApi`) in this file. Base URL from `NEXT_PUBLIC_API_URL`.
- **Components.** `components/ui/` are reusable primitives built on Radix +
  `class-variance-authority` + `tailwind-merge` (via `cn()` in `lib/utils.ts`).
  Feature components are grouped by domain (`patients/`, `conversations/`,
  `pipeline/`, etc.). Modals follow a `*-modal.tsx` naming pattern.
- **Forms** use React Hook Form + Zod (`@hookform/resolvers`), schemas in
  `lib/validations.ts`.
- **Realtime chat** consumes the SSE stream via `hooks/useConversationStream.ts`.
- Path alias `@/*` → `src/*`. TypeScript is `strict`.

## Development workflow

### Backend
```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # then fill in secrets

# Start Postgres (from repo root)
docker compose up -d postgres

flask db upgrade              # apply migrations
python run.py                 # dev server on http://localhost:5001 (debug)
```

### Frontend
```bash
cd frontend
npm install
npm run dev                   # http://localhost:3000
```

### Database migrations
Always use Alembic via Flask-Migrate — **never** hand-edit the schema or rely on
`db.create_all()` (that's only used for tests / quick local bootstrap in
`run.py`).
```bash
cd backend
flask db migrate -m "describe change"   # autogenerate a revision
flask db upgrade                         # apply
flask db downgrade                       # roll back one
```
Review autogenerated migrations before committing. Existing revisions live in
`backend/migrations/versions/`.

### Tests
```bash
cd backend
pytest                        # config in pytest.ini; -v --tb=short
pytest tests/test_auth.py     # single file
pytest --cov=app              # with coverage
```
Tests use the `testing` config with an **in-memory SQLite** DB and fixtures in
`tests/conftest.py` (`app`, `client`, `db_session`, `sample_clinic`, JWT auth
headers). The scheduler and config fail-fast checks are skipped under `TESTING`.

### Linting (frontend)
```bash
cd frontend
npm run lint                  # next lint / ESLint
npm run build                 # type-check + production build
```
There is no configured Python linter/formatter in the repo; match the existing
style (4-space indent, type hints, module-level `logger = logging.getLogger(__name__)`).

## Configuration & environment

Config is env-driven (`backend/app/config.py`, loaded via `python-dotenv`).
`config` dict selects `development` / `production` / `testing` by `FLASK_ENV`.
`validate_config(app)` **fails fast in production** on default secrets and warns
on missing integration keys.

Key variables (see `.env.example` / `backend/.env.example`):
- `DATABASE_URL`, `SECRET_KEY`, `JWT_SECRET_KEY` (required in prod)
- `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` (default `anthropic/claude-sonnet-4.5`), `OPENROUTER_BASE_URL`
- `EVOLUTION_API_URL`, `EVOLUTION_API_KEY` (WhatsApp; overridable per clinic)
- `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME` (email; logs only if unset)
- `REDIS_URL` (realtime + rate-limit storage; **required for multi-worker SSE**)
- `WEBHOOK_SECRET`, `BASE_URL`, `FRONTEND_URL`, `ALLOWED_ORIGINS`
- `ENABLE_SCHEDULER`, `CACHE_TYPE`, `SENTRY_DSN`
- Frontend: `NEXT_PUBLIC_API_URL`

## Deployment

- **Backend** deploys to Render (`render.yaml`) or Railway (`railway.json`,
  `Procfile`, `RAILWAY_DEPLOY.md`). Production start goes through `start.sh`,
  which runs `flask db upgrade` then Gunicorn with the **`gthread` worker class**
  (chosen so a single worker can hold the long-lived SSE connections). Docker
  build via `backend/Dockerfile`.
- **Frontend** targets Vercel or Cloudflare Pages (`CLOUDFLARE_DEPLOY.md`,
  `pages:build` script via `@cloudflare/next-on-pages`).
- `docker-compose.yml` provisions **only local Postgres**, not the app.

## Conventions & gotchas for AI assistants

- **Respect tenant isolation.** Any query touching patient/appointment/
  conversation data must be filtered by the authenticated clinic's `clinic_id`.
- **Add new blueprints to `create_app`** or they won't be reachable.
- **Portuguese for user-facing strings** (API error messages returned to users,
  email templates, agent prompts, frontend copy); English for code.
- **Never store or return raw secrets.** Follow the `Clinic.to_dict` pattern
  (booleans like `has_claude_key`); password-reset tokens are stored hashed.
- **Prefer services over fat routes**; instantiate them per-clinic.
- **Migrations, not `create_all`,** for any schema change in dev/prod.
- **SSE/realtime and the scheduler behave differently across Gunicorn workers**
  — assume Redis is present in production and keep scheduled jobs idempotent.
- `scripts/` are ad-hoc debug/seed utilities (many hardcode a test clinic email
  like `clinica@teste.com`); they are **not** part of the test suite or app
  runtime. The `.gitignore` intentionally excludes throwaway `check_*.py`,
  `fix_*.py`, `setup_*.py`, `update_*.py` files at the repo root.
- `prompt.md` is the original product brief and may drift from the current
  implementation — treat the code as the source of truth.
