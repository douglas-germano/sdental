import json
import logging
import queue
import threading
import time

from flask import current_app

logger = logging.getLogger(__name__)

# In-process fallback pub/sub, used when REDIS_URL is not configured.
# Works correctly within a single worker process only.
_local_subscribers: dict[str, list] = {}
_local_lock = threading.Lock()

_KEEPALIVE_INTERVAL = 20  # seconds between keep-alive pings on idle streams
_CHANNEL_PREFIX = 'sdental:conversations:'

_redis_client = None
_redis_client_checked = False


def _get_redis_client():
    """Return a shared redis client, or None if REDIS_URL is not configured/unreachable."""
    global _redis_client, _redis_client_checked

    if _redis_client_checked:
        return _redis_client

    _redis_client_checked = True
    redis_url = current_app.config.get('REDIS_URL')
    if not redis_url:
        return None

    try:
        import redis
        client = redis.from_url(redis_url, socket_connect_timeout=2, socket_timeout=None)
        client.ping()
        _redis_client = client
    except Exception as e:
        logger.warning('Realtime: redis unavailable, falling back to in-process pub/sub (%s)', e)
        _redis_client = None

    return _redis_client


def publish_event(clinic_id: str, event_type: str, payload: dict) -> None:
    """Publish a realtime event for a clinic. Safe to call even if no subscribers exist."""
    channel = f'{_CHANNEL_PREFIX}{clinic_id}'
    message = json.dumps({'type': event_type, 'payload': payload})

    client = _get_redis_client()
    if client is not None:
        try:
            client.publish(channel, message)
            return
        except Exception as e:
            logger.warning('Realtime: failed to publish via redis, falling back locally (%s)', e)

    with _local_lock:
        for q in _local_subscribers.get(str(clinic_id), []):
            q.put(message)


def subscribe(clinic_id: str):
    """
    Generator yielding raw SSE-formatted strings for the given clinic.
    Blocks between events; sends periodic keep-alive comments to keep the connection open.
    """
    clinic_id = str(clinic_id)
    client = _get_redis_client()

    if client is not None:
        yield from _subscribe_redis(client, clinic_id)
    else:
        yield from _subscribe_local(clinic_id)


def _subscribe_redis(client, clinic_id: str):
    pubsub = client.pubsub()
    channel = f'{_CHANNEL_PREFIX}{clinic_id}'
    pubsub.subscribe(channel)
    try:
        yield ': connected\n\n'
        while True:
            message = pubsub.get_message(ignore_subscribe_messages=True, timeout=_KEEPALIVE_INTERVAL)
            if message is None:
                yield ': keep-alive\n\n'
                continue
            data = message['data']
            if isinstance(data, bytes):
                data = data.decode('utf-8')
            yield _format_sse(data)
    finally:
        try:
            pubsub.unsubscribe(channel)
            pubsub.close()
        except Exception:
            pass


def _subscribe_local(clinic_id: str):
    q = queue.Queue()
    with _local_lock:
        _local_subscribers.setdefault(clinic_id, []).append(q)

    try:
        yield ': connected\n\n'
        while True:
            try:
                data = q.get(timeout=_KEEPALIVE_INTERVAL)
                yield _format_sse(data)
            except queue.Empty:
                yield ': keep-alive\n\n'
    finally:
        with _local_lock:
            subscribers = _local_subscribers.get(clinic_id, [])
            if q in subscribers:
                subscribers.remove(q)


def _format_sse(raw_json: str) -> str:
    try:
        event = json.loads(raw_json)
    except (TypeError, ValueError):
        return ': malformed-event\n\n'
    event_type = event.get('type', 'message')
    payload = json.dumps(event.get('payload', {}))
    return f'event: {event_type}\ndata: {payload}\n\n'
