from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from models import get_db, User, EmailCodePurpose
from config import GOOGLE_CLIENT_ID, REQUIRE_EMAIL_VERIFICATION, EMAIL_CODE_TTL_MIN
from dependencies import get_current_user, get_optional_user, create_access_token
from modules.users.schemas import (
    UserRegister,
    UserLogin,
    UserMe,
    UserUpdate,
    Token,
    RefreshRequest,
    GoogleAuthRequest,
    SendCodeRequest,
    VerifyCodeRequest,
    PasswordResetRequest,
    PasswordChange,
)
from modules.users.crud import (
    get_user_by_email,
    get_user_by_id,
    get_user_by_google_sub,
    create_user,
    update_user,
    set_password,
    verify_password,
    create_refresh_token,
    get_refresh_token,
    revoke_refresh_token,
    revoke_all_user_tokens,
)
from modules.email.crud import create_code, verify_code
from modules.email.service import is_configured as email_configured


router = APIRouter(prefix="/auth", tags=["Auth"])
users_router = APIRouter(prefix="/users", tags=["Users"])


def _parse_purpose(value: str) -> EmailCodePurpose:
    try:
        return EmailCodePurpose(value)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid purpose. Use verify | login | reset")


def _send_code_async(email: str, code: str, purpose_value: str) -> None:
    """Deliver the code without blocking the request.

    Prefer the Celery task (real broker). If the broker is unreachable, send the
    email directly from a background thread so the HTTP response isn't held up by
    SMTP latency.
    """
    def _worker():
        from modules.queue import enqueue
        from tasks import send_email_code

        def _inline():
            from modules.email.service import send_email, code_email
            subject, text, html = code_email(code, purpose_value, EMAIL_CODE_TTL_MIN)
            send_email(email, subject, text, html)

        enqueue(send_email_code, email, code, purpose_value, fallback=_inline)

    import threading
    threading.Thread(target=_worker, daemon=True).start()


def _dispatch_code(db: Session, email: str, purpose: EmailCodePurpose) -> dict:
    """Create a code and trigger its delivery (non-blocking). In dev, when SMTP
    isn't configured, the code is returned so the flow stays testable."""
    code = create_code(db, email, purpose)
    _send_code_async(email, code, purpose.value)

    resp = {"detail": "Verification code sent", "expires_in_min": EMAIL_CODE_TTL_MIN}
    if not email_configured():
        resp["dev_code"] = code
    return resp


def _issue_tokens(db: Session, user: User) -> dict:
    access_token = create_access_token({"sub": str(user.id), "role": user.role.value})
    refresh = create_refresh_token(db, user.id)
    return {
        "access_token": access_token,
        "refresh_token": refresh.token,
        "token_type": "bearer",
    }


@router.post("/register", response_model=Token, status_code=201)
def register(data: UserRegister, db: Session = Depends(get_db)):
    """Register via email/password.

    A 6-digit confirmation code is emailed (via Celery). If
    REQUIRE_EMAIL_VERIFICATION is on, the user must call /auth/verify-email
    before logging in. Tokens are still returned so the frontend can proceed.
    """
    if get_user_by_email(db, data.email):
        raise HTTPException(status_code=400, detail="Email already registered")
    user = create_user(
        db,
        email=data.email,
        password=data.password,
        full_name=data.full_name,
        role=data.role,
        company_name=data.company_name,
    )
    _dispatch_code(db, user.email, EmailCodePurpose.verify)
    return _issue_tokens(db, user)


@router.post("/send-code")
def send_code(data: SendCodeRequest, db: Session = Depends(get_db)):
    """Send a verification code to an email (purpose: verify | login | reset)."""
    purpose = _parse_purpose(data.purpose)
    if purpose in (EmailCodePurpose.login, EmailCodePurpose.reset):
        if not get_user_by_email(db, data.email):
            raise HTTPException(status_code=404, detail="No account with this email")
    return _dispatch_code(db, data.email, purpose)


@router.post("/verify-email")
def verify_email(data: VerifyCodeRequest, db: Session = Depends(get_db)):
    """Confirm an email with the code that was sent to it."""
    purpose = _parse_purpose(data.purpose)
    ok, reason = verify_code(db, data.email, purpose, data.code)
    if not ok:
        raise HTTPException(status_code=400, detail=reason)

    user = get_user_by_email(db, data.email)
    if user:
        user.is_email_verified = True
        db.commit()
    return {"detail": "Email verified"}


@router.post("/login-code", response_model=Token)
def login_with_code(data: VerifyCodeRequest, db: Session = Depends(get_db)):
    """Passwordless login: verify the emailed code and return tokens."""
    ok, reason = verify_code(db, data.email, EmailCodePurpose.login, data.code)
    if not ok:
        raise HTTPException(status_code=400, detail=reason)
    user = get_user_by_email(db, data.email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is banned")
    user.is_email_verified = True
    db.commit()
    return _issue_tokens(db, user)


@router.post("/reset-password")
def reset_password(data: PasswordResetRequest, db: Session = Depends(get_db)):
    """Set a new password using the code sent via /auth/send-code (purpose=reset)."""
    ok, reason = verify_code(db, data.email, EmailCodePurpose.reset, data.code)
    if not ok:
        raise HTTPException(status_code=400, detail=reason)
    user = get_user_by_email(db, data.email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    set_password(db, user, data.new_password)
    revoke_all_user_tokens(db, user.id)
    return {"detail": "Password reset. Please log in with your new password."}


@router.post("/login", response_model=Token)
def login(data: UserLogin, db: Session = Depends(get_db)):
    user = get_user_by_email(db, data.email)
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is banned")
    if REQUIRE_EMAIL_VERIFICATION and not user.is_email_verified:
        raise HTTPException(
            status_code=403,
            detail="Email not verified. Check your inbox or request a new code via /auth/send-code.",
        )
    return _issue_tokens(db, user)


@router.post("/google", response_model=Token)
def google_auth(data: GoogleAuthRequest, db: Session = Depends(get_db)):
    """Login/register with a Google ID token obtained on the frontend.

    We verify the token with Google's tokeninfo endpoint, then find-or-create
    the user by their stable Google subject id.
    """
    try:
        with httpx.Client(timeout=10) as client:
            resp = client.get(
                "https://oauth2.googleapis.com/tokeninfo",
                params={"id_token": data.id_token},
            )
            resp.raise_for_status()
            info = resp.json()
    except httpx.HTTPError:
        raise HTTPException(status_code=401, detail="Invalid Google token")

    if GOOGLE_CLIENT_ID and info.get("aud") != GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=401, detail="Google token audience mismatch")

    sub = info.get("sub")
    email = info.get("email")
    if not sub or not email:
        raise HTTPException(status_code=401, detail="Google token missing claims")

    google_name = info.get("name")
    google_avatar = info.get("picture")
    google_email_verified = str(info.get("email_verified", "true")).lower() == "true"

    user = get_user_by_google_sub(db, sub) or get_user_by_email(db, email)
    if not user:
        user = create_user(
            db,
            email=email,
            password=None,
            full_name=google_name,
            role=data.role,
            google_sub=sub,
            avatar_url=google_avatar,
        )
        user.is_email_verified = google_email_verified
        db.commit()
    else:
        if not user.google_sub:
            user.google_sub = sub
        if not user.full_name and google_name:
            user.full_name = google_name
        if not user.avatar_url and google_avatar:
            user.avatar_url = google_avatar
        if google_email_verified:
            user.is_email_verified = True
        db.commit()

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is banned")
    return _issue_tokens(db, user)


@router.post("/refresh", response_model=Token)
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)):
    rt = get_refresh_token(db, payload.refresh_token)
    if not rt or rt.revoked:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    expires_at = rt.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Refresh token expired")

    user = get_user_by_id(db, rt.user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    access_token = create_access_token({"sub": str(user.id), "role": user.role.value})
    return {"access_token": access_token, "refresh_token": rt.token, "token_type": "bearer"}


@router.post("/logout")
def logout(
    payload: RefreshRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    revoke_refresh_token(db, payload.refresh_token)
    return {"detail": "Logged out"}



@users_router.get("/me", response_model=UserMe)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@users_router.put("/me", response_model=UserMe)
def edit_me(
    data: UserUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return update_user(db, user.id, **data.model_dump(exclude_unset=True))


@users_router.post("/me/change-password")
def change_password(
    data: PasswordChange,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Change password while logged in (requires the current password)."""
    if not verify_password(data.old_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    set_password(db, user, data.new_password)
    revoke_all_user_tokens(db, user.id)
    return {"detail": "Password changed. Please log in again."}


@users_router.post("/me/avatar", response_model=UserMe)
async def upload_avatar(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Upload a profile picture (image). Replaces the current avatar."""
    from modules.media.router import save_upload
    result = await save_upload(file)
    return update_user(db, user.id, avatar_url=result.url)


@users_router.delete("/me")
def delete_me(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Delete own account and all related data (cascade)."""
    revoke_all_user_tokens(db, user.id)
    db.delete(user)
    db.commit()
    return {"detail": "Account deleted"}



@users_router.get("/{user_id}/public")
def public_profile(user_id: int, db: Session = Depends(get_db)):
    """Public profile of any user (used for seller pages).

    Returns basic profile info plus aggregate stats for sellers: number of active
    listings and the average rating across all of their listings' reviews.
    """
    from models import Property, PropertyStatus, Review, RoleEnum
    from sqlalchemy import func

    user = get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    listings_count = (
        db.query(Property)
        .filter(Property.seller_id == user_id, Property.status == PropertyStatus.active)
        .count()
    )

    avg_rating = (
        db.query(func.avg(Review.rating))
        .join(Property, Property.id == Review.property_id)
        .filter(Property.seller_id == user_id)
        .scalar()
    )
    reviews_count = (
        db.query(func.count(Review.id))
        .join(Property, Property.id == Review.property_id)
        .filter(Property.seller_id == user_id)
        .scalar()
    )

    return {
        "id": user.id,
        "full_name": user.full_name,
        "avatar_url": user.avatar_url,
        "role": user.role.value,
        "company_name": user.company_name,
        "phone": user.phone if user.role in (RoleEnum.seller, RoleEnum.admin) else None,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "is_email_verified": user.is_email_verified,
        "listings_count": listings_count,
        "avg_rating": round(float(avg_rating), 2) if avg_rating else None,
        "reviews_count": int(reviews_count or 0),
    }


@users_router.get("/{user_id}/listings")
def seller_listings(
    user_id: int,
    deal_type: str | None = None,
    db: Session = Depends(get_db),
    current_user: "User | None" = Depends(get_optional_user),
):
    """Active listings of a seller, optionally filtered by deal type (rent/sale)."""
    from models import Property, PropertyStatus, DealType
    from modules.properties.router import serialize

    q = db.query(Property).filter(
        Property.seller_id == user_id, Property.status == PropertyStatus.active
    )
    if deal_type in ("rent", "sale"):
        q = q.filter(Property.deal_type == DealType(deal_type))
    props = q.order_by(Property.created_at.desc()).all()
    uid = current_user.id if current_user else None
    return {"items": [serialize(db, p, uid) for p in props], "total": len(props)}


@users_router.get("/{user_id}/reviews")
def seller_reviews(
    user_id: int,
    deal_type: str | None = None,
    db: Session = Depends(get_db),
    current_user: "User | None" = Depends(get_optional_user),
):
    """All reviews across a seller's listings.

    `deal_type=rent` returns only reviews on the seller's rental listings;
    `deal_type=sale` only on sale listings. Each review includes which property
    it belongs to so the frontend can show context.
    """
    from models import Property, Review, DealType
    from sqlalchemy.orm import selectinload
    from modules.properties.crud import cover_url

    q = (
        db.query(Review, Property)
        .join(Property, Property.id == Review.property_id)
        .options(selectinload(Review.user), selectinload(Property.media))
        .filter(Property.seller_id == user_id)
    )
    if deal_type in ("rent", "sale"):
        q = q.filter(Property.deal_type == DealType(deal_type))
    rows = q.order_by(Review.created_at.desc()).all()

    uid = current_user.id if current_user else None
    out = []
    for review, prop in rows:
        out.append({
            "id": review.id,
            "rating": review.rating,
            "text": review.text,
            "created_at": review.created_at.isoformat() if review.created_at else None,
            "can_edit": uid is not None and review.user_id == uid,
            "user": {
                "id": review.user.id,
                "full_name": review.user.full_name,
                "avatar_url": review.user.avatar_url,
                "role": review.user.role.value,
            } if review.user else None,
            "property": {
                "id": prop.id,
                "title": prop.title,
                "deal_type": prop.deal_type.value,
                "type": prop.type.value,
                "price": prop.price,
                "cover_url": cover_url(prop),
            },
        })
    return {"items": out, "total": len(out)}



class DeleteAccountRequest(BaseModel):
    confirmation: str
    reason: str | None = None
    lang: str = "ru"


@users_router.post("/me/request-deletion")
def request_account_deletion(
    data: "DeleteAccountRequest",
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Submit an account-deletion request that an AI reviews and (almost always)
    approves. On approval the account + all related data are deleted and a
    confirmation email is sent. The email can be reused to register again later.

    The frontend must send the typed confirmation word ('подтверждение' for ru,
    'confirmation' for en) — validated here as a safety gate.
    """
    expected = "подтверждение" if data.lang == "ru" else "confirmation"
    if (data.confirmation or "").strip().lower() != expected:
        raise HTTPException(status_code=400, detail="Confirmation text does not match")

    decision, ai_note = _review_deletion(data.reason or "", data.lang)
    if decision != "approve":
        return {"approved": False, "detail": ai_note}

    email = user.email
    full_name = user.full_name or email

    _send_deletion_email(email, full_name, data.lang)

    revoke_all_user_tokens(db, user.id)
    db.delete(user)
    db.commit()
    return {"approved": True, "detail": ai_note or "Account deleted"}


def _review_deletion(reason: str, lang: str) -> tuple[str, str]:
    """Ask the AI to review a deletion request. Designed to approve in almost all
    cases; only blocks obviously abusive/automated spam. Falls back to approve
    if AI is unavailable."""
    try:
        from modules.ai.service import chat, is_configured, AIError
        if not is_configured():
            return "approve", ("Запрос одобрен." if lang == "ru" else "Request approved.")
        lang_name = "Russian" if lang == "ru" else "English"
        prompt = (
            "You moderate account-deletion requests for a real-estate app. Users have the right "
            "to delete their account; APPROVE unless the request is clearly abusive, automated "
            "spam, or attempts something other than deleting one's own account. When in doubt, "
            "approve.\n"
            f"Reply in {lang_name} with STRICT JSON only: "
            '{"decision":"approve|deny","note":"one short sentence to the user"}\n'
            f"Reason given: {reason!r}"
        )
        import json as _json
        raw = chat([{"role": "user", "content": prompt}], temperature=0.1, max_tokens=120, timeout=15.0)
        s, e = raw.find("{"), raw.rfind("}")
        obj = _json.loads(raw[s:e + 1]) if s != -1 and e != -1 else {}
        decision = str(obj.get("decision", "approve")).lower()
        note = str(obj.get("note", "")).strip()
        if decision not in ("approve", "deny"):
            decision = "approve"
        if not note:
            note = ("Запрос одобрен." if lang == "ru" else "Request approved.")
        return decision, note
    except Exception:
        return "approve", ("Запрос одобрен." if lang == "ru" else "Request approved.")


def _send_deletion_email(email: str, name: str, lang: str) -> None:
    def _worker():
        try:
            from modules.email.service import send_email
            if lang == "ru":
                subject = "Ваш аккаунт Nestora удалён"
                text = (
                    f"Здравствуйте, {name}!\n\n"
                    "Ваш запрос на удаление аккаунта одобрен, и аккаунт удалён вместе со всеми данными.\n"
                    "Вы можете в любой момент снова зарегистрироваться на этот же email.\n\n"
                    "С уважением, команда Nestora."
                )
            else:
                subject = "Your Nestora account has been deleted"
                text = (
                    f"Hello {name},\n\n"
                    "Your account-deletion request was approved and your account and all data were removed.\n"
                    "You are welcome to register again with this same email at any time.\n\n"
                    "Best, the Nestora team."
                )
            send_email(email, subject, text, None)
        except Exception:
            pass
    import threading
    threading.Thread(target=_worker, daemon=True).start()
