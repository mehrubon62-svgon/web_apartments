from sqlalchemy.orm import Session, selectinload

from models import ViewingHistory, Property, PropertyStatus, utcnow


def track_view(db: Session, user_id: int, property_id: int) -> ViewingHistory:
    """Record a view. We keep one row per (user, property), refreshing the time,
    so 'history' reads cleanly. A fresh row is added if none exists."""
    existing = (
        db.query(ViewingHistory)
        .filter(ViewingHistory.user_id == user_id, ViewingHistory.property_id == property_id)
        .first()
    )
    if existing:
        existing.viewed_at = utcnow()
        db.commit()
        db.refresh(existing)
        return existing
    row = ViewingHistory(user_id=user_id, property_id=property_id)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_history(db: Session, user_id: int, limit: int = 50, offset: int = 0):
    q = (
        db.query(ViewingHistory)
        .filter(ViewingHistory.user_id == user_id)
        .order_by(ViewingHistory.viewed_at.desc())
    )
    total = q.count()
    rows = q.offset(offset).limit(limit).all()
    property_ids = [r.property_id for r in rows]
    props_map = {}
    if property_ids:
        props = (
            db.query(Property)
            .options(selectinload(Property.seller), selectinload(Property.media))
            .filter(Property.id.in_(property_ids), Property.status != PropertyStatus.deleted)
            .all()
        )
        props_map = {p.id: p for p in props}
    return rows, total, props_map


def delete_one(db: Session, user_id: int, history_id: int) -> bool:
    row = (
        db.query(ViewingHistory)
        .filter(ViewingHistory.id == history_id, ViewingHistory.user_id == user_id)
        .first()
    )
    if not row:
        return False
    db.delete(row)
    db.commit()
    return True


def clear_history(db: Session, user_id: int) -> int:
    count = db.query(ViewingHistory).filter(ViewingHistory.user_id == user_id).delete()
    db.commit()
    return count
