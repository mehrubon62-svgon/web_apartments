"""Notification creation + the universal dispatcher.

create_notification() persists a row and pushes it over realtime (Redis -> WS).
This is called from request handlers AND from Celery tasks, so the realtime push
uses the synchronous publisher.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from models import Notification, NotificationType
from modules.realtime.manager import publish_event_sync


def create_notification(
    db: Session,
    user_id: int,
    type: NotificationType,
    content: dict,
    push: bool = True,
) -> Notification:
    notif = Notification(user_id=user_id, type=type, content=content or {})
    db.add(notif)
    db.commit()
    db.refresh(notif)

    if push:
        publish_event_sync(
            user_id,
            "notification:new",
            serialize_notification(notif),
        )
    return notif


def serialize_notification(notif: Notification) -> dict:
    return {
        "id": notif.id,
        "type": notif.type.value,
        "content": notif.content,
        "read": notif.read,
        "created_at": notif.created_at.isoformat(),
    }


def list_notifications(db: Session, user_id: int, limit: int = 30, offset: int = 0):
    q = (
        db.query(Notification)
        .filter(Notification.user_id == user_id)
        .order_by(Notification.created_at.desc())
    )
    total = q.count()
    unread = (
        db.query(Notification)
        .filter(Notification.user_id == user_id, Notification.read.is_(False))
        .count()
    )
    items = q.offset(offset).limit(limit).all()
    return items, total, unread


def mark_as_read(db: Session, user_id: int, notification_id: int) -> bool:
    notif = (
        db.query(Notification)
        .filter(Notification.id == notification_id, Notification.user_id == user_id)
        .first()
    )
    if not notif:
        return False
    notif.read = True
    db.commit()
    return True


def mark_all_as_read(db: Session, user_id: int) -> int:
    rows = (
        db.query(Notification)
        .filter(Notification.user_id == user_id, Notification.read.is_(False))
        .update({"read": True})
    )
    db.commit()
    return rows


def delete_notification(db: Session, user_id: int, notification_id: int) -> bool:
    notif = (
        db.query(Notification)
        .filter(Notification.id == notification_id, Notification.user_id == user_id)
        .first()
    )
    if not notif:
        return False
    db.delete(notif)
    db.commit()
    return True
