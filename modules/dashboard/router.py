from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from models import (
    get_db,
    User,
    Property,
    PropertyStatus,
    SpatialQA,
    Booking,
    PurchaseRequest,
)
from dependencies import require_seller
from modules.properties.schemas import PropertyList
from modules.properties.router import serialize


router = APIRouter(prefix="/dashboard", tags=["Seller Dashboard"])


class ZoneHighlight(BaseModel):
    room_id: str | None
    count: int


class ListingAnalytics(BaseModel):
    property_id: int
    title: str
    total_views: int
    spatial_questions: int
    top_zones: list[ZoneHighlight]
    booking_requests: int
    purchase_requests: int


@router.get("/listings", response_model=PropertyList)
def my_listings(
    db: Session = Depends(get_db),
    seller: User = Depends(require_seller),
):
    """All of the seller's listings (including paused)."""
    props = (
        db.query(Property)
        .filter(
            Property.seller_id == seller.id,
            Property.status != PropertyStatus.deleted,
        )
        .order_by(Property.created_at.desc())
        .all()
    )
    return PropertyList(
        items=[serialize(db, p, seller.id) for p in props],
        total=len(props),
    )


@router.post("/listings/{property_id}/pause", response_model=PropertyList)
def pause_listing(
    property_id: int,
    db: Session = Depends(get_db),
    seller: User = Depends(require_seller),
):
    prop = db.query(Property).filter(Property.id == property_id).first()
    if not prop or prop.seller_id != seller.id:
        raise HTTPException(status_code=404, detail="Property not found")
    prop.status = PropertyStatus.paused
    db.commit()
    return my_listings(db, seller)


@router.post("/listings/{property_id}/activate", response_model=PropertyList)
def activate_listing(
    property_id: int,
    db: Session = Depends(get_db),
    seller: User = Depends(require_seller),
):
    prop = db.query(Property).filter(Property.id == property_id).first()
    if not prop or prop.seller_id != seller.id:
        raise HTTPException(status_code=404, detail="Property not found")
    prop.status = PropertyStatus.active
    db.commit()
    return my_listings(db, seller)


@router.get("/listings/{property_id}/analytics", response_model=ListingAnalytics)
def listing_analytics(
    property_id: int,
    db: Session = Depends(get_db),
    seller: User = Depends(require_seller),
):
    """Per-listing analytics: views, most-highlighted Spatial Q&A zones, inquiries."""
    prop = db.query(Property).filter(Property.id == property_id).first()
    if not prop or prop.seller_id != seller.id:
        raise HTTPException(status_code=404, detail="Property not found")

    spatial_total = (
        db.query(SpatialQA).filter(SpatialQA.property_id == property_id).count()
    )
    zone_rows = (
        db.query(SpatialQA.room_id, func.count(SpatialQA.id))
        .filter(SpatialQA.property_id == property_id)
        .group_by(SpatialQA.room_id)
        .order_by(func.count(SpatialQA.id).desc())
        .limit(5)
        .all()
    )
    top_zones = [ZoneHighlight(room_id=r[0], count=r[1]) for r in zone_rows]

    booking_requests = (
        db.query(Booking).filter(Booking.property_id == property_id).count()
    )
    purchase_requests = (
        db.query(PurchaseRequest).filter(PurchaseRequest.property_id == property_id).count()
    )

    return ListingAnalytics(
        property_id=prop.id,
        title=prop.title,
        total_views=prop.views_count or 0,
        spatial_questions=spatial_total,
        top_zones=top_zones,
        booking_requests=booking_requests,
        purchase_requests=purchase_requests,
    )
