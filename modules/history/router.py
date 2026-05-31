from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from models import get_db, User
from dependencies import get_current_user
from modules.properties.schemas import PropertyOut
from modules.properties.router import serialize
from modules.history.crud import list_history, delete_one, clear_history


router = APIRouter(prefix="/history", tags=["Viewing History"])


class HistoryItem(BaseModel):
    id: int
    viewed_at: datetime
    property: PropertyOut


class HistoryList(BaseModel):
    items: list[HistoryItem]
    total: int


@router.get("", response_model=HistoryList)
def my_history(
    limit: int = Query(50, le=100),
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows, total, props_map = list_history(db, current_user.id, limit, offset)
    items = []
    for r in rows:
        prop = props_map.get(r.property_id)
        if not prop:
            continue
        items.append(
            HistoryItem(
                id=r.id,
                viewed_at=r.viewed_at,
                property=serialize(db, prop, current_user.id),
            )
        )
    return HistoryList(items=items, total=total)


@router.delete("/{history_id}")
def delete_item(
    history_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not delete_one(db, current_user.id, history_id):
        raise HTTPException(status_code=404, detail="History entry not found")
    return {"detail": "Deleted"}


@router.delete("")
def clear_all(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    count = clear_history(db, current_user.id)
    return {"detail": "History cleared", "removed": count}
