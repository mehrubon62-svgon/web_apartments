from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from models import get_db, User, Property, Tour, PropertyStatus
from dependencies import get_current_user, require_seller
from config import AI_APP_URL
from modules.tours.schemas import TourIn, TourOut, ShareResponse


router = APIRouter(prefix="/tours", tags=["360 Tours"])


def _get_property(db: Session, property_id: int) -> Property:
    prop = db.query(Property).filter(Property.id == property_id).first()
    if not prop or prop.status == PropertyStatus.deleted:
        raise HTTPException(status_code=404, detail="Property not found")
    return prop


@router.get("/{property_id}", response_model=TourOut)
def get_tour(
    property_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Fetch the 360° tour for a property. Viewing it is recorded in history."""
    _get_property(db, property_id)
    tour = db.query(Tour).filter(Tour.property_id == property_id).first()
    if not tour:
        raise HTTPException(status_code=404, detail="No tour for this property")

    # The tour view counts as a view -> saved to history.
    from modules.history.crud import track_view
    track_view(db, current_user.id, property_id)

    return TourOut(id=tour.id, property_id=property_id, rooms=tour.rooms or [])


@router.put("/{property_id}", response_model=TourOut)
def upsert_tour(
    property_id: int,
    data: TourIn,
    db: Session = Depends(get_db),
    seller: User = Depends(require_seller),
):
    """Create or replace the 360° tour (seller only)."""
    prop = _get_property(db, property_id)
    if prop.seller_id != seller.id and seller.role.value != "admin":
        raise HTTPException(status_code=403, detail="Not your listing")

    rooms = [r.model_dump() for r in data.rooms]
    tour = db.query(Tour).filter(Tour.property_id == property_id).first()
    if tour:
        tour.rooms = rooms
    else:
        tour = Tour(property_id=property_id, rooms=rooms)
        db.add(tour)
    db.commit()
    db.refresh(tour)
    return TourOut(id=tour.id, property_id=property_id, rooms=tour.rooms or [])


@router.get("/{property_id}/share", response_model=ShareResponse)
def share_room(
    property_id: int,
    room_id: str = Query(..., description="Room to deep-link to"),
    current_user: User = Depends(get_current_user),
):
    """Build a shareable deep link to a specific room of the tour."""
    url = f"{AI_APP_URL.rstrip('/')}/properties/{property_id}/tour?room={room_id}"
    return ShareResponse(url=url)
