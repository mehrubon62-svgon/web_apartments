"""AI Review of a property listing.

Combines deterministic market statistics (computed in crud) with an LLM verdict.
The AI judges whether the listing is a good deal, overpriced, or a likely scam,
and explains why. If AI is unavailable, a rule-based heuristic is returned so the
endpoint always works.
"""
from __future__ import annotations

import json

from sqlalchemy.orm import Session

from models import Property
from modules.properties.crud import market_stats, heuristic_review
from config import AI_RECOMMEND_MODEL


VALID_VERDICTS = {
    "great_deal", "fair", "overpriced", "suspicious", "likely_scam", "insufficient_data",
}
VALID_RISK = {"low", "medium", "high", "unknown"}

_REVIEW_CACHE: dict[tuple, tuple[float, dict]] = {}
_REVIEW_TTL = 1800.0


def review_property(db: Session, prop: Property, lang: str = "en") -> dict:
    import time
    key = (prop.id, round(prop.price, 2), lang)
    cached = _REVIEW_CACHE.get(key)
    if cached and (time.time() - cached[0]) < _REVIEW_TTL:
        return cached[1]
    result = _compute_review(db, prop, lang)
    if result.get("ai_used"):
        _REVIEW_CACHE[key] = (time.time(), result)
        if len(_REVIEW_CACHE) > 500:
            _REVIEW_CACHE.clear()
    return result


def _compute_review(db: Session, prop: Property, lang: str = "en") -> dict:
    stats = market_stats(db, prop)
    base = heuristic_review(prop, stats)

    from modules.ai.service import chat, is_configured, AIError

    if not is_configured():
        base["ai_used"] = False
        base["market"] = stats
        return base

    listing = {
        "title": prop.title,
        "type": prop.type.value,
        "deal_type": prop.deal_type.value,
        "price": prop.price,
        "area_sqm": prop.area,
        "rooms": prop.rooms,
        "address": prop.address,
        "has_description": bool(prop.description),
        "has_location": bool(prop.lat and prop.lng),
    }

    lang_name = "Russian" if lang == "ru" else "English"
    prompt = (
        "You are a property valuation analyst. Assess ONE listing for value and fraud risk "
        "using the market stats provided. Judge ONLY from the given data — never invent facts.\n"
        "\n"
        "How to decide:\n"
        "- price_ratio_vs_median tells how this price compares to similar active listings.\n"
        "- Far BELOW market (ratio <= ~0.6) => strong scam signal: verdict 'likely_scam' or "
        "'suspicious', scam_risk high.\n"
        "- Moderately below market with no red flags => 'great_deal'.\n"
        "- Near market (~0.9-1.1) => 'fair'. Clearly above (ratio >= ~1.25) => 'overpriced'.\n"
        "- Missing description or coordinates raises risk slightly.\n"
        "- If comparables_count is 0, use 'insufficient_data' and scam_risk 'unknown'.\n"
        "deal_score: 0-100 where higher = better value for the buyer.\n"
        "\n"
        f"Write summary/pros/cons/red_flags in {lang_name}. Be specific and useful, not generic: "
        "cite the concrete numbers (price vs median, price per m²). No filler.\n"
        "Limits: summary <= 18 words; <= 3 items per list; each item <= 8 words; "
        "red_flags only when genuinely warranted (else empty).\n"
        "Return STRICT JSON only, no prose, no markdown:\n"
        '{"verdict":"great_deal|fair|overpriced|suspicious|likely_scam|insufficient_data",'
        '"deal_score":0-100,"scam_risk":"low|medium|high|unknown",'
        '"summary":"","pros":[],"cons":[],"red_flags":[]}\n'
        f"Listing: {json.dumps(listing, ensure_ascii=False)}\n"
        f"Market: {json.dumps(stats, ensure_ascii=False)}"
    )

    try:
        raw = chat(
            [{"role": "user", "content": prompt}],
            temperature=0.1, model=AI_RECOMMEND_MODEL, max_tokens=320, timeout=20.0,
        )
        parsed = _parse(raw)
    except AIError:
        parsed = None

    if not parsed:
        base["ai_used"] = False
        base["market"] = stats
        return base

    parsed["ai_used"] = True
    parsed["market"] = stats
    return parsed


def _parse(raw: str) -> dict | None:
    try:
        start = raw.find("{")
        end = raw.rfind("}")
        if start == -1 or end == -1:
            return None
        obj = json.loads(raw[start : end + 1])
    except (ValueError, KeyError):
        return None

    verdict = str(obj.get("verdict", "")).lower()
    if verdict not in VALID_VERDICTS:
        return None
    risk = str(obj.get("scam_risk", "unknown")).lower()
    if risk not in VALID_RISK:
        risk = "unknown"
    try:
        score = int(obj.get("deal_score", 50))
    except (ValueError, TypeError):
        score = 50
    score = max(0, min(100, score))

    def _list(x):
        return [str(i) for i in x] if isinstance(x, list) else []

    return {
        "verdict": verdict,
        "deal_score": score,
        "scam_risk": risk,
        "summary": str(obj.get("summary", "")).strip(),
        "pros": _list(obj.get("pros")),
        "cons": _list(obj.get("cons")),
        "red_flags": _list(obj.get("red_flags")),
    }
