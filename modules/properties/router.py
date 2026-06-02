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
    InfrastructurePOI,
    DealType,
    PropertyType,
)
from dependencies import get_current_user, get_optional_user, require_seller
from modules.geo.service import geocode, haversine_km
from modules.ratelimit.limiter import rate_limit
from modules.properties.schemas import (
    PropertyCreate,
    PropertyUpdate,
    PropertyOut,
    PropertyList,
    MediaOut,
    MapMarker,
    InfrastructureMarker,
    PriceHistoryPoint,
    ReviewIn,
    ReviewOut,
    AvailabilityIn,
    AvailabilityOut,
    MortgageRequest,
    MortgageResponse,
    ComparisonRow,
    ComparisonResult,
    AIReviewResult,
    TranslationResult,
)
from modules.properties.crud import (
    create_property,
    get_property,
    update_property,
    delete_property,
    search_properties,
    text_search,
    map_markers,
    has_tour,
    cover_url,
    is_favorited,
    avg_rating,
    seller_rating,
    increment_views,
)


router = APIRouter(prefix="/properties", tags=["Properties"])


def serialize(db: Session, prop: Property, user_id: int | None) -> PropertyOut:
    # Seller's aggregate rating — relevant for sale listings (shown on cards/detail).
    s_avg, s_cnt = (None, 0)
    if prop.deal_type == DealType.sale and prop.seller_id:
        s_avg, s_cnt = seller_rating(db, prop.seller_id)
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
        cover_url=cover_url(prop),
        media=[MediaOut.model_validate(m) for m in prop.media],
        has_tour=has_tour(db, prop.id),
        is_favorited=is_favorited(db, user_id, prop.id) if user_id else False,
        avg_rating=avg_rating(db, prop.id),
        seller_rating=s_avg,
        seller_reviews_count=s_cnt,
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
    seed: int | None = Query(None, description="Shuffle seed; pass a value to randomize order per page-load"),
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
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
        seed=seed,
    )
    return PropertyList(
        items=[serialize(db, p, current_user.id if current_user else None) for p in items],
        total=total,
    )


# ===== Compare =====

@router.get("/search", response_model=PropertyList)
def search_text(
    q: str = Query(..., min_length=1, max_length=100, description="Search title, description, address"),
    limit: int = Query(20, le=100),
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    """Global text search across title, description and address."""
    items, total = text_search(db, q, limit, offset)
    return PropertyList(
        items=[serialize(db, p, current_user.id if current_user else None) for p in items],
        total=total,
    )


@router.get("/compare", response_model=ComparisonResult)
def compare(
    ids: str = Query(..., description="Comma-separated property ids, e.g. '1,2,3'"),
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    """Compare 2-4 properties side by side (price, area, price/m², rating)."""
    try:
        id_list = [int(x) for x in ids.split(",") if x.strip()]
    except ValueError:
        raise HTTPException(status_code=400, detail="ids must be comma-separated integers")
    if not (2 <= len(id_list) <= 4):
        raise HTTPException(status_code=400, detail="Provide between 2 and 4 ids")

    rows: list[ComparisonRow] = []
    for pid in id_list:
        prop = get_property(db, pid)
        if not prop or prop.status == PropertyStatus.deleted:
            raise HTTPException(status_code=404, detail=f"Property {pid} not found")
        ppsqm = round(prop.price / prop.area, 2) if prop.area else 0.0
        rows.append(
            ComparisonRow(
                id=prop.id,
                title=prop.title,
                type=prop.type,
                deal_type=prop.deal_type,
                price=prop.price,
                area=prop.area,
                rooms=prop.rooms,
                price_per_sqm=ppsqm,
                avg_rating=avg_rating(db, prop.id),
                has_tour=has_tour(db, prop.id),
            )
        )

    cheapest = min(rows, key=lambda r: r.price)
    largest = max(rows, key=lambda r: r.area)
    best_value = min(rows, key=lambda r: r.price_per_sqm)
    return ComparisonResult(
        items=rows,
        cheapest_id=cheapest.id,
        largest_id=largest.id,
        best_value_id=best_value.id,
    )

@router.get("/map", response_model=list[MapMarker])
def map_view(
    deal_type: DealType | None = None,
    type: PropertyType | None = None,
    min_price: float | None = None,
    max_price: float | None = None,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    """Markers for the Mapbox map (only active listings with coordinates)."""
    props = map_markers(
        db, deal_type=deal_type, type=type, min_price=min_price, max_price=max_price
    )
    return [
        MapMarker(
            id=p.id, lat=p.lat, lng=p.lng, price=p.price,
            type=p.type, deal_type=p.deal_type, title=p.title,
            cover_url=cover_url(p),
        )
        for p in props
    ]


@router.get("/map/infrastructure", response_model=list[InfrastructureMarker])
def map_infrastructure(
    kind: str | None = Query(None, description="Filter: metro | school | shop"),
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    """Infrastructure markers (metro, schools, shops) for the map overlay."""
    q = db.query(InfrastructurePOI)
    if kind:
        q = q.filter(InfrastructurePOI.kind == kind)
    pois = q.all()
    return [InfrastructureMarker.model_validate(p) for p in pois]


@router.get("/nearby", response_model=PropertyList)
def nearby(
    lat: float,
    lng: float,
    radius_km: float = Query(5.0, gt=0, le=100),
    deal_type: DealType | None = None,
    type: PropertyType | None = None,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    """Radius search from a geolocation point."""
    props = map_markers(db, deal_type=deal_type, type=type)
    within = []
    for p in props:
        if haversine_km(lat, lng, p.lat, p.lng) <= radius_km:
            within.append(p)
    return PropertyList(
        items=[serialize(db, p, current_user.id if current_user else None) for p in within],
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
    current_user: User | None = Depends(get_optional_user),
):
    prop = get_property(db, property_id)
    if not prop or prop.status == PropertyStatus.deleted:
        raise HTTPException(status_code=404, detail="Property not found")

    # Track the view (only for logged-in non-owners) and update recommendations.
    if current_user and prop.seller_id != current_user.id:
        from modules.history.crud import track_view
        track_view(db, current_user.id, prop.id)
        increment_views(db, prop)
        from modules.queue import enqueue
        from tasks import update_recommendations
        enqueue(update_recommendations, current_user.id)

    return serialize(db, prop, current_user.id if current_user else None)


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
        from modules.queue import enqueue
        from tasks import track_price_changes
        enqueue(track_price_changes, prop.id)

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

@router.get("/{property_id}/ai-review", response_model=AIReviewResult)
def ai_review(
    property_id: int,
    lang: str = Query("en", description="Response language: ru | en"),
    db: Session = Depends(get_db),
    current_user: User = Depends(rate_limit("ai_review")),
):
    """AI verdict on a listing: is it a good deal, overpriced, or a likely scam?

    Compares the price against similar active listings (same type + deal type),
    then asks the AI for a verdict with a deal score (0-100), scam risk and a
    short explanation. Falls back to a rule-based heuristic if AI is unavailable.
    """
    from modules.properties.review import review_property

    prop = get_property(db, property_id)
    if not prop or prop.status == PropertyStatus.deleted:
        raise HTTPException(status_code=404, detail="Property not found")
    result = review_property(db, prop, lang="ru" if lang == "ru" else "en")
    return AIReviewResult(**result)


@router.get("/{property_id}/translate", response_model=TranslationResult)
def translate_listing(
    property_id: int,
    lang: str = Query("ru", description="Target language: ru | en"),
    db: Session = Depends(get_db),
    current_user: User = Depends(rate_limit("translate")),
):
    """Translate a listing's title + description into the requested language using
    AI. If the text already appears to be in the target language, it's returned
    unchanged (translated=false)."""
    from modules.properties.translate import translate_property

    prop = get_property(db, property_id)
    if not prop or prop.status == PropertyStatus.deleted:
        raise HTTPException(status_code=404, detail="Property not found")
    target = "ru" if lang == "ru" else "en"
    return TranslationResult(**translate_property(prop, target))


@router.post("/translate-text")
def translate_text_endpoint(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(rate_limit("translate")),
):
    """Translate an arbitrary short text (e.g. a review) to ru|en. Body: {text, lang}."""
    from modules.properties.translate import translate_text
    text = str(payload.get("text") or "")
    lang = "ru" if str(payload.get("lang")) == "ru" else "en"
    return translate_text(text, lang)


@router.get("/{property_id}/similar", response_model=PropertyList)
def similar(
    property_id: int,
    limit: int = Query(6, le=20),
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    """Similar active listings: same deal type, then ranked by closeness in
    type, price and area (great for 'more like this' on a listing page)."""
    base = get_property(db, property_id)
    if not base or base.status == PropertyStatus.deleted:
        raise HTTPException(status_code=404, detail="Property not found")

    candidates, _ = search_properties(db, deal_type=base.deal_type, limit=500, offset=0)

    def score(p: Property) -> float:
        s = 0.0
        if p.type == base.type:
            s += 2.0
        if base.price > 0:
            s += max(0.0, 1.0 - abs(p.price - base.price) / base.price)
        if base.area > 0:
            s += max(0.0, 1.0 - abs(p.area - base.area) / base.area)
        if base.rooms and p.rooms == base.rooms:
            s += 0.5
        return s

    ranked = sorted(
        (p for p in candidates if p.id != base.id),
        key=score,
        reverse=True,
    )[:limit]
    return PropertyList(
        items=[serialize(db, p, current_user.id if current_user else None) for p in ranked],
        total=len(ranked),
    )


@router.get("/{property_id}/price-history", response_model=list[PriceHistoryPoint])
def price_history(
    property_id: int,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
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
    current_user: User | None = Depends(get_optional_user),
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
    if prop.seller_id == current_user.id:
        raise HTTPException(status_code=403, detail="You cannot review your own listing")
    # Only buyers who actually transacted can review:
    #  - rentals: a booking exists for this user + property
    #  - sales: a viewing/purchase request was submitted by this user
    from models import Booking, PurchaseRequest, DealType
    if prop.deal_type == DealType.rent:
        has_deal = (
            db.query(Booking)
            .filter(Booking.property_id == property_id, Booking.renter_id == current_user.id)
            .first()
            is not None
        )
        gate_msg = "You can review a rental only after booking it"
    else:
        has_deal = (
            db.query(PurchaseRequest)
            .filter(PurchaseRequest.property_id == property_id, PurchaseRequest.buyer_id == current_user.id)
            .first()
            is not None
        )
        gate_msg = "You can review a listing only after requesting a viewing"
    if not has_deal:
        raise HTTPException(status_code=403, detail=gate_msg)
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


@router.put("/{property_id}/reviews/{review_id}", response_model=ReviewOut)
def edit_review(
    property_id: int,
    review_id: int,
    data: ReviewIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    review = db.query(Review).filter(Review.id == review_id, Review.property_id == property_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    if review.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your review")
    review.rating = data.rating
    review.text = data.text
    db.commit()
    db.refresh(review)
    return ReviewOut.model_validate(review)


@router.delete("/{property_id}/reviews/{review_id}")
def delete_review(
    property_id: int,
    review_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    review = db.query(Review).filter(Review.id == review_id, Review.property_id == property_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    if review.user_id != current_user.id and current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Not your review")
    db.delete(review)
    db.commit()
    return {"detail": "Review deleted"}


@router.get("/{property_id}/can-review")
def can_review(
    property_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Whether the current user is eligible to leave a review for this listing
    (transacted + hasn't reviewed yet), plus their existing review id if any."""
    from models import Booking, PurchaseRequest, DealType
    prop = get_property(db, property_id)
    if not prop or prop.status == PropertyStatus.deleted:
        raise HTTPException(status_code=404, detail="Property not found")
    if prop.seller_id == current_user.id:
        return {"can_review": False, "reason": "own_listing", "existing_review_id": None}
    if prop.deal_type == DealType.rent:
        transacted = (
            db.query(Booking)
            .filter(Booking.property_id == property_id, Booking.renter_id == current_user.id)
            .first() is not None
        )
        reason = None if transacted else "need_booking"
    else:
        transacted = (
            db.query(PurchaseRequest)
            .filter(PurchaseRequest.property_id == property_id, PurchaseRequest.buyer_id == current_user.id)
            .first() is not None
        )
        reason = None if transacted else "need_request"
    existing = (
        db.query(Review)
        .filter(Review.property_id == property_id, Review.user_id == current_user.id)
        .first()
    )
    return {
        "can_review": transacted and existing is None,
        "transacted": transacted,
        "reason": "already_reviewed" if existing else reason,
        "existing_review_id": existing.id if existing else None,
    }


# ===== Availability calendar (rent) =====

@router.get("/{property_id}/availability", response_model=list[AvailabilityOut])
def get_availability(
    property_id: int,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
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
