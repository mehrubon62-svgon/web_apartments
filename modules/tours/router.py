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


def _rooms(tour: Tour) -> list[dict]:
    data = tour.rooms or []
    # Backwards-compat: tours stored as a bare list vs. {"rooms": [...]}
    if isinstance(data, dict):
        return data.get("rooms", [])
    return data


def _first_room_id(tour: Tour, rooms: list[dict]) -> str | None:
    data = tour.rooms
    if isinstance(data, dict) and data.get("first_room_id"):
        return data["first_room_id"]
    return rooms[0]["id"] if rooms else None


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

    rooms = _rooms(tour)
    return TourOut(
        id=tour.id,
        property_id=property_id,
        first_room_id=_first_room_id(tour, rooms),
        rooms=rooms,
    )


@router.put("/{property_id}", response_model=TourOut)
def upsert_tour(
    property_id: int,
    data: TourIn,
    db: Session = Depends(get_db),
    seller: User = Depends(require_seller),
):
    """Create or replace the 360° tour (seller only).

    Each room can define `links` — arrow hotspots that walk the viewer to
    another room, like the navigation arrows in Google Street View.
    """
    prop = _get_property(db, property_id)
    if prop.seller_id != seller.id and seller.role.value != "admin":
        raise HTTPException(status_code=403, detail="Not your listing")

    rooms = [r.model_dump() for r in data.rooms]
    first_room_id = data.first_room_id or (rooms[0]["id"] if rooms else None)
    payload = {"rooms": rooms, "first_room_id": first_room_id}

    tour = db.query(Tour).filter(Tour.property_id == property_id).first()
    if tour:
        tour.rooms = payload
    else:
        tour = Tour(property_id=property_id, rooms=payload)
        db.add(tour)
    db.commit()
    db.refresh(tour)
    return TourOut(id=tour.id, property_id=property_id, first_room_id=first_room_id, rooms=rooms)


@router.get("/{property_id}/pannellum")
def pannellum_config(
    property_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Ready-to-use Pannellum multi-scene config.

    The frontend can feed this straight into `pannellum.viewer(el, config)`.
    Each room becomes a scene; each link becomes a clickable 'scene' hotspot
    (the navigation arrow) that transitions to the linked panorama and faces
    `targetYaw` on arrival.
    """
    _get_property(db, property_id)
    tour = db.query(Tour).filter(Tour.property_id == property_id).first()
    if not tour:
        raise HTTPException(status_code=404, detail="No tour for this property")

    rooms = _rooms(tour)
    if not rooms:
        raise HTTPException(status_code=404, detail="Tour has no rooms")

    scenes: dict[str, dict] = {}
    name_by_id = {r["id"]: (r.get("name") or r["id"]) for r in rooms}
    for room in rooms:
        hotspots = []
        for link in room.get("links", []):
            dest = link["to_room_id"]
            # Tooltip = where this arrow leads (Street-View style: "To: Kitchen").
            label = link.get("label") or name_by_id.get(dest) or "Go"
            hs = {
                "type": "scene",
                "text": label,
                "yaw": link.get("yaw", 0.0),
                # Default arrows sit low (on the floor) like Street View if no
                # explicit pitch was authored.
                "pitch": link.get("pitch", -25.0),
                "sceneId": dest,
                "cssClass": "pnlm-scene-arrow",  # frontend styles this as a floor arrow
            }
            if link.get("target_yaw") is not None:
                hs["targetYaw"] = link["target_yaw"]
            hotspots.append(hs)

        scenes[room["id"]] = {
            "title": room.get("name"),
            "type": "equirectangular",
            "panorama": room["media_url"],
            "yaw": room.get("init_yaw", 0.0),
            "pitch": room.get("init_pitch", 0.0),
            "hfov": room.get("init_hfov", 100.0),
            "hotSpots": hotspots,
        }

    first_scene = _first_room_id(tour, rooms)
    return {
        "default": {
            "firstScene": first_scene,
            "sceneFadeDuration": 1000,  # smooth crossfade between panoramas
            "autoLoad": True,
        },
        "scenes": scenes,
    }


@router.get("/{property_id}/share", response_model=ShareResponse)
def share_room(
    property_id: int,
    room_id: str = Query(..., description="Room to deep-link to"),
    current_user: User = Depends(get_current_user),
):
    """Build a shareable deep link to a specific room of the tour."""
    url = f"{AI_APP_URL.rstrip('/')}/properties/{property_id}/tour?room={room_id}"
    return ShareResponse(url=url)
