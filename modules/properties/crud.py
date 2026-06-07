from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from models import (
    Property,
    PropertyMedia,
    PropertyStatus,
    PriceHistory,
    Favorite,
    Review,
    Tour,
    DealType,
    PropertyType,
    MediaKind,
)


def _base_query(db: Session):
    return db.query(Property).options(
        selectinload(Property.seller),
        selectinload(Property.media),
    )


def get_property(db: Session, property_id: int) -> Property | None:
    return _base_query(db).filter(Property.id == property_id).first()


def create_property(db: Session, seller_id: int, data: dict, media: list[dict]) -> Property:
    prop = Property(
        seller_id=seller_id,
        title=data["title"],
        description=data.get("description"),
        type=data["type"],
        deal_type=data["deal_type"],
        rent_term=data.get("rent_term"),
        price=data["price"],
        area=data["area"],
        rooms=data.get("rooms"),
        address=data.get("address"),
        lat=data.get("lat"),
        lng=data.get("lng"),
        house_rules=data.get("house_rules"),
    )
    db.add(prop)
    db.flush()

    for idx, m in enumerate(media):
        db.add(
            PropertyMedia(
                property_id=prop.id,
                url=m["url"],
                type=m.get("type", "photo"),
                order=m.get("order", idx),
            )
        )

    db.add(PriceHistory(property_id=prop.id, price=prop.price))
    db.commit()
    db.refresh(prop)
    return prop


def update_property(db: Session, prop: Property, fields: dict) -> Property:
    price_changed = "price" in fields and fields["price"] is not None and fields["price"] != prop.price
    for key, value in fields.items():
        if value is not None:
            setattr(prop, key, value)
    if price_changed:
        db.add(PriceHistory(property_id=prop.id, price=prop.price))
    db.commit()
    db.refresh(prop)
    return prop


def delete_property(db: Session, prop: Property) -> None:
    prop.status = PropertyStatus.deleted
    db.commit()


def search_properties(
    db: Session,
    *,
    deal_type: DealType | None = None,
    type: PropertyType | None = None,
    min_price: float | None = None,
    max_price: float | None = None,
    min_area: float | None = None,
    max_area: float | None = None,
    rooms: int | None = None,
    seller_id: int | None = None,
    only_active: bool = True,
    limit: int = 20,
    offset: int = 0,
    seed: int | None = None,
    sort_by: str | None = None,
    order: str | None = None,
):
    q = _base_query(db)
    if only_active:
        q = q.filter(Property.status == PropertyStatus.active)
    if seller_id is not None:
        q = q.filter(Property.seller_id == seller_id)
    if deal_type is not None:
        q = q.filter(Property.deal_type == deal_type)
    if type is not None:
        q = q.filter(Property.type == type)
    if min_price is not None:
        q = q.filter(Property.price >= min_price)
    if max_price is not None:
        q = q.filter(Property.price <= max_price)
    if min_area is not None:
        q = q.filter(Property.area >= min_area)
    if max_area is not None:
        q = q.filter(Property.area <= max_area)
    if rooms is not None:
        q = q.filter(Property.rooms == rooms)

    if sort_by in ("price", "area"):
        col = Property.price if sort_by == "price" else Property.area
        col = col.asc() if (order or "asc").lower() == "asc" else col.desc()
        q = q.order_by(col)
        total = q.count()
        items = q.offset(offset).limit(limit).all()
        return items, total

    if seed is not None:
        import random as _random
        rows = q.all()
        _random.Random(seed).shuffle(rows)
        total = len(rows)
        items = rows[offset:offset + limit]
        return items, total

    q = q.order_by(Property.created_at.desc())
    total = q.count()
    items = q.offset(offset).limit(limit).all()
    return items, total


def map_markers(db: Session, **filters):
    """Active properties that have coordinates, for the map."""
    items, _ = search_properties(db, limit=1000, offset=0, **filters)
    return [p for p in items if p.lat is not None and p.lng is not None]


def text_search(db: Session, query: str, limit: int = 20, offset: int = 0):
    """Full-text-ish search over title, description and address (active only)."""
    like = f"%{query.lower()}%"
    q = (
        _base_query(db)
        .filter(Property.status == PropertyStatus.active)
        .filter(
            func.lower(Property.title).like(like)
            | func.lower(func.coalesce(Property.description, "")).like(like)
            | func.lower(func.coalesce(Property.address, "")).like(like)
        )
        .order_by(Property.created_at.desc())
    )
    total = q.count()
    items = q.offset(offset).limit(limit).all()
    return items, total


def market_stats(db: Session, prop: Property) -> dict:
    """Market context for one property: comparable active listings of the same
    deal type + property type, and their average price / price-per-m².

    Used by the AI review to judge whether a listing is a good deal or a scam.
    """
    comps = (
        db.query(Property)
        .filter(
            Property.status == PropertyStatus.active,
            Property.id != prop.id,
            Property.deal_type == prop.deal_type,
            Property.type == prop.type,
        )
        .all()
    )
    prices = [c.price for c in comps if c.price]
    ppsqm = [c.price / c.area for c in comps if c.area]

    def _median(xs):
        if not xs:
            return None
        s = sorted(xs)
        n = len(s)
        mid = n // 2
        return s[mid] if n % 2 else (s[mid - 1] + s[mid]) / 2

    avg_price = sum(prices) / len(prices) if prices else None
    median_price = _median(prices)
    avg_ppsqm = sum(ppsqm) / len(ppsqm) if ppsqm else None

    this_ppsqm = (prop.price / prop.area) if prop.area else None
    price_ratio = (prop.price / median_price) if median_price else None
    ppsqm_ratio = (this_ppsqm / avg_ppsqm) if (this_ppsqm and avg_ppsqm) else None

    return {
        "comparables_count": len(comps),
        "market_avg_price": round(avg_price, 2) if avg_price else None,
        "market_median_price": round(median_price, 2) if median_price else None,
        "market_avg_price_per_sqm": round(avg_ppsqm, 2) if avg_ppsqm else None,
        "this_price": prop.price,
        "this_price_per_sqm": round(this_ppsqm, 2) if this_ppsqm else None,
        "price_ratio_vs_median": round(price_ratio, 2) if price_ratio else None,
        "ppsqm_ratio_vs_avg": round(ppsqm_ratio, 2) if ppsqm_ratio else None,
    }


def heuristic_review(prop: Property, stats: dict) -> dict:
    """Rule-based fallback verdict when AI is unavailable (or to seed the AI).

    Flags listings priced far below the market as suspicious / likely scams, and
    rates value based on how the price compares to comparable listings.
    """
    ratio = stats.get("price_ratio_vs_median") or stats.get("ppsqm_ratio_vs_avg")
    red_flags: list[str] = []
    pros: list[str] = []
    cons: list[str] = []

    if prop.area and prop.rooms and prop.area / max(prop.rooms, 1) < 6:
        red_flags.append("Unrealistically small area per room")
    if not prop.description:
        cons.append("No description provided")
    if not (prop.lat and prop.lng):
        cons.append("No exact location pinned")

    if ratio is None:
        verdict, score, risk = "insufficient_data", 50, "unknown"
        summary = "Not enough comparable listings to judge the price."
    elif ratio < 0.35:
        verdict, score, risk = "likely_scam", 10, "high"
        summary = "Price is far below the market for similar properties — classic scam signal."
        red_flags.append(f"Priced at ~{int(ratio*100)}% of the market median")
    elif ratio < 0.7:
        verdict, score, risk = "suspicious", 35, "medium"
        summary = "Noticeably cheaper than comparable listings — verify before paying."
        red_flags.append("Below-market price")
    elif ratio <= 1.1:
        verdict, score, risk = "great_deal" if ratio < 0.95 else "fair", 80, "low"
        summary = "Priced in line with (or slightly below) the market."
        pros.append("Price close to market value")
    elif ratio <= 1.4:
        verdict, score, risk = "overpriced", 45, "low"
        summary = "Above the market for comparable properties."
        cons.append("Higher than typical price")
    else:
        verdict, score, risk = "overpriced", 25, "low"
        summary = "Significantly above the market."
        cons.append("Much higher than typical price")

    return {
        "verdict": verdict,
        "deal_score": score,
        "scam_risk": risk,
        "summary": summary,
        "pros": pros,
        "cons": cons,
        "red_flags": red_flags,
    }


def has_tour(db: Session, property_id: int) -> bool:
    return db.query(Tour).filter(Tour.property_id == property_id).first() is not None


def has_3d_tour(db: Session, property_id: int) -> bool:
    """True if a Matterport-style 3D tour (uploaded ZIP) exists for this property."""
    tour = db.query(Tour).filter(Tour.property_id == property_id).first()
    return bool(tour and isinstance(tour.rooms, dict) and (tour.rooms or {}).get("model3d"))


def cover_url(prop: Property) -> str | None:
    """Card cover = the first real PHOTO (never a 360 panorama, which looks
    distorted as a flat thumbnail). Falls back to the lowest-order media if a
    listing somehow has only panoramas."""
    photos = [m for m in prop.media if m.type == MediaKind.photo]
    if photos:
        return sorted(photos, key=lambda m: m.order)[0].url
    if prop.media:
        return sorted(prop.media, key=lambda m: m.order)[0].url
    return None


def is_favorited(db: Session, user_id: int, property_id: int) -> bool:
    return (
        db.query(Favorite)
        .filter(Favorite.user_id == user_id, Favorite.property_id == property_id)
        .first()
        is not None
    )


def avg_rating(db: Session, property_id: int) -> float | None:
    value = (
        db.query(func.avg(Review.rating))
        .filter(Review.property_id == property_id)
        .scalar()
    )
    return round(float(value), 2) if value is not None else None


def seller_rating(db: Session, seller_id: int) -> tuple[float | None, int]:
    """Average rating + review count across ALL of a seller's listings."""
    row = (
        db.query(func.avg(Review.rating), func.count(Review.id))
        .join(Property, Property.id == Review.property_id)
        .filter(Property.seller_id == seller_id)
        .first()
    )
    avg, cnt = (row or (None, 0))
    return (round(float(avg), 2) if avg is not None else None), int(cnt or 0)


def increment_views(db: Session, prop: Property) -> None:
    prop.views_count = (prop.views_count or 0) + 1
    db.commit()
