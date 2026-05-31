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


def review_property(db: Session, prop: Property) -> dict:
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

    prompt = (
        "You are a real-estate analyst. Review ONE listing for value and fraud risk, "
        "using the market stats provided. A price far below comparable listings is a "
        "strong scam signal; a price well above market means overpriced.\n"
        "Reply with STRICT JSON only:\n"
        '{"verdict":"great_deal|fair|overpriced|suspicious|likely_scam|insufficient_data",'
        '"deal_score":0-100,"scam_risk":"low|medium|high|unknown",'
        '"summary":"1-2 sentences","pros":["..."],"cons":["..."],"red_flags":["..."]}\n\n'
        f"Listing: {json.dumps(listing, ensure_ascii=False)}\n"
        f"Market: {json.dumps(stats, ensure_ascii=False)}"
    )

    try:
        raw = chat([{"role": "user", "content": prompt}], temperature=0.2, model=AI_RECOMMEND_MODEL)
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
