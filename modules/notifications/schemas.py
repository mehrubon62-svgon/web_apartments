from datetime import datetime

from pydantic import BaseModel

from models import NotificationType


class NotificationOut(BaseModel):
    id: int
    type: NotificationType
    content: dict
    read: bool
    created_at: datetime

    class Config:
        from_attributes = True


class NotificationList(BaseModel):
    items: list[NotificationOut]
    total: int
    unread: int
