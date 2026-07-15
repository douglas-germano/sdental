"""
Cross-process exclusivity for scheduled jobs.

start.sh runs Gunicorn with 2+ workers and each worker process starts its own
APScheduler, so every job tick fires once PER WORKER at (almost) the same
instant. Without coordination that means duplicate reminder sends and
duplicate proactive outreach.

`try_acquire(job_id, ttl)` elects exactly one runner per tick:

- With Redis configured (production): SET NX EX - correct across workers AND
  across containers/instances.
- Without Redis: a non-blocking flock on a lock file - correct across the
  worker processes of a single container (the deploy shape of the Render/
  Railway blueprints). The file lock is released explicitly and also
  automatically if the process dies.

Returns a zero-argument release callable when acquired, or None when another
process already holds the job.
"""
import fcntl
import logging
import os
import tempfile
import uuid

from app.services.realtime_service import _get_redis_client

logger = logging.getLogger(__name__)

_REDIS_KEY = 'sdental:job-lock:{job_id}'


def try_acquire(job_id: str, ttl_seconds: int = 900):
    """Try to become the single runner for this job tick."""
    client = _get_redis_client()
    if client is not None:
        try:
            token = uuid.uuid4().hex
            key = _REDIS_KEY.format(job_id=job_id)
            if not client.set(key, token, nx=True, ex=ttl_seconds):
                return None

            def release():
                try:
                    # Only delete our own lock (another tick may hold it by
                    # now if this run outlived the TTL).
                    if client.get(key) == token.encode():
                        client.delete(key)
                except Exception:
                    pass

            return release
        except Exception as e:
            logger.warning('job lock: redis unavailable, using file lock (%s)', e)

    lock_path = os.path.join(tempfile.gettempdir(), f'sdental-job-{job_id}.lock')
    fd = open(lock_path, 'w')
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        fd.close()
        return None

    def release():
        try:
            fcntl.flock(fd, fcntl.LOCK_UN)
        finally:
            fd.close()

    return release
