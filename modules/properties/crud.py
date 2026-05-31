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

    # Seed price history with the initial price.
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
    # Soft-delete to preserve history/bookings integrity.
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


def has_tour(db: Session, property_id: int) -> bool:
    return db.query(Tour).filter(Tour.property_id == property_id).first() is not None


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


def increment_views(db: Session, prop: Property) -> None:
    prop.views_count = (prop.views_count or 0) + 1
    db.commit()
