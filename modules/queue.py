"""Safe Celery enqueue helper.

`.delay()` blocks for ~tens of seconds retrying the broker/result backend when
Redis is unreachable, which would stall every HTTP request that enqueues a task
(opening a listing, posting a complaint, asking Spatial Q&A, sending a code).

This module gates enqueueing behind a *cached* Redis health check so that:
  - when Redis is up: tasks are enqueued normally;
  - when Redis is down: we skip instantly (no multi-second hang) and optionally
    run a synchronous fallback so the feature still works in dev.

The health check result is cached for a short TTL to avoid pinging Redis on
every call.
"""
from __future__ import annotations

import time
import threading
from typing import Callable

from config import REDIS_URL

_CACHE_TTL = 10.0          # seconds to trust a health-check result
_PING_TIMEOUT = 0.5        # seconds for the Redis ping itself

_lock = threading.Lock()
_last_check = 0.0
_last_ok = False


def redis_available(force: bool = False) -> bool:
    """Return whether Redis is reachable, caching the result for a few seconds."""
    global _last_check, _last_ok
    now = time.time()
    with _lock:
        if not force and (now - _last_check) < _CACHE_TTL:
            return _last_ok
    ok = False
    try:
        import redis as sync_redis

        client = sync_redis.from_url(
            REDIS_URL, socket_connect_timeout=_PING_TIMEOUT, socket_timeout=_PING_TIMEOUT
        )
        ok = bool(client.ping())
        client.close()
    except Exception:
        ok = False
    with _lock:
        _last_check = time.time()
        _last_ok = ok
    return ok


def enqueue(task, *args, fallback: Callable[[], None] | None = None, **kwargs) -> bool:
    """Enqueue a Celery task without ever blocking the request.

    Returns True if the task was handed off to Celery. If Redis is down, runs
    `fallback` (if given) synchronously in a background thread and returns False.
    """
    if redis_available():
        try:
            task.delay(*args, **kwargs)
            return True
        except Exception:
            # Broker went away between the health check and now — fall through.
            pass

    if fallback is not None:
        threading.Thread(target=_safe, args=(fallback,), daemon=True).start()
    return False


def _safe(fn: Callable[[], None]) -> None:
    try:
        fn()
    except Exception:
        pass
