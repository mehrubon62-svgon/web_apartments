from sqlalchemy.orm import Session

from models import Booking, BookingStatus, PaymentStatus, NotificationType
from modules.notifications.crud import create_notification


def confirm_booking(db: Session, booking: Booking) -> Booking:
    """Mark a booking as paid + confirmed and notify the renter (realtime)."""
    if booking.payment_status == PaymentStatus.paid:
        return booking
    booking.status = BookingStatus.confirmed
    booking.payment_status = PaymentStatus.paid
    db.commit()
    db.refresh(booking)
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
    return booking
