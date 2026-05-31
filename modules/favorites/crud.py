from sqlalchemy.orm import Session, selectinload

from models import Favorite, Property, PropertyStatus


def add_favorite(db: Session, user_id: int, property_id: int) -> Favorite:
    existing = (
        db.query(Favorite)
        .filter(Favorite.user_id == user_id, Favorite.property_id == property_id)
        .first()
    )
    if existing:
        return existing
    fav = Favorite(user_id=user_id, property_id=property_id)
    db.add(fav)
    db.commit()
    db.refresh(fav)
    return fav


def remove_favorite(db: Session, user_id: int, property_id: int) -> bool:
    fav = (
        db.query(Favorite)
        .filter(Favorite.user_id == user_id, Favorite.property_id == property_id)
        .first()
    )
    if not fav:
        return False
    db.delete(fav)
    db.commit()
    return True


def list_favorites(db: Session, user_id: int) -> list[Property]:
    rows = (
        db.query(Favorite)
        .filter(Favorite.user_id == user_id)
        .order_by(Favorite.created_at.desc())
        .all()
    )
    property_ids = [r.property_id for r in rows]
    if not property_ids:
        return []
    props = (
        db.query(Property)
        .options(selectinload(Property.seller), selectinload(Property.media))
        .filter(Property.id.in_(property_ids), Property.status != PropertyStatus.deleted)
        .all()
    )
    # Preserve favorite order
    order = {pid: i for i, pid in enumerate(property_ids)}
    props.sort(key=lambda p: order.get(p.id, 0))
    return props


def clear_favorites(db: Session, user_id: int) -> int:
    count = db.query(Favorite).filter(Favorite.user_id == user_id).delete()
    db.commit()
    return count
