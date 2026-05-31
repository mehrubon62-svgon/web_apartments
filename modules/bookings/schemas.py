from datetime import datetime, date

from pydantic import BaseModel

from models import BookingStatus, PaymentStatus


class BookingCreate(BaseModel):
    property_id: int
    start_date: date
    end_date: date


class BookingOut(BaseModel):
    id: int
    property_id: int
    renter_id: int
    start_date: date
    end_date: date
    total_price: float
    status: BookingStatus
    payment_status: PaymentStatus
    created_at: datetime

    class Config:
        from_attributes = True


class BookingList(BaseModel):
    items: list[BookingOut]
    total: int


class CheckoutResponse(BaseModel):
    booking_id: int
    # MockPay hosted checkout page URL — open it to pay.
    checkout_url: str
    payment_token: str
