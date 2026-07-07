"""
Token/cost usage tracking for AI (OpenRouter) calls.

Before this existed, `response.usage` from every completion call was
discarded - there was no way to see how many tokens (or dollars) a clinic's
AI usage was actually costing without leaving the app and checking the
OpenRouter dashboard. `record_ai_usage` is called after every completion
call in ClaudeService/AssistantService/the automation one-shot completions
to persist that into `ai_usage_logs`.

Pass `extra_body={"usage": USAGE_INCLUDE_COST}` on every
`chat.completions.create(...)` call so OpenRouter includes `usage.cost` -
its own dollar figure for that call, already accounting for the specific
model's pricing and any prompt-cache discount (far more useful than a raw
token count for answering "am I wasting money").
"""
import logging

from app import db
from app.models import AiUsageLog

logger = logging.getLogger(__name__)

# Pass as extra_body={"usage": USAGE_INCLUDE_COST} on chat.completions.create
# calls routed through OpenRouter to get usage.cost back on the response.
USAGE_INCLUDE_COST = {"include": True}


def record_ai_usage(clinic_id, service: str, task: str, model: str, response) -> None:
    """
    Persist the token/cost usage of a completion response. Best-effort and
    defensive: usage tracking must never break the AI call it's measuring,
    so any failure here is logged and swallowed.
    """
    try:
        usage = getattr(response, 'usage', None)
        if usage is None:
            return

        cached_tokens = None
        details = getattr(usage, 'prompt_tokens_details', None)
        if details is not None:
            cached_tokens = getattr(details, 'cached_tokens', None)

        log = AiUsageLog(
            clinic_id=clinic_id,
            service=service,
            task=task,
            model=model,
            prompt_tokens=getattr(usage, 'prompt_tokens', None),
            completion_tokens=getattr(usage, 'completion_tokens', None),
            total_tokens=getattr(usage, 'total_tokens', None),
            cached_tokens=cached_tokens,
            cost_usd=getattr(usage, 'cost', None),
        )
        db.session.add(log)
        db.session.commit()

        logger.info(
            'ai_usage clinic=%s service=%s task=%s model=%s total_tokens=%s cached_tokens=%s cost_usd=%s',
            clinic_id, service, task, model, log.total_tokens, log.cached_tokens, log.cost_usd,
        )
    except Exception:
        db.session.rollback()
        logger.exception('Failed to record AI usage (clinic=%s service=%s task=%s)', clinic_id, service, task)
