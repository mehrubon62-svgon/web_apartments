"""Lightweight per-user rate limiting.

Fixed-window counter in Redis (atomic INCR + EXPIRE). Protects the AI endpoints
so a demo doesn't burn through the free OpenRouter quota. If Redis is
unavailable, falls back to an in-process counter so the limit still applies
within a single worker.

Usage:
    @router.post(...)
    def endpoint(..., _rl = Depends(rate_limit("agent", limit=20, window=60))):
        ...
"""
from __future__ import annotations

import time

from fastapi import Depends, HTTPException

from config import REDIS_URL, AI_RATE_LIMIT, AI_RATE_WINDOW_SEC
from models import User
from dependencies import get_current_user

_local: dict[str, tuple[int, float]] = {}


def _check_local(key: str, limit: int, window: int) -> bool:
    now = time.time()
    count, reset = _local.get(key, (0, now + window))
    if now > reset:
        count, reset = 0, now + window
    count += 1
    _local[key] = (count, reset)
    return count <= limit


def _check_redis(key: str, limit: int, window: int) -> bool | None:
    """Returns True/False if Redis answered, None if Redis is unavailable."""
    try:
        import redis as sync_redis

        client = sync_redis.from_url(REDIS_URL, decode_responses=True, socket_connect_timeout=2)
    except Exception:
        return None
    try:
        current = client.incr(key)
        if current == 1:
            client.expire(key, window)
        return current <= limit
    except Exception:
        return None
    finally:
        try:
            client.close()
        except Exception:
            pass


def rate_limit(bucket: str, limit: int | None = None, window: int | None = None):
    """Build a FastAPI dependency that enforces `limit` requests per `window` seconds."""
    eff_limit = limit if limit is not None else AI_RATE_LIMIT
    eff_window = window if window is not None else AI_RATE_WINDOW_SEC

    def dependency(current_user: User = Depends(get_current_user)) -> User:
        key = f"ratelimit:{bucket}:{current_user.id}"
        allowed = _check_redis(key, eff_limit, eff_window)
        if allowed is None:
            allowed = _check_local(key, eff_limit, eff_window)
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded: max {eff_limit} requests per {eff_window}s. Try again shortly.",
                headers={"Retry-After": str(eff_window)},
            )
        return current_user

    return dependency
