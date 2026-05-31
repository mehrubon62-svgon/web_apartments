from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from models import (
    get_db,
    User,
    Property,
    Booking,
    BookingStatus,
    PaymentStatus,
    DealType,
    PropertyStatus,
    NotificationType,
)
from dependencies import get_current_user
from config import (
    STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET,
    STRIPE_SUCCESS_URL,
    STRIPE_CANCEL_URL,
)
from modules.bookings.schemas import (
    BookingCreate,
    BookingOut,
    BookingList,
    CheckoutResponse,
)
from modules.notifications.crud import create_notification


router = APIRouter(prefix="/bookings", tags=["Bookings"])


def _nights(start: date, end: date) -> int:
    return max((end - start).days, 1)


def _overlaps(db: Session, property_id: int, start: date, end: date) -> bool:
    rows = (
        db.query(Booking)
        .filter(
            Booking.property_id == property_id,
            Booking.status != BookingStatus.cancelled,
        )
        .all()
    )
    for b in rows:
        if start < b.end_date and b.start_date < end:
            return True
    return False


@router.post("", response_model=CheckoutResponse, status_code=201)
def create_booking(
    data: BookingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Book a rental and start payment.

    Creates a pending booking, then returns a Stripe Checkout URL. If Stripe is
    not configured, returns dev_mode=True with a local confirm link so the flow
    is fully testable without keys.
    """
    prop = db.query(Property).filter(Property.id == data.property_id).first()
    if not prop or prop.status == PropertyStatus.deleted:
        raise HTTPException(status_code=404, detail="Property not found")
    if prop.deal_type != DealType.rent:
        raise HTTPException(status_code=400, detail="This property is not for rent")
    if data.end_date <= data.start_date:
        raise HTTPException(status_code=400, detail="end_date must be after start_date")
    if _overlaps(db, prop.id, data.start_date, data.end_date):
        raise HTTPException(status_code=409, detail="Selected dates are not available")

    nights = _nights(data.start_date, data.end_date)
    total = round(prop.price * nights, 2)

    booking = Booking(
        property_id=prop.id,
        renter_id=current_user.id,
        start_date=data.start_date,
        end_date=data.end_date,
        total_price=total,
        status=BookingStatus.pending,
        payment_status=PaymentStatus.unpaid,
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)

    if not STRIPE_SECRET_KEY:
        return CheckoutResponse(
            booking_id=booking.id,
            checkout_url=f"/bookings/{booking.id}/confirm-dev",
            dev_mode=True,
        )

    import stripe
    stripe.api_key = STRIPE_SECRET_KEY
    try:
        session = stripe.checkout.Session.create(
            mode="payment",
            success_url=STRIPE_SUCCESS_URL,
            cancel_url=STRIPE_CANCEL_URL,
            client_reference_id=str(booking.id),
            line_items=[
                {
                    "price_data": {
                        "currency": "usd",
                        "product_data": {"name": f"Booking #{booking.id}: {prop.title}"},
                        "unit_amount": int(total * 100),
                    },
                    "quantity": 1,
                }
            ],
            metadata={"booking_id": str(booking.id)},
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Stripe error: {exc}")

    booking.stripe_session_id = session.id
    db.commit()
    return CheckoutResponse(booking_id=booking.id, checkout_url=session.url, dev_mode=False)


def _confirm_booking(db: Session, booking: Booking) -> None:
    booking.status = BookingStatus.confirmed
    booking.payment_status = PaymentStatus.paid
    db.commit()
    create_notification(
        db,
        user_id=booking.renter_id,
        type=NotificationType.booking_confirmed,
        content={
            "title": "Booking confirmed",
            "body": f"Your booking #{booking.id} is confirmed and paid.",
            "booking_id": booking.id,
            "property_id": booking.property_id,
        },
    )


@router.post("/{booking_id}/confirm-dev", response_model=BookingOut)
def confirm_dev(
    booking_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Dev-only: simulate a successful payment when Stripe isn't configured."""
    if STRIPE_SECRET_KEY:
        raise HTTPException(status_code=400, detail="Stripe is configured; use Checkout")
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking or booking.renter_id != current_user.id:
        raise HTTPException(status_code=404, detail="Booking not found")
    _confirm_booking(db, booking)
    db.refresh(booking)
    return BookingOut.model_validate(booking)


@router.post("/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    """Stripe payment webhook -> confirm the booking on checkout.session.completed."""
    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=400, detail="Stripe not configured")
    import stripe

    payload = await request.body()
    sig = request.headers.get("stripe-signature")
    try:
        if STRIPE_WEBHOOK_SECRET:
            event = stripe.Webhook.construct_event(payload, sig, STRIPE_WEBHOOK_SECRET)
        else:
            import json
            event = json.loads(payload)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid webhook: {exc}")

    if event.get("type") == "checkout.session.completed":
        session = event["data"]["object"]
        booking_id = (session.get("metadata") or {}).get("booking_id") or session.get("client_reference_id")
        if booking_id:
            booking = db.query(Booking).filter(Booking.id == int(booking_id)).first()
            if booking and booking.payment_status != PaymentStatus.paid:
                _confirm_booking(db, booking)
    return {"received": True}


@router.get("", response_model=BookingList)
def my_bookings(
    limit: int = Query(50, le=100),
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = (
        db.query(Booking)
        .filter(Booking.renter_id == current_user.id)
        .order_by(Booking.created_at.desc())
    )
    total = q.count()
    items = q.offset(offset).limit(limit).all()
    return BookingList(items=[BookingOut.model_validate(b) for b in items], total=total)


@router.post("/{booking_id}/cancel", response_model=BookingOut)
def cancel(
    booking_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking or booking.renter_id != current_user.id:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.status == BookingStatus.confirmed:
        booking.payment_status = PaymentStatus.refunded
    booking.status = BookingStatus.cancelled
    db.commit()
    db.refresh(booking)
    return BookingOut.model_validate(booking)
