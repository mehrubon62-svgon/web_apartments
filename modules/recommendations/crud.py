"""Content-based recommendations.

We build a simple taste profile from the user's viewing history + favorites
(preferred type, deal type, average price/area) and score active listings by
similarity. Results are cached in Redis by the Celery task; the API reads the
cache and falls back to computing on the fly.
"""
from __future__ import annotations

import json

import redis as sync_redis
from sqlalchemy.orm import Session, selectinload

from config import REDIS_URL
from models import (
    Property,
    PropertyStatus,
    ViewingHistory,
    Favorite,
)

CACHE_KEY = "recs:user:{user_id}"
CACHE_TTL = 3600


def _profile(db: Session, user_id: int) -> dict | None:
    viewed = db.query(ViewingHistory.property_id).filter(ViewingHistory.user_id == user_id).all()
    faved = db.query(Favorite.property_id).filter(Favorite.user_id == user_id).all()
    ids = {r[0] for r in viewed} | {r[0] for r in faved}
    if not ids:
        return None
    props = db.query(Property).filter(Property.id.in_(ids)).all()
    if not props:
        return None
    type_counts: dict[str, int] = {}
    deal_counts: dict[str, int] = {}
    prices, areas = [], []
    for p in props:
        type_counts[p.type.value] = type_counts.get(p.type.value, 0) + 1
        deal_counts[p.deal_type.value] = deal_counts.get(p.deal_type.value, 0) + 1
        prices.append(p.price)
        areas.append(p.area)
    return {
        "seen_ids": ids,
        "fav_type": max(type_counts, key=type_counts.get),
        "fav_deal": max(deal_counts, key=deal_counts.get),
        "avg_price": sum(prices) / len(prices),
        "avg_area": sum(areas) / len(areas),
    }


def compute_recommendations(db: Session, user_id: int, limit: int = 10) -> list[int]:
    profile = _profile(db, user_id)
    candidates = (
        db.query(Property)
        .filter(Property.status == PropertyStatus.active)
        .all()
    )
    if not profile:
        # Cold start: most viewed active listings.
        ranked = sorted(candidates, key=lambda p: p.views_count or 0, reverse=True)
        return [p.id for p in ranked[:limit]]

    def score(p: Property) -> float:
        s = 0.0
        if p.type.value == profile["fav_type"]:
            s += 2.0
        if p.deal_type.value == profile["fav_deal"]:
            s += 1.5
        if profile["avg_price"] > 0:
            s += max(0.0, 1.0 - abs(p.price - profile["avg_price"]) / profile["avg_price"])
        if profile["avg_area"] > 0:
            s += max(0.0, 1.0 - abs(p.area - profile["avg_area"]) / profile["avg_area"])
        return s

    fresh = [p for p in candidates if p.id not in profile["seen_ids"]]
    ranked = sorted(fresh, key=score, reverse=True)
    return [p.id for p in ranked[:limit]]


def cache_recommendations(user_id: int, property_ids: list[int]) -> None:
    client = sync_redis.from_url(REDIS_URL, decode_responses=True)
    try:
        client.set(CACHE_KEY.format(user_id=user_id), json.dumps(property_ids), ex=CACHE_TTL)
    finally:
        client.close()


def get_cached_recommendations(user_id: int) -> list[int] | None:
    try:
        client = sync_redis.from_url(REDIS_URL, decode_responses=True)
        try:
            raw = client.get(CACHE_KEY.format(user_id=user_id))
        finally:
            client.close()
    except Exception:
        return None
    if not raw:
        return None
    try:
        return json.loads(raw)
    except ValueError:
        return None


def load_recommended_properties(db: Session, user_id: int, limit: int = 10) -> list[Property]:
    ids = get_cached_recommendations(user_id)
    if ids is None:
        ids = compute_recommendations(db, user_id, limit)
    if not ids:
        return []
    props = (
        db.query(Property)
        .options(selectinload(Property.seller), selectinload(Property.media))
        .filter(Property.id.in_(ids), Property.status == PropertyStatus.active)
        .all()
    )
    order = {pid: i for i, pid in enumerate(ids)}
    props.sort(key=lambda p: order.get(p.id, 999))
    return props[:limit]
