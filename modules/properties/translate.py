"""AI translation of listing title + description.

Detects the source language (Cyrillic => Russian, else English) and, if it
differs from the requested target, asks the AI to translate. Results are cached
in-process so re-opening a listing is instant. If AI is unavailable, the original
text is returned unchanged.
"""
from __future__ import annotations

import json
import time

from models import Property
from config import AI_RECOMMEND_MODEL


_CACHE: dict[tuple, tuple[float, dict]] = {}
_TTL = 3600.0


def _detect_lang(text: str) -> str:
    return "ru" if any("\u0400" <= ch <= "\u04FF" for ch in (text or "")) else "en"


_TEXT_CACHE: dict[tuple, tuple[float, dict]] = {}


def translate_text(text: str, target: str) -> dict:
    """Translate an arbitrary short text (e.g. a review) into the target language.

    Returns {"text", "source_lang", "target_lang", "translated"}. If the text is
    already in the target language or AI is unavailable, returns it unchanged.
    """
    text = (text or "").strip()
    target = "ru" if target == "ru" else "en"
    source = _detect_lang(text)
    base = {"text": text, "source_lang": source, "target_lang": target, "translated": False}
    if not text or source == target:
        return base

    key = (hash(text), target)
    cached = _TEXT_CACHE.get(key)
    if cached and (time.time() - cached[0]) < _TTL:
        return cached[1]

    from modules.ai.service import chat, is_configured, AIError
    if not is_configured():
        return base

    target_name = "Russian" if target == "ru" else "English"
    prompt = (
        f"Translate the following text into {target_name}. Keep the tone natural and faithful, "
        "preserve meaning. Return ONLY the translated text, no quotes, no commentary.\n\n"
        f"{text}"
    )
    try:
        out = chat([{"role": "user", "content": prompt}], temperature=0.2,
                   model=AI_RECOMMEND_MODEL, max_tokens=400, timeout=18.0).strip()
    except AIError:
        return base
    if not out:
        return base
    result = {"text": out, "source_lang": source, "target_lang": target, "translated": True}
    _TEXT_CACHE[key] = (time.time(), result)
    if len(_TEXT_CACHE) > 1000:
        _TEXT_CACHE.clear()
    return result


def translate_property(prop: Property, target: str) -> dict:
    title = prop.title or ""
    description = prop.description or ""
    source = _detect_lang(title + " " + description)

    base = {
        "title": title,
        "description": description or None,
        "target_lang": target,
        "source_lang": source,
        "translated": False,
    }

    # Already in the target language -> nothing to do.
    if source == target:
        return base

    key = (prop.id, round(prop.updated_at.timestamp()) if prop.updated_at else 0, target)
    cached = _CACHE.get(key)
    if cached and (time.time() - cached[0]) < _TTL:
        return cached[1]

    from modules.ai.service import chat, is_configured, AIError

    if not is_configured():
        return base

    target_name = "Russian" if target == "ru" else "English"
    payload = {"title": title, "description": description}
    prompt = (
        f"Translate this real-estate listing into {target_name}. Keep it natural and faithful; "
        "preserve meaning, tone and any numbers/units. Do not add or remove information, do not "
        "add commentary. Return STRICT JSON only:\n"
        '{"title":"...","description":"..."}\n'
        f"Listing: {json.dumps(payload, ensure_ascii=False)}"
    )
    try:
        raw = chat([{"role": "user", "content": prompt}], temperature=0.2,
                   model=AI_RECOMMEND_MODEL, max_tokens=700, timeout=20.0)
        s, e = raw.find("{"), raw.rfind("}")
        obj = json.loads(raw[s:e + 1]) if s != -1 and e != -1 else {}
    except (AIError, ValueError, KeyError):
        return base

    t_title = str(obj.get("title") or title).strip()
    t_desc = str(obj.get("description") or "").strip()
    result = {
        "title": t_title or title,
        "description": (t_desc or None) if description else None,
        "target_lang": target,
        "source_lang": source,
        "translated": True,
    }
    _CACHE[key] = (time.time(), result)
    if len(_CACHE) > 500:
        _CACHE.clear()
    return result
