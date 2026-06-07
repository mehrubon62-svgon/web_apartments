"""Realtime layer: WebSocket connections + Redis pub/sub bridge.

The brief asks for Supabase Realtime. To keep the project self-contained and
free to run locally, we implement the same behaviour (server-pushed, no polling)
with a WebSocket endpoint plus a Redis pub/sub channel.

Why Redis pub/sub: Celery workers run in separate processes and cannot touch the
in-memory WebSocket connections held by the API process. They publish events to
Redis; the API process subscribes and fans them out to the right sockets.
"""
from __future__ import annotations

import asyncio
import json
from typing import Any

import redis.asyncio as aioredis
from fastapi import WebSocket

from config import REDIS_URL

CHANNEL = "realtime:events"


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[int, set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, user_id: int, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._connections.setdefault(user_id, set()).add(ws)

    async def disconnect(self, user_id: int, ws: WebSocket) -> None:
        async with self._lock:
            sockets = self._connections.get(user_id)
            if not sockets:
                return
            sockets.discard(ws)
            if not sockets:
                self._connections.pop(user_id, None)

    def is_online(self, user_id: int) -> bool:
        return user_id in self._connections

    async def send_local(self, user_id: int, payload: dict[str, Any]) -> None:
        """Deliver to sockets connected to THIS process."""
        for ws in list(self._connections.get(user_id, ())):
            try:
                await ws.send_json(payload)
            except Exception:
                await self.disconnect(user_id, ws)


manager = ConnectionManager()


async def _redis() -> "aioredis.Redis":
    return aioredis.from_url(REDIS_URL, decode_responses=True)


async def publish_event(user_id: int, event: str, data: dict[str, Any]) -> None:
    """Publish a realtime event from anywhere (API or, via the sync helper, Celery)."""
    r = await _redis()
    try:
        await r.publish(CHANNEL, json.dumps({"user_id": user_id, "event": event, "data": data}))
    finally:
        await r.aclose()


async def pubsub_listener() -> None:
    """Background task: relay Redis events to local WebSocket connections."""
    r = await _redis()
    pubsub = r.pubsub()
    await pubsub.subscribe(CHANNEL)
    try:
        async for message in pubsub.listen():
            if message.get("type") != "message":
                continue
            try:
                payload = json.loads(message["data"])
            except (ValueError, KeyError):
                continue
            user_id = payload.get("user_id")
            if user_id is None:
                continue
            await manager.send_local(
                int(user_id),
                {"event": payload.get("event"), "data": payload.get("data", {})},
            )
    finally:
        await pubsub.aclose()
        await r.aclose()


def publish_event_sync(user_id: int, event: str, data: dict[str, Any]) -> bool:
    """Synchronous publish for Celery workers (no running event loop).

    Best-effort: realtime delivery is a bonus on top of the persisted record, so a
    missing/unreachable Redis must never break the calling request or task.
    Returns True if the event was published.
    """
    import redis as sync_redis

    try:
        client = sync_redis.from_url(REDIS_URL, decode_responses=True, socket_connect_timeout=2)
    except Exception:
        return False
    try:
        client.publish(CHANNEL, json.dumps({"user_id": user_id, "event": event, "data": data}))
        return True
    except Exception:
        return False
    finally:
        try:
            client.close()
        except Exception:
            pass
