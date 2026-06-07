from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from models import get_db, User, Property, PriceTracker, PropertyStatus
from dependencies import get_current_user


router = APIRouter(prefix="/price-trackers", tags=["Price Trackers"])


class TrackerIn(BaseModel):
    property_id: int
    target_price: float | None = None


class TrackerOut(BaseModel):
    id: int
    property_id: int
    target_price: float | None
    last_seen_price: float | None
    created_at: datetime

    class Config:
        from_attributes = True


@router.get("", response_model=list[TrackerOut])
def my_trackers(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (
        db.query(PriceTracker)
        .filter(PriceTracker.user_id == current_user.id)
        .order_by(PriceTracker.created_at.desc())
        .all()
    )
    return [TrackerOut.model_validate(r) for r in rows]


@router.post("", response_model=TrackerOut, status_code=201)
def add_tracker(
    data: TrackerIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    prop = db.query(Property).filter(Property.id == data.property_id).first()
    if not prop or prop.status == PropertyStatus.deleted:
        raise HTTPException(status_code=404, detail="Property not found")

    existing = (
        db.query(PriceTracker)
        .filter(
            PriceTracker.user_id == current_user.id,
            PriceTracker.property_id == data.property_id,
        )
        .first()
    )
    if existing:
        existing.target_price = data.target_price
        existing.last_seen_price = prop.price
        db.commit()
        db.refresh(existing)
        return TrackerOut.model_validate(existing)

    tracker = PriceTracker(
        user_id=current_user.id,
        property_id=data.property_id,
        target_price=data.target_price,
        last_seen_price=prop.price,
    )
    db.add(tracker)
    db.commit()
    db.refresh(tracker)
    return TrackerOut.model_validate(tracker)


@router.delete("/{property_id}")
def remove_tracker(
    property_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tracker = (
        db.query(PriceTracker)
        .filter(
            PriceTracker.user_id == current_user.id,
            PriceTracker.property_id == property_id,
        )
        .first()
    )
    if not tracker:
        raise HTTPException(status_code=404, detail="Tracker not found")
    db.delete(tracker)
    db.commit()
    return {"detail": "Tracker removed"}
