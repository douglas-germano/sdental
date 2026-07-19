"""
Background pipeline for answering inbound WhatsApp messages.

The webhook stores the patient's message and returns 200 immediately; the AI
reply is generated here, off the request thread. A per-conversation quiet
window (MESSAGE_AGGREGATION_SECONDS) debounces rapid-fire messages so a burst
like "oi" / "queria marcar" / "pra amanhã" gets ONE combined reply instead of
three concurrent ones.

Coordination is Redis-first (deadline + lock keys, correct across Gunicorn
workers). Without Redis it falls back to per-process state - with more than
one worker a burst may split between processes, which degrades to at most one
reply per worker (still strictly better than today's one reply per message).

A window of 0 processes inline (synchronously, in the caller's thread): used
by the test suite and available as an escape hatch via
MESSAGE_AGGREGATION_SECONDS=0.
"""
import logging
import threading
import time
import uuid as uuid_lib
from concurrent.futures import ThreadPoolExecutor

from flask import current_app

from app import db
from app.models import Clinic, Conversation, ConversationStatus
from app.services.claude_service import ClaudeService
from app.services.conversation_service import ConversationService
from app.services.evolution_service import EvolutionService
from app.services.realtime_service import _get_redis_client

logger = logging.getLogger(__name__)

_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix='chat-worker')

# In-process fallback state (used when Redis is unavailable)
_local_lock = threading.Lock()
_local_deadlines: dict[str, float] = {}
_local_running: set[str] = set()

_DEADLINE_KEY = 'sdental:chat:deadline:{cid}'
_LOCK_KEY = 'sdental:chat:lock:{cid}'
_DEADLINE_TTL = 300          # seconds a pending-reply signal survives without a worker
_LOCK_TTL = 300              # worker lease; expires if the process dies mid-reply
_MAX_WAIT_EXTENSION = 30.0   # cap on how long a burst can keep extending the window

# Outbound send retry schedule (seconds between attempts)
_SEND_BACKOFF = (2, 4)


def _redis():
    return _get_redis_client()


# ---------------------------------------------------------------------------
# Debounce bookkeeping (Redis-first, in-process fallback)
# ---------------------------------------------------------------------------

def _set_deadline(cid: str, deadline: float) -> None:
    client = _redis()
    if client is not None:
        try:
            client.set(_DEADLINE_KEY.format(cid=cid), repr(deadline), ex=_DEADLINE_TTL)
            return
        except Exception as e:
            logger.warning('chat debounce: redis set failed, using local state (%s)', e)
    with _local_lock:
        _local_deadlines[cid] = deadline


def _get_deadline(cid: str):
    client = _redis()
    if client is not None:
        try:
            raw = client.get(_DEADLINE_KEY.format(cid=cid))
            return float(raw) if raw else None
        except Exception:
            pass
    with _local_lock:
        return _local_deadlines.get(cid)


def _clear_deadline(cid: str) -> None:
    client = _redis()
    if client is not None:
        try:
            client.delete(_DEADLINE_KEY.format(cid=cid))
            return
        except Exception:
            pass
    with _local_lock:
        _local_deadlines.pop(cid, None)


def _try_acquire_worker(cid: str) -> bool:
    """Elect exactly one worker per conversation (NX lock with a lease)."""
    client = _redis()
    if client is not None:
        try:
            return bool(client.set(_LOCK_KEY.format(cid=cid), uuid_lib.uuid4().hex, nx=True, ex=_LOCK_TTL))
        except Exception as e:
            logger.warning('chat debounce: redis lock failed, using local state (%s)', e)
    with _local_lock:
        if cid in _local_running:
            return False
        _local_running.add(cid)
        return True


def _release_worker(cid: str) -> None:
    client = _redis()
    if client is not None:
        try:
            client.delete(_LOCK_KEY.format(cid=cid))
        except Exception:
            pass
    with _local_lock:
        _local_running.discard(cid)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def enqueue_reply(clinic, conversation, phone: str) -> str:
    """
    Signal that `conversation` has fresh patient message(s) awaiting an AI
    reply. The message itself must already be stored - the worker rebuilds
    context from the conversation history.

    Returns 'inline' (processed synchronously), 'scheduled' (worker elected)
    or 'debounced' (an existing worker will pick the new message up).
    """
    window = float(current_app.config.get('MESSAGE_AGGREGATION_SECONDS', 8) or 0)
    cid = str(conversation.id)

    if window <= 0:
        _process_conversation_reply(current_app._get_current_object(), str(clinic.id), cid, phone)
        return 'inline'

    _set_deadline(cid, time.time() + window)

    if not _try_acquire_worker(cid):
        return 'debounced'

    app = current_app._get_current_object()
    clinic_id = str(clinic.id)

    # Show "typing..." to the patient right away - the reply is `window`+LLM
    # seconds out, and silence is when patients start double-texting.
    _executor.submit(_send_presence_safe, app, clinic_id, phone, int((window + 15) * 1000))
    _executor.submit(_worker_loop, app, clinic_id, cid, phone)
    return 'scheduled'


def _send_presence_safe(app, clinic_id: str, phone: str, delay_ms: int) -> None:
    with app.app_context():
        try:
            clinic = db.session.get(Clinic, clinic_id)
            if clinic:
                EvolutionService(clinic).send_presence(phone, 'composing', delay_ms)
        except Exception as e:
            logger.debug('presence task failed (non-fatal): %s', e)


def _worker_loop(app, clinic_id: str, cid: str, phone: str) -> None:
    """
    Wait out the quiet window (which later messages may keep extending, up to
    a cap), then generate and send one reply. Loops in case new messages
    arrived while the LLM was already answering.
    """
    with app.app_context():
        try:
            started = time.time()
            while True:
                deadline = _get_deadline(cid)
                if deadline is None:
                    return
                now = time.time()
                effective = min(deadline, started + _MAX_WAIT_EXTENSION)
                if now < effective:
                    time.sleep(min(effective - now, 1.0))
                    continue

                _clear_deadline(cid)
                _process_conversation_reply(app, clinic_id, cid, phone)
                started = time.time()
                # Re-check: a message that arrived mid-reply set a new deadline.
                if _get_deadline(cid) is None:
                    return
        except Exception:
            logger.exception('chat worker crashed for conversation %s', cid)
        finally:
            _release_worker(cid)


def _process_conversation_reply(app, clinic_id: str, cid: str, phone: str) -> None:
    """Generate the AI reply for the conversation's current state and send it."""
    with app.app_context():
        clinic = db.session.get(Clinic, clinic_id)
        conversation = db.session.get(Conversation, cid)
        if not clinic or not conversation:
            return
        # Re-check state: it may have changed while the message waited in the
        # window (human takeover, agent switched off, resolved).
        if not clinic.agent_enabled or conversation.status != ConversationStatus.ACTIVE:
            logger.info('Skipping AI reply for conversation %s (state changed)', cid)
            return

        conversation_service = ConversationService(clinic)
        try:
            reply_text = ClaudeService(clinic).process_message(conversation, store_user_message=False)
        except Exception:
            # Anything process_message doesn't already handle internally
            # (its own try/except covers OpenRouter call failures) - most
            # commonly ClaudeService's constructor raising ValueError for a
            # missing/invalid OPENROUTER_API_KEY. Without this, the patient
            # gets silence: the exception would otherwise only surface as a
            # log line in _worker_loop's catch-all, with no message sent and
            # no visible failure anywhere in the dashboard.
            logger.exception(
                'Failed to generate AI reply for conversation %s (clinic %s) - '
                'check OPENROUTER_API_KEY / clinic.openrouter_api_key',
                cid, clinic_id
            )
            reply_text = (
                "Desculpe, estou com dificuldades técnicas no momento. "
                "Por favor, tente novamente em alguns instantes."
            )
        if not reply_text:
            return

        # On LLM API errors process_message returns an apology WITHOUT storing
        # it - store it here so the dashboard reflects what the patient gets.
        messages = conversation.messages or []
        if not messages or messages[-1].get('role') != 'assistant':
            conversation_service.add_message(conversation, 'assistant', reply_text)
            messages = conversation.messages or []
        reply_msg = messages[-1]

        result = _send_with_retry(EvolutionService(clinic), phone, reply_text)

        if isinstance(result, dict) and not result.get('error'):
            reply_evolution_id = (result.get('key') or {}).get('id')
            if reply_evolution_id:
                conversation_service.attach_evolution_id_to_last_reply(conversation, reply_evolution_id)
        else:
            error = (result or {}).get('error', 'unknown')
            logger.error(
                'Failed to deliver AI reply for conversation %s after retries: %s', cid, error
            )
            conversation_service.update_message_status(conversation, reply_msg.get('id'), 'failed')


def _send_with_retry(evolution, phone: str, text: str) -> dict:
    """Send a WhatsApp text with bounded retries; returns the last result."""
    result = evolution.send_message(phone, text)
    for backoff in _SEND_BACKOFF:
        if isinstance(result, dict) and not result.get('error'):
            return result
        time.sleep(backoff)
        result = evolution.send_message(phone, text)
    return result
