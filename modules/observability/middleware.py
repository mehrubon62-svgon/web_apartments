"""Request logging + a per-request correlation ID.

Adds an X-Request-ID header (incoming one is reused if present) and logs each
request with method, path, status and duration. Useful for debugging and to show
'what happens under the hood' during a demo.
"""
from __future__ import annotations

import logging
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

logger = logging.getLogger("nestora.request")


def configure_logging(level: int = logging.INFO) -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)s [%(name)s] %(message)s", "%H:%M:%S")
    )
    root = logging.getLogger("nestora")
    if not root.handlers:
        root.addHandler(handler)
    root.setLevel(level)


class RequestLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:12]
        request.state.request_id = request_id
        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            elapsed = (time.perf_counter() - start) * 1000
            logger.exception(
                "rid=%s %s %s -> 500 in %.1fms",
                request_id, request.method, request.url.path, elapsed,
            )
            raise
        elapsed = (time.perf_counter() - start) * 1000
        logger.info(
            "rid=%s %s %s -> %s in %.1fms",
            request_id, request.method, request.url.path, response.status_code, elapsed,
        )
        response.headers["X-Request-ID"] = request_id
        return response
