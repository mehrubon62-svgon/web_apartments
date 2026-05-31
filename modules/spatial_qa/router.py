import base64
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from models import get_db, User, Property, SpatialQA, PropertyStatus
from dependencies import get_current_user
from config import MEDIA_DIR
from modules.spatial_qa.schemas import (
    SpatialQuestionIn,
    SpatialQAOut,
    SpatialQAList,
)


router = APIRouter(prefix="/spatial-qa", tags=["Spatial Q&A"])


def _save_zone_image(image_b64: str) -> str | None:
    """Persist the zone screenshot so the Celery worker can read it."""
    try:
        raw = base64.b64decode(image_b64)
    except Exception:
        return None
    Path(MEDIA_DIR).mkdir(parents=True, exist_ok=True)
    name = f"zone_{uuid.uuid4().hex}.jpg"
    with (Path(MEDIA_DIR) / name).open("wb") as f:
        f.write(raw)
    return f"/media-files/{name}"


@router.post("", response_model=SpatialQAOut, status_code=202)
def ask(
    data: SpatialQuestionIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Ask a question about a selected zone in a 360° tour.

    The answer is produced asynchronously by Celery (vision call to the AI).
    Poll GET /spatial-qa/{id} or listen on the websocket for spatial_qa:done.
    """
    prop = db.query(Property).filter(Property.id == data.property_id).first()
    if not prop or prop.status == PropertyStatus.deleted:
        raise HTTPException(status_code=404, detail="Property not found")

    image_url = _save_zone_image(data.image_b64) if data.image_b64 else None

    qa = SpatialQA(
        user_id=current_user.id,
        property_id=data.property_id,
        room_id=data.room_id,
        zone_coords=data.zone_coords.model_dump(),
        image_url=image_url,
        question=data.question,
        status="pending",
    )
    db.add(qa)
    db.commit()
    db.refresh(qa)

    # Kick off async processing. If the broker is down, fall back to sync.
    try:
        from tasks import process_spatial_qa
        process_spatial_qa.delay(qa.id)
    except Exception:
        from tasks import process_spatial_qa
        process_spatial_qa(qa.id)

    return SpatialQAOut.model_validate(qa)


@router.get("", response_model=SpatialQAList)
def my_questions(
    property_id: int | None = Query(None),
    limit: int = Query(50, le=100),
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(SpatialQA).filter(SpatialQA.user_id == current_user.id)
    if property_id is not None:
        q = q.filter(SpatialQA.property_id == property_id)
    q = q.order_by(SpatialQA.created_at.desc())
    total = q.count()
    items = q.offset(offset).limit(limit).all()
    return SpatialQAList(
        items=[SpatialQAOut.model_validate(i) for i in items],
        total=total,
    )


@router.get("/{qa_id}", response_model=SpatialQAOut)
def get_one(
    qa_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    qa = (
        db.query(SpatialQA)
        .filter(SpatialQA.id == qa_id, SpatialQA.user_id == current_user.id)
        .first()
    )
    if not qa:
        raise HTTPException(status_code=404, detail="Question not found")
    return SpatialQAOut.model_validate(qa)


@router.delete("/{qa_id}")
def delete_one(
    qa_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    qa = (
        db.query(SpatialQA)
        .filter(SpatialQA.id == qa_id, SpatialQA.user_id == current_user.id)
        .first()
    )
    if not qa:
        raise HTTPException(status_code=404, detail="Question not found")
    db.delete(qa)
    db.commit()
    return {"detail": "Deleted"}


@router.delete("")
def clear_all(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    count = db.query(SpatialQA).filter(SpatialQA.user_id == current_user.id).delete()
    db.commit()
    return {"detail": "Spatial Q&A history cleared", "removed": count}
