"""Geo helpers: Mapbox geocoding + haversine distance for radius search."""
from __future__ import annotations

import math

import httpx

from config import MAPBOX_TOKEN, MAPBOX_GEOCODING_URL


def geocode(address: str) -> tuple[float, float] | None:
    """Address -> (lat, lng) via Mapbox. Returns None if not configured/failed.

    The seller's manual pin always wins; this only provides an initial guess.
    """
    if not MAPBOX_TOKEN or not address:
        return None
    url = f"{MAPBOX_GEOCODING_URL}/{httpx.URL(address)}.json"
    try:
        with httpx.Client(timeout=10) as client:
            resp = client.get(url, params={"access_token": MAPBOX_TOKEN, "limit": 1})
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPError:
        return None
    features = data.get("features") or []
    if not features:
        return None
    center = features[0].get("center")  # [lng, lat]
    if not center or len(center) != 2:
        return None
    lng, lat = center
    return float(lat), float(lng)


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in kilometres."""
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))
