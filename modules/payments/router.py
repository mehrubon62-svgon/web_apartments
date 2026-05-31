"""Hosted MockPay checkout page + payment processing.

These endpoints are public (no JWT) because they're opened in a browser tab,
exactly like a real hosted Stripe Checkout page. The session token is the
unguessable secret that authorizes the payment.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from sqlalchemy.orm import Session

from models import get_db, Booking, Property
from modules.payments.service import (
    get_session,
    charge,
    cancel,
    PaymentError,
    SUCCESS_CARD,
)
from modules.bookings.crud import confirm_booking


router = APIRouter(prefix="/pay", tags=["Payments (MockPay)"])


def _page(title: str, body: str, status_code: int = 200) -> HTMLResponse:
    html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>{title}</title>
<style>
  * {{ box-sizing: border-box; }}
  body {{ font-family: -apple-system, Segoe UI, Roboto, sans-serif; background:#f6f9fc;
          margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; }}
  .card {{ background:#fff; width:380px; max-width:92vw; border-radius:14px;
           box-shadow:0 8px 30px rgba(0,0,0,.08); padding:28px; }}
  .brand {{ font-weight:700; color:#635bff; font-size:20px; margin-bottom:4px; }}
  .muted {{ color:#6b7280; font-size:13px; }}
  .amount {{ font-size:30px; font-weight:700; margin:14px 0 18px; }}
  label {{ display:block; font-size:12px; color:#374151; margin:12px 0 6px; }}
  input {{ width:100%; padding:11px 12px; border:1px solid #e5e7eb; border-radius:8px; font-size:15px; }}
  .row {{ display:flex; gap:10px; }}
  button {{ width:100%; margin-top:18px; padding:12px; border:0; border-radius:8px;
            background:#635bff; color:#fff; font-size:15px; font-weight:600; cursor:pointer; }}
  button:hover {{ background:#5249e0; }}
  .hint {{ margin-top:14px; font-size:12px; color:#9ca3af; }}
  .err {{ background:#fef2f2; color:#b91c1c; padding:10px 12px; border-radius:8px; font-size:13px; margin-top:14px; }}
  .ok {{ text-align:center; }}
  .ok .check {{ font-size:46px; }}
  a.cancel {{ display:block; text-align:center; margin-top:12px; color:#6b7280; font-size:13px; }}
</style>
</head>
<body><div class="card">{body}</div></body>
</html>"""
    return HTMLResponse(content=html, status_code=status_code)


@router.get("/{token}", response_class=HTMLResponse)
def checkout_page(token: str, db: Session = Depends(get_db), error: str | None = None):
    session = get_session(db, token)
    if not session:
        return _page("Payment not found", "<div class='brand'>MockPay</div><p>Session not found.</p>", 404)

    booking = db.query(Booking).filter(Booking.id == session.booking_id).first()
    prop = db.query(Property).filter(Property.id == booking.property_id).first() if booking else None
    title = prop.title if prop else f"Booking #{session.booking_id}"

    if session.status == "paid":
        return _page(
            "Payment complete",
            "<div class='ok'><div class='check'>✅</div>"
            "<div class='brand'>MockPay</div><p>Payment already completed.</p></div>",
        )

    err_html = f"<div class='err'>{error}</div>" if error else ""
    body = f"""
      <div class="brand">MockPay</div>
      <div class="muted">{title}</div>
      <div class="amount">${session.amount:.2f} <span class="muted">{session.currency.upper()}</span></div>
      <form method="post" action="/pay/{token}">
        <label>Card number</label>
        <input name="card_number" placeholder="4242 4242 4242 4242" value="{SUCCESS_CARD}" autocomplete="off"/>
        <div class="row">
          <div style="flex:1"><label>Expiry</label><input name="exp" placeholder="12/30" value="12/30"/></div>
          <div style="width:110px"><label>CVC</label><input name="cvc" placeholder="123" value="123"/></div>
        </div>
        <label>Name on card</label>
        <input name="name" placeholder="Jane Doe" value="Jane Doe"/>
        <button type="submit">Pay ${session.amount:.2f}</button>
      </form>
      {err_html}
      <div class="hint">Test cards: 4242&nbsp;4242&nbsp;4242&nbsp;4242 succeeds · 4000&nbsp;0000&nbsp;0000&nbsp;0002 declines.</div>
      <a class="cancel" href="/pay/{token}/cancel">Cancel and go back</a>
    """
    return _page("Checkout", body)


@router.post("/{token}", response_class=HTMLResponse)
def process_payment(
    token: str,
    card_number: str = Form(...),
    exp: str = Form(""),
    cvc: str = Form(""),
    name: str = Form(""),
    db: Session = Depends(get_db),
):
    session = get_session(db, token)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        charge(db, session, card_number)
    except PaymentError as exc:
        return checkout_page(token, db=db, error=str(exc))

    # Payment ok -> confirm the booking (this is our internal "webhook").
    booking = db.query(Booking).filter(Booking.id == session.booking_id).first()
    if booking:
        confirm_booking(db, booking)

    return _page(
        "Payment complete",
        "<div class='ok'><div class='check'>✅</div>"
        "<div class='brand'>MockPay</div>"
        f"<p>Paid ${session.amount:.2f}. Your booking is confirmed.</p>"
        "<p class='muted'>You can close this window.</p></div>",
    )


@router.get("/{token}/cancel", response_class=HTMLResponse)
def cancel_payment(token: str, db: Session = Depends(get_db)):
    session = get_session(db, token)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    cancel(db, session)
    return _page(
        "Payment cancelled",
        "<div class='brand'>MockPay</div><p>Payment cancelled. You can close this window.</p>",
    )


@router.get("/{token}/status")
def payment_status(token: str, db: Session = Depends(get_db)):
    """JSON status endpoint (frontends can poll this instead of the webhook)."""
    session = get_session(db, token)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return JSONResponse(
        {
            "token": session.token,
            "booking_id": session.booking_id,
            "amount": session.amount,
            "currency": session.currency,
            "status": session.status,
        }
    )
