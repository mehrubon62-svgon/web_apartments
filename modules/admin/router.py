from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from models import (
    get_db,
    User,
    Complaint,
    ModerationRecord,
    ModerationDecision,
    UserStatus,
    NotificationType,
)
from dependencies import require_admin
from modules.notifications.crud import create_notification


router = APIRouter(prefix="/admin", tags=["Admin"])


class ComplaintAdminOut(BaseModel):
    id: int
    seller_id: int
    buyer_id: int
    property_id: int | None
    reason: str
    created_at: datetime

    class Config:
        from_attributes = True


class ModerationOut(BaseModel):
    id: int
    seller_id: int
    decision: ModerationDecision
    ai_reasoning: str | None
    overridden_by_admin: bool
    admin_id: int | None
    created_at: datetime

    class Config:
        from_attributes = True


class OverrideIn(BaseModel):
    decision: ModerationDecision


@router.get("/complaints", response_model=list[ComplaintAdminOut])
def all_complaints(
    seller_id: int | None = Query(None),
    limit: int = Query(100, le=500),
    offset: int = 0,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    q = db.query(Complaint)
    if seller_id is not None:
        q = q.filter(Complaint.seller_id == seller_id)
    q = q.order_by(Complaint.created_at.desc())
    items = q.offset(offset).limit(limit).all()
    return [ComplaintAdminOut.model_validate(c) for c in items]


@router.get("/moderation", response_model=list[ModerationOut])
def all_decisions(
    seller_id: int | None = Query(None),
    limit: int = Query(100, le=500),
    offset: int = 0,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    q = db.query(ModerationRecord)
    if seller_id is not None:
        q = q.filter(ModerationRecord.seller_id == seller_id)
    q = q.order_by(ModerationRecord.created_at.desc())
    items = q.offset(offset).limit(limit).all()
    return [ModerationOut.model_validate(m) for m in items]


def _apply_decision(db: Session, seller: User, decision: ModerationDecision) -> None:
    if decision == ModerationDecision.ban:
        seller.status = UserStatus.banned
    elif decision == ModerationDecision.warning:
        seller.status = UserStatus.warned
    else:
        seller.status = UserStatus.active
    db.commit()


@router.post("/moderation/{seller_id}/override", response_model=ModerationOut)
def override_decision(
    seller_id: int,
    data: OverrideIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Admin manually overrides the AI moderation outcome for a seller."""
    seller = db.query(User).filter(User.id == seller_id).first()
    if not seller:
        raise HTTPException(status_code=404, detail="Seller not found")

    _apply_decision(db, seller, data.decision)

    record = ModerationRecord(
        seller_id=seller_id,
        decision=data.decision,
        ai_reasoning="Manual override by admin",
        overridden_by_admin=True,
        admin_id=admin.id,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    type_map = {
        ModerationDecision.ban: NotificationType.ban,
        ModerationDecision.warning: NotificationType.warning,
        ModerationDecision.unfounded: NotificationType.complaint_decision,
    }
    create_notification(
        db,
        user_id=seller_id,
        type=type_map[data.decision],
        content={
            "title": f"Moderation decision: {data.decision.value}",
            "body": "An administrator reviewed your account.",
            "decision": data.decision.value,
        },
    )
    return ModerationOut.model_validate(record)


@router.post("/users/{user_id}/unban")
def unban_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.status = UserStatus.active
    db.commit()
    create_notification(
        db,
        user_id=user_id,
        type=NotificationType.complaint_decision,
        content={"title": "Account reinstated", "body": "Your account is active again."},
    )
    return {"detail": "User unbanned"}
