"""Hosted Nestora Pay checkout page + payment processing.

These endpoints are public (no JWT) because they're opened in a browser tab,
exactly like a real hosted Stripe Checkout page. The session token is the
unguessable secret that authorizes the payment.

The page is styled to match Nestora's editorial look (warm paper, terracotta +
pine, Fraunces/Hanken type, the arch/house logo). No emojis — SVG icons only.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Form, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from sqlalchemy.orm import Session

from models import get_db, Booking, Property
from modules.payments.service import (
    get_session,
    charge,
    cancel,
    PaymentError,
)
from modules.bookings.crud import confirm_booking


router = APIRouter(prefix="/pay", tags=["Payments (Nestora Pay)"])


_LOGO = (
    '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" '
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
    '<path d="M5 21 V11 Q12 3 19 11 V21"/><path d="M10 21 V17 Q12 14 14 17 V21"/></svg>'
)
_CHECK = (
    '<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" '
    'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-11"/></svg>'
)
_LOCK = (
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" '
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
    '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>'
)


def _page(title: str, body: str, status_code: int = 200) -> HTMLResponse:
    html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>{title} · Nestora Pay</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;1,9..144,500&family=Hanken+Grotesk:wght@400;600;700&display=swap" rel="stylesheet"/>
<style>
  :root {{
    --brand:#c2502e; --brand-600:#a83f22; --accent:#1f5c4d; --gold:#b8862f;
    --bg:#ece6da; --surface:#ffffff; --surface-2:#f4eee2;
    --line:#ddd3c1; --line-strong:#c4b8a0;
    --ink:#1c1813; --ink-2:#463f34; --ink-3:#6f6555; --ink-4:#968b78;
    --ok:#2f7d52; --danger:#b23b2e;
    --font:'Hanken Grotesk',system-ui,-apple-system,Segoe UI,sans-serif;
    --display:'Fraunces',Georgia,serif;
    --shadow-lg:0 24px 60px rgba(42,33,20,.16);
  }}
  * {{ box-sizing:border-box; }}
  body {{
    font-family:var(--font); color:var(--ink); margin:0; min-height:100vh;
    display:flex; align-items:center; justify-content:center; padding:24px;
    background-color:var(--bg);
    background-image:
      radial-gradient(circle at 18% 12%, rgba(194,80,46,.06), transparent 40%),
      radial-gradient(circle at 88% 8%, rgba(31,92,77,.06), transparent 36%);
  }}
  .wrap {{ width:420px; max-width:96vw; }}
  .topbar {{ display:flex; align-items:center; gap:9px; color:var(--brand);
             font-family:var(--display); font-weight:600; font-size:19px; margin-bottom:14px;
             justify-content:center; }}
  .topbar b {{ color:var(--ink); }} .topbar i {{ color:var(--brand); font-style:italic; }}
  .card {{ background:var(--surface); border:1px solid var(--line); border-radius:14px;
           box-shadow:var(--shadow-lg); padding:30px; }}
  .summary {{ display:flex; gap:14px; align-items:center; padding-bottom:18px; margin-bottom:18px;
              border-bottom:1px solid var(--line); }}
  .summary img {{ width:64px; height:64px; border-radius:10px; object-fit:cover; background:var(--surface-2); flex-shrink:0; }}
  .summary .ph {{ width:64px; height:64px; border-radius:10px; background:var(--surface-2); flex-shrink:0;
                  display:grid; place-content:center; color:var(--ink-4); }}
  .summary .t {{ font-weight:700; font-size:15px; line-height:1.3; }}
  .summary .s {{ color:var(--ink-3); font-size:13px; margin-top:3px; }}
  .amount-row {{ display:flex; align-items:baseline; justify-content:space-between; margin-bottom:6px; }}
  .amount-row .lbl {{ color:var(--ink-3); font-size:13px; }}
  .amount {{ font-family:var(--display); font-size:34px; font-weight:600; letter-spacing:-.01em; }}
  .amount span {{ font-family:var(--font); font-size:14px; color:var(--ink-3); font-weight:600; }}
  label {{ display:block; font-size:12px; font-weight:700; color:var(--ink-2); margin:14px 0 6px;
           text-transform:uppercase; letter-spacing:.04em; }}
  input {{ width:100%; padding:12px 13px; border:1px solid var(--line-strong); border-radius:8px;
           font-size:15px; font-family:var(--font); color:var(--ink); background:var(--surface); outline:none;
           transition:border-color .15s, box-shadow .15s; -webkit-appearance:none; }}
  input:focus {{ border-color:var(--brand); box-shadow:0 0 0 3px rgba(194,80,46,.14); }}
  .row {{ display:flex; gap:10px; }}
  button {{ width:100%; margin-top:20px; padding:14px; border:0; border-radius:8px;
            background:var(--brand); color:#fff; font-size:15.5px; font-weight:700; cursor:pointer;
            font-family:var(--font); transition:background .15s, transform .1s; }}
  button:hover {{ background:var(--brand-600); }}
  button:active {{ transform:translateY(1px); }}
  .secure {{ display:flex; align-items:center; justify-content:center; gap:6px; margin-top:14px;
             color:var(--ink-4); font-size:12px; }}
  .hint {{ margin-top:12px; font-size:11.5px; color:var(--ink-4); text-align:center; line-height:1.6; }}
  .err {{ background:#f6dfd9; color:var(--danger); padding:11px 13px; border-radius:8px; font-size:13px;
          font-weight:600; margin-top:16px; }}
  a.cancel {{ display:block; text-align:center; margin-top:14px; color:var(--ink-3); font-size:13px; font-weight:600; }}
  a.cancel:hover {{ color:var(--brand); }}
  .center {{ text-align:center; }}
  .badge {{ width:74px; height:74px; border-radius:50%; display:grid; place-content:center; margin:4px auto 16px; }}
  .badge.ok {{ background:#dcefe2; color:var(--ok); }}
  .badge.no {{ background:#f6dfd9; color:var(--danger); }}
  h2 {{ font-family:var(--display); font-weight:600; font-size:24px; margin:0 0 8px; }}
  p {{ color:var(--ink-2); margin:6px 0; line-height:1.6; }}
  .muted {{ color:var(--ink-3); font-size:13.5px; }}
</style>
</head>
<body><div class="wrap">
  <div class="topbar">{_LOGO} <span><b>Nest</b><i>o</i><b>ra</b></span></div>
  <div class="card">{body}</div>
</div></body>
</html>"""
    return HTMLResponse(content=html, status_code=status_code)


def _cover_url(prop: Property) -> str | None:
    try:
        from modules.properties.crud import cover_url
        return cover_url(prop)
    except Exception:
        return None


@router.get("/{token}", response_class=HTMLResponse)
def checkout_page(token: str, db: Session = Depends(get_db), error: str | None = None):
    session = get_session(db, token)
    if not session:
        return _page("Not found", "<div class='center'><h2>Session not found</h2>"
                     "<p class='muted'>This payment link is invalid or has expired.</p></div>", 404)

    booking = db.query(Booking).filter(Booking.id == session.booking_id).first()
    prop = db.query(Property).filter(Property.id == booking.property_id).first() if booking else None
    title = prop.title if prop else f"Booking #{session.booking_id}"
    cover = _cover_url(prop) if prop else None

    nights = ""
    if booking:
        n = max((booking.end_date - booking.start_date).days, 1)
        nights = f"{booking.start_date:%d %b} – {booking.end_date:%d %b} · {n} night{'s' if n != 1 else ''}"

    if session.status == "paid":
        return _page(
            "Paid",
            f"<div class='center'><div class='badge ok'>{_CHECK}</div>"
            "<h2>Already paid</h2><p class='muted'>This booking is already confirmed. "
            "You can close this window.</p></div>",
        )

    media = (f"<img src='{cover}' alt=''/>" if cover
             else f"<div class='ph'>{_LOGO}</div>")
    err_html = f"<div class='err'>{error}</div>" if error else ""
    body = f"""
      <div class="summary">
        {media}
        <div>
          <div class="t">{title}</div>
          <div class="s">{nights}</div>
        </div>
      </div>
      <div class="amount-row">
        <span class="lbl">Total to pay</span>
      </div>
      <div class="amount">${session.amount:.2f} <span>{session.currency.upper()}</span></div>
      <form method="post" action="/pay/{token}">
        <label>Card number</label>
        <input name="card_number" placeholder="4242 4242 4242 4242" autocomplete="off" inputmode="numeric"/>
        <div class="row">
          <div style="flex:1"><label>Expiry</label><input name="exp" placeholder="12/30"/></div>
          <div style="width:120px"><label>CVC</label><input name="cvc" placeholder="123" inputmode="numeric"/></div>
        </div>
        <label>Name on card</label>
        <input name="name" placeholder="Jane Doe"/>
        <button type="submit">Pay ${session.amount:.2f}</button>
      </form>
      {err_html}
      <div class="secure">{_LOCK} Secure test checkout — no real charge</div>
      <div class="hint">Test cards: 4242 4242 4242 4242 succeeds · 4000 0000 0000 0002 declines.</div>
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

    booking = db.query(Booking).filter(Booking.id == session.booking_id).first()
    if booking:
        confirm_booking(db, booking)

    return _page(
        "Payment complete",
        f"<div class='center'><div class='badge ok'>{_CHECK}</div>"
        "<h2>Payment complete</h2>"
        f"<p>Paid <strong>${session.amount:.2f}</strong>. Your booking is confirmed.</p>"
        "<p class='muted'>You can close this window and return to Nestora.</p></div>",
    )


@router.get("/{token}/cancel", response_class=HTMLResponse)
def cancel_payment(token: str, db: Session = Depends(get_db)):
    session = get_session(db, token)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    cancel(db, session)
    return _page(
        "Cancelled",
        "<div class='center'><h2>Payment cancelled</h2>"
        "<p class='muted'>No charge was made. You can close this window.</p></div>",
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
