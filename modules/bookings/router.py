from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
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
)
from dependencies import get_current_user
from modules.bookings.schemas import (
    BookingCreate,
    BookingOut,
    BookingList,
    CheckoutResponse,
)
from modules.bookings.crud import confirm_booking
from modules.payments.service import create_session, checkout_url


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

    Creates a pending booking and a MockPay checkout session, then returns a
    hosted checkout URL. Open it to 'pay' and the booking is confirmed.
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

    session = create_session(db, booking)
    return CheckoutResponse(
        booking_id=booking.id,
        checkout_url=checkout_url(session.token),
        payment_token=session.token,
    )


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


@router.get("/{booking_id}", response_model=BookingOut)
def get_booking(
    booking_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking or booking.renter_id != current_user.id:
        raise HTTPException(status_code=404, detail="Booking not found")
    return BookingOut.model_validate(booking)


@router.post("/{booking_id}/pay-test", response_model=BookingOut)
def pay_test(
    booking_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Programmatic 'successful payment' for tests/demos without opening the page."""
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking or booking.renter_id != current_user.id:
        raise HTTPException(status_code=404, detail="Booking not found")
    confirm_booking(db, booking)
    db.refresh(booking)
    return BookingOut.model_validate(booking)


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
