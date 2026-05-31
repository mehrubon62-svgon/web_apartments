"""Provider-agnostic AI layer.

Talks to any OpenAI-compatible endpoint. Defaults target OpenRouter's free tier
(see config.AI_*), but switching to Claude/Gemini/OpenAI is just env vars.

Three entry points:
    chat(messages)                      -> plain text answer
    chat_with_tools(messages, tools)    -> may return tool calls (function calling)
    ask_with_image(image_b64, question) -> vision (used by Spatial Q&A)

All network access is wrapped so a missing key / offline run degrades gracefully
instead of crashing the request.
"""
from __future__ import annotations

import json
from typing import Any

import httpx

from config import (
    AI_API_KEY,
    AI_BASE_URL,
    AI_MODEL,
    AI_VISION_MODEL,
    AI_MAX_TOKENS,
    AI_APP_URL,
    AI_APP_TITLE,
)


class AIError(Exception):
    pass


def _headers() -> dict[str, str]:
    headers = {
        "Authorization": f"Bearer {AI_API_KEY}",
        "Content-Type": "application/json",
        # OpenRouter attribution (harmless for other providers)
        "HTTP-Referer": AI_APP_URL,
        "X-Title": AI_APP_TITLE,
    }
    return headers


def is_configured() -> bool:
    return bool(AI_API_KEY)


def _post(payload: dict[str, Any], timeout: float = 60.0) -> dict[str, Any]:
    if not is_configured():
        raise AIError("AI is not configured. Set AI_API_KEY in your environment.")
    url = f"{AI_BASE_URL.rstrip('/')}/chat/completions"
    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.post(url, headers=_headers(), json=payload)
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPStatusError as exc:
        raise AIError(f"AI provider error {exc.response.status_code}: {exc.response.text[:300]}") from exc
    except httpx.HTTPError as exc:
        raise AIError(f"AI request failed: {exc}") from exc


def chat(messages: list[dict[str, Any]], temperature: float = 0.4) -> str:
    """Plain text completion."""
    data = _post(
        {
            "model": AI_MODEL,
            "messages": messages,
            "max_tokens": AI_MAX_TOKENS,
            "temperature": temperature,
        }
    )
    return _first_text(data)


def chat_with_tools(
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]],
    temperature: float = 0.2,
) -> dict[str, Any]:
    """Function-calling turn.

    Returns the raw assistant message dict, which may contain `tool_calls`.
    The caller is responsible for executing tools and (optionally) looping back.
    """
    data = _post(
        {
            "model": AI_MODEL,
            "messages": messages,
            "tools": tools,
            "tool_choice": "auto",
            "max_tokens": AI_MAX_TOKENS,
            "temperature": temperature,
        }
    )
    choices = data.get("choices") or []
    if not choices:
        return {"role": "assistant", "content": ""}
    return choices[0].get("message", {"role": "assistant", "content": ""})


def ask_with_image(
    image_b64: str,
    question: str,
    metadata: dict[str, Any] | None = None,
    media_type: str = "image/jpeg",
) -> str:
    """Vision call. `image_b64` is base64-encoded image bytes (no data: prefix)."""
    context = ""
    if metadata:
        context = "Property context:\n" + json.dumps(metadata, ensure_ascii=False) + "\n\n"
    content = [
        {
            "type": "text",
            "text": (
                f"{context}You are a real-estate expert. The user selected a zone in a "
                f"360° tour. Answer specifically about that zone (materials, approximate "
                f"dimensions, condition, replacement cost). Question: {question}"
            ),
        },
        {
            "type": "image_url",
            "image_url": {"url": f"data:{media_type};base64,{image_b64}"},
        },
    ]
    data = _post(
        {
            "model": AI_VISION_MODEL,
            "messages": [{"role": "user", "content": content}],
            "max_tokens": AI_MAX_TOKENS,
            "temperature": 0.3,
        }
    )
    return _first_text(data)


def _first_text(data: dict[str, Any]) -> str:
    choices = data.get("choices") or []
    if not choices:
        return ""
    message = choices[0].get("message", {})
    content = message.get("content", "")
    # Some providers return content as a list of blocks
    if isinstance(content, list):
        parts = [b.get("text", "") for b in content if isinstance(b, dict)]
        return "".join(parts).strip()
    return (content or "").strip()
