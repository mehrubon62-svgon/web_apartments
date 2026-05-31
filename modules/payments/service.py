"""MockPay — a self-contained payment gateway that imitates Stripe Checkout.

No external keys or network. Flow mirrors Stripe:

    create_session()  -> returns a checkout_url (our hosted page)
    GET  /pay/{token} -> hosted checkout page (card form)
    POST /pay/{token} -> "charge" the card, mark session paid, confirm booking

Test cards (Stripe-style):
    4242 4242 4242 4242  -> success
    4000 0000 0000 0002  -> declined
Any future expiry and any 3-digit CVC are accepted for the success card.
"""
from __future__ import annotations

import secrets
from datetime import timedelta

from sqlalchemy.orm import Session

from models import PaymentSession, Booking, utcnow
from config import PAYMENTS_BASE_URL, PAYMENT_CURRENCY, PAYMENT_SESSION_TTL_MIN


SUCCESS_CARD = "4242424242424242"
DECLINE_CARD = "4000000000000002"


def create_session(db: Session, booking: Booking) -> PaymentSession:
    token = secrets.token_urlsafe(24)
    session = PaymentSession(
        token=token,
        booking_id=booking.id,
        amount=booking.total_price,
        currency=PAYMENT_CURRENCY,
        status="open",
        expires_at=utcnow() + timedelta(minutes=PAYMENT_SESSION_TTL_MIN),
    )
    db.add(session)
    booking.payment_token = token
    db.commit()
    db.refresh(session)
    return session


def checkout_url(token: str) -> str:
    return f"{PAYMENTS_BASE_URL.rstrip('/')}/pay/{token}"


def get_session(db: Session, token: str) -> PaymentSession | None:
    return db.query(PaymentSession).filter(PaymentSession.token == token).first()


def _normalize_card(number: str) -> str:
    return (number or "").replace(" ", "").replace("-", "")


class PaymentError(Exception):
    pass


def charge(db: Session, session: PaymentSession, card_number: str) -> bool:
    """Process a 'payment'. Returns True on success, raises PaymentError otherwise."""
    if session.status == "paid":
        return True
    if session.status != "open":
        raise PaymentError(f"Session is {session.status}")

    expires_at = session.expires_at
    if expires_at.tzinfo is None:
        from datetime import timezone
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < utcnow():
        session.status = "expired"
        db.commit()
        raise PaymentError("Payment session expired")

    card = _normalize_card(card_number)
    if card == DECLINE_CARD:
        raise PaymentError("Your card was declined.")
    if card != SUCCESS_CARD:
        raise PaymentError("Invalid card. Use the test card 4242 4242 4242 4242.")

    session.status = "paid"
    db.commit()
    return True


def cancel(db: Session, session: PaymentSession) -> None:
    if session.status == "open":
        session.status = "cancelled"
        db.commit()
