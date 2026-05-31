from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, selectinload

from models import (
    get_db,
    User,
    Property,
    PropertyStatus,
    PriceHistory,
    Review,
    Availability,
    DealType,
    PropertyType,
)
from dependencies import get_current_user, require_seller
from modules.geo.service import geocode, haversine_km
from modules.properties.schemas import (
    PropertyCreate,
    PropertyUpdate,
    PropertyOut,
    PropertyList,
    MediaOut,
    MapMarker,
    PriceHistoryPoint,
    ReviewIn,
    ReviewOut,
    AvailabilityIn,
    AvailabilityOut,
    MortgageRequest,
    MortgageResponse,
)
from modules.properties.crud import (
    create_property,
    get_property,
    update_property,
    delete_property,
    search_properties,
    map_markers,
    has_tour,
    is_favorited,
    avg_rating,
    increment_views,
)


router = APIRouter(prefix="/properties", tags=["Properties"])


def serialize(db: Session, prop: Property, user_id: int | None) -> PropertyOut:
    return PropertyOut(
        id=prop.id,
        seller=prop.seller,
        title=prop.title,
        description=prop.description,
        type=prop.type,
        deal_type=prop.deal_type,
        rent_term=prop.rent_term,
        price=prop.price,
        area=prop.area,
        rooms=prop.rooms,
        address=prop.address,
        lat=prop.lat,
        lng=prop.lng,
        house_rules=prop.house_rules,
        status=prop.status,
        views_count=prop.views_count or 0,
        created_at=prop.created_at,
        media=[MediaOut.model_validate(m) for m in prop.media],
        has_tour=has_tour(db, prop.id),
        is_favorited=is_favorited(db, user_id, prop.id) if user_id else False,
        avg_rating=avg_rating(db, prop.id),
    )


# ===== Catalog & filters =====

@router.get("", response_model=PropertyList)
def list_properties(
    deal_type: DealType | None = None,
    type: PropertyType | None = None,
    min_price: float | None = None,
    max_price: float | None = None,
    min_area: float | None = None,
    max_area: float | None = None,
    rooms: int | None = None,
    limit: int = Query(20, le=100),
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items, total = search_properties(
        db,
        deal_type=deal_type,
        type=type,
        min_price=min_price,
        max_price=max_price,
        min_area=min_area,
        max_area=max_area,
        rooms=rooms,
        limit=limit,
        offset=offset,
    )
    return PropertyList(
        items=[serialize(db, p, current_user.id) for p in items],
        total=total,
    )


# ===== Map =====

@router.get("/map", response_model=list[MapMarker])
def map_view(
    deal_type: DealType | None = None,
    type: PropertyType | None = None,
    min_price: float | None = None,
    max_price: float | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Markers for the Mapbox map (only active listings with coordinates)."""
    props = map_markers(
        db, deal_type=deal_type, type=type, min_price=min_price, max_price=max_price
    )
    return [
        MapMarker(
            id=p.id, lat=p.lat, lng=p.lng, price=p.price,
            type=p.type, deal_type=p.deal_type, title=p.title,
        )
        for p in props
    ]


@router.get("/nearby", response_model=PropertyList)
def nearby(
    lat: float,
    lng: float,
    radius_km: float = Query(5.0, gt=0, le=100),
    deal_type: DealType | None = None,
    type: PropertyType | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Radius search from a geolocation point."""
    props = map_markers(db, deal_type=deal_type, type=type)
    within = []
    for p in props:
        if haversine_km(lat, lng, p.lat, p.lng) <= radius_km:
            within.append(p)
    return PropertyList(
        items=[serialize(db, p, current_user.id) for p in within],
        total=len(within),
    )


# ===== Create / read / update / delete =====

@router.post("", response_model=PropertyOut, status_code=201)
def create(
    data: PropertyCreate,
    db: Session = Depends(get_db),
    seller: User = Depends(require_seller),
):
    payload = data.model_dump(exclude={"media"})

    # Location: manual pin wins; otherwise geocode the address (Mapbox).
    if (payload.get("lat") is None or payload.get("lng") is None) and payload.get("address"):
        coords = geocode(payload["address"])
        if coords:
            payload["lat"], payload["lng"] = coords

    if data.deal_type == DealType.rent and data.rent_term is None:
        raise HTTPException(status_code=400, detail="rent_term is required for rentals")

    prop = create_property(
        db,
        seller_id=seller.id,
        data=payload,
        media=[m.model_dump() for m in data.media],
    )
    return serialize(db, prop, seller.id)


@router.get("/{property_id}", response_model=PropertyOut)
def retrieve(
    property_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    prop = get_property(db, property_id)
    if not prop or prop.status == PropertyStatus.deleted:
        raise HTTPException(status_code=404, detail="Property not found")

    # Track the view (skip the owner) and update recommendations in the background.
    if prop.seller_id != current_user.id:
        from modules.history.crud import track_view
        track_view(db, current_user.id, prop.id)
        increment_views(db, prop)
        try:
            from tasks import update_recommendations
            update_recommendations.delay(current_user.id)
        except Exception:
            pass

    return serialize(db, prop, current_user.id)


@router.put("/{property_id}", response_model=PropertyOut)
def edit(
    property_id: int,
    data: PropertyUpdate,
    db: Session = Depends(get_db),
    seller: User = Depends(require_seller),
):
    prop = get_property(db, property_id)
    if not prop or prop.status == PropertyStatus.deleted:
        raise HTTPException(status_code=404, detail="Property not found")
    if prop.seller_id != seller.id and seller.role.value != "admin":
        raise HTTPException(status_code=403, detail="Not your listing")

    fields = data.model_dump(exclude_unset=True)

    # Re-geocode if the address changed but no explicit pin was provided.
    if fields.get("address") and "lat" not in fields and "lng" not in fields:
        coords = geocode(fields["address"])
        if coords:
            fields["lat"], fields["lng"] = coords

    old_price = prop.price
    prop = update_property(db, prop, fields)

    # Price dropped -> let the tracker task notify watchers.
    if "price" in fields and fields["price"] is not None and prop.price < old_price:
        try:
            from tasks import track_price_changes
            track_price_changes.delay(prop.id)
        except Exception:
            pass

    return serialize(db, prop, seller.id)


@router.delete("/{property_id}")
def remove(
    property_id: int,
    db: Session = Depends(get_db),
    seller: User = Depends(require_seller),
):
    prop = get_property(db, property_id)
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    if prop.seller_id != seller.id and seller.role.value != "admin":
        raise HTTPException(status_code=403, detail="Not your listing")
    delete_property(db, prop)
    return {"detail": "Property deleted"}


# ===== Price history (sale) =====

@router.get("/{property_id}/price-history", response_model=list[PriceHistoryPoint])
def price_history(
    property_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    prop = get_property(db, property_id)
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    points = (
        db.query(PriceHistory)
        .filter(PriceHistory.property_id == property_id)
        .order_by(PriceHistory.recorded_at.asc())
        .all()
    )
    return [PriceHistoryPoint.model_validate(p) for p in points]


# ===== Mortgage calculator (sale) =====

@router.post("/{property_id}/mortgage", response_model=MortgageResponse)
def mortgage(
    property_id: int,
    data: MortgageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    prop = get_property(db, property_id)
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")

    principal = max(prop.price - data.down_payment, 0.0)
    months = data.years * 12
    monthly_rate = data.annual_rate / 100 / 12
    if monthly_rate == 0:
        monthly = principal / months
    else:
        factor = (1 + monthly_rate) ** months
        monthly = principal * monthly_rate * factor / (factor - 1)
    total_paid = monthly * months
    return MortgageResponse(
        principal=round(principal, 2),
        monthly_payment=round(monthly, 2),
        total_paid=round(total_paid, 2),
        total_interest=round(total_paid - principal, 2),
    )


# ===== Reviews (rent) =====

@router.get("/{property_id}/reviews", response_model=list[ReviewOut])
def list_reviews(
    property_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    reviews = (
        db.query(Review)
        .options(selectinload(Review.user))
        .filter(Review.property_id == property_id)
        .order_by(Review.created_at.desc())
        .all()
    )
    return [ReviewOut.model_validate(r) for r in reviews]


@router.post("/{property_id}/reviews", response_model=ReviewOut, status_code=201)
def add_review(
    property_id: int,
    data: ReviewIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    prop = get_property(db, property_id)
    if not prop or prop.status == PropertyStatus.deleted:
        raise HTTPException(status_code=404, detail="Property not found")
    existing = (
        db.query(Review)
        .filter(Review.property_id == property_id, Review.user_id == current_user.id)
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="You already reviewed this property")
    review = Review(
        property_id=property_id,
        user_id=current_user.id,
        rating=data.rating,
        text=data.text,
    )
    db.add(review)
    db.commit()
    db.refresh(review)
    return ReviewOut.model_validate(review)


# ===== Availability calendar (rent) =====

@router.get("/{property_id}/availability", response_model=list[AvailabilityOut])
def get_availability(
    property_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (
        db.query(Availability)
        .filter(Availability.property_id == property_id)
        .order_by(Availability.start_date.asc())
        .all()
    )
    return [AvailabilityOut.model_validate(r) for r in rows]


@router.post("/{property_id}/availability", response_model=AvailabilityOut, status_code=201)
def add_availability(
    property_id: int,
    data: AvailabilityIn,
    db: Session = Depends(get_db),
    seller: User = Depends(require_seller),
):
    prop = get_property(db, property_id)
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    if prop.seller_id != seller.id and seller.role.value != "admin":
        raise HTTPException(status_code=403, detail="Not your listing")
    if data.end_date < data.start_date:
        raise HTTPException(status_code=400, detail="end_date must be after start_date")
    row = Availability(
        property_id=property_id,
        start_date=data.start_date,
        end_date=data.end_date,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return AvailabilityOut.model_validate(row)
