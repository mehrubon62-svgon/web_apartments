from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from models import (
    get_db,
    User,
    Property,
    Complaint,
    RoleEnum,
    UserStatus,
)
from dependencies import get_current_user
from config import COMPLAINT_THRESHOLD


router = APIRouter(prefix="/complaints", tags=["Complaints"])


class ComplaintIn(BaseModel):
    seller_id: int
    property_id: int | None = None
    reason: str = Field(min_length=3, max_length=2000)


class ComplaintOut(BaseModel):
    id: int
    seller_id: int
    buyer_id: int
    property_id: int | None
    reason: str
    created_at: datetime

    class Config:
        from_attributes = True


@router.post("", response_model=ComplaintOut, status_code=201)
def submit_complaint(
    data: ComplaintIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Any buyer can file a complaint against a seller.

    When the seller's complaint count reaches COMPLAINT_THRESHOLD, the
    moderate_seller Celery task is triggered automatically.
    """
    seller = db.query(User).filter(User.id == data.seller_id).first()
    if not seller or seller.role not in (RoleEnum.seller, RoleEnum.admin):
        raise HTTPException(status_code=404, detail="Seller not found")
    if seller.id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot complain about yourself")

    if data.property_id is not None:
        prop = db.query(Property).filter(Property.id == data.property_id).first()
        if not prop:
            raise HTTPException(status_code=404, detail="Property not found")

    complaint = Complaint(
        seller_id=data.seller_id,
        buyer_id=current_user.id,
        property_id=data.property_id,
        reason=data.reason,
    )
    db.add(complaint)
    db.commit()
    db.refresh(complaint)

    # Trigger AI moderation at the threshold (only while still active).
    total = db.query(Complaint).filter(Complaint.seller_id == data.seller_id).count()
    if total >= COMPLAINT_THRESHOLD and seller.status == UserStatus.active:
        try:
            from tasks import moderate_seller
            moderate_seller.delay(data.seller_id)
        except Exception:
            from tasks import moderate_seller
            moderate_seller(data.seller_id)

    return ComplaintOut.model_validate(complaint)
