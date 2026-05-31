from datetime import datetime, date

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from models import (
    get_db,
    User,
    Property,
    PurchaseRequest,
    DealType,
    PropertyStatus,
    RoleEnum,
)
from dependencies import get_current_user
from modules.notifications.crud import create_notification
from models import NotificationType


router = APIRouter(prefix="/purchase-requests", tags=["Purchase / Viewing Requests"])


class PurchaseRequestIn(BaseModel):
    property_id: int
    message: str | None = None
    preferred_date: date | None = None


class PurchaseRequestOut(BaseModel):
    id: int
    property_id: int
    buyer_id: int
    message: str | None
    preferred_date: date | None
    created_at: datetime

    class Config:
        from_attributes = True


class PurchaseRequestList(BaseModel):
    items: list[PurchaseRequestOut]
    total: int


@router.post("", response_model=PurchaseRequestOut, status_code=201)
def submit(
    data: PurchaseRequestIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Submit a purchase / viewing request for a sale listing."""
    prop = db.query(Property).filter(Property.id == data.property_id).first()
    if not prop or prop.status == PropertyStatus.deleted:
        raise HTTPException(status_code=404, detail="Property not found")
    if prop.deal_type != DealType.sale:
        raise HTTPException(status_code=400, detail="This property is not for sale")

    req = PurchaseRequest(
        property_id=data.property_id,
        buyer_id=current_user.id,
        message=data.message,
        preferred_date=data.preferred_date,
    )
    db.add(req)
    db.commit()
    db.refresh(req)

    # Notify the seller (realtime).
    create_notification(
        db,
        user_id=prop.seller_id,
        type=NotificationType.new_message,
        content={
            "title": "New viewing request",
            "body": f"{current_user.full_name or current_user.email} is interested in '{prop.title}'.",
            "property_id": prop.id,
            "request_id": req.id,
        },
    )
    return PurchaseRequestOut.model_validate(req)


@router.get("", response_model=PurchaseRequestList)
def list_requests(
    limit: int = Query(50, le=100),
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Buyers see their own requests; sellers see requests for their listings."""
    if current_user.role in (RoleEnum.seller, RoleEnum.admin):
        q = (
            db.query(PurchaseRequest)
            .join(Property, Property.id == PurchaseRequest.property_id)
            .filter(Property.seller_id == current_user.id)
        )
    else:
        q = db.query(PurchaseRequest).filter(PurchaseRequest.buyer_id == current_user.id)
    q = q.order_by(PurchaseRequest.created_at.desc())
    total = q.count()
    items = q.offset(offset).limit(limit).all()
    return PurchaseRequestList(
        items=[PurchaseRequestOut.model_validate(r) for r in items],
        total=total,
    )
