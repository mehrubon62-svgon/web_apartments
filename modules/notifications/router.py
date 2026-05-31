from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from models import get_db, User
from dependencies import get_current_user
from modules.notifications.schemas import NotificationOut, NotificationList
from modules.notifications.crud import (
    list_notifications,
    mark_as_read,
    mark_all_as_read,
    delete_notification,
)


router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("", response_model=NotificationList)
def my_notifications(
    limit: int = Query(30, le=100),
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items, total, unread = list_notifications(db, current_user.id, limit, offset)
    return NotificationList(
        items=[NotificationOut.model_validate(n) for n in items],
        total=total,
        unread=unread,
    )


@router.post("/{notification_id}/read")
def read_one(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not mark_as_read(db, current_user.id, notification_id):
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"detail": "Marked as read"}


@router.post("/read-all")
def read_all(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    count = mark_all_as_read(db, current_user.id)
    return {"detail": "All marked as read", "updated": count}


@router.delete("/{notification_id}")
def remove(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not delete_notification(db, current_user.id, notification_id):
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"detail": "Deleted"}
