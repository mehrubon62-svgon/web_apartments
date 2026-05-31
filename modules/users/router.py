from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from models import get_db, User, EmailCodePurpose
from config import GOOGLE_CLIENT_ID, REQUIRE_EMAIL_VERIFICATION, EMAIL_CODE_TTL_MIN
from dependencies import get_current_user, create_access_token
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
)
from modules.users.crud import (
    get_user_by_email,
    get_user_by_id,
    get_user_by_google_sub,
    create_user,
    update_user,
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


def _dispatch_code(db: Session, email: str, purpose: EmailCodePurpose) -> dict:
    """Create a code and send it via Celery email task (sync fallback). In dev,
    when SMTP isn't configured, the code is returned so the flow stays testable."""
    code = create_code(db, email, purpose)
    try:
        from tasks import send_email_code
        send_email_code.delay(email, code, purpose.value)
    except Exception:
        # Broker down -> send the email directly (no Celery retry machinery).
        from modules.email.service import send_email, code_email
        subject, text, html = code_email(code, purpose.value, EMAIL_CODE_TTL_MIN)
        send_email(email, subject, text, html)

    resp = {"detail": "Verification code sent", "expires_in_min": EMAIL_CODE_TTL_MIN}
    if not email_configured():
        # Dev convenience only: surface the code when no SMTP is set up.
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
    # Fire off the email verification code.
    _dispatch_code(db, user.email, EmailCodePurpose.verify)
    return _issue_tokens(db, user)


@router.post("/send-code")
def send_code(data: SendCodeRequest, db: Session = Depends(get_db)):
    """Send a verification code to an email (purpose: verify | login | reset)."""
    purpose = _parse_purpose(data.purpose)
    # For login/reset the user must exist; for verify we allow any (registration).
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

    user = get_user_by_google_sub(db, sub) or get_user_by_email(db, email)
    if not user:
        user = create_user(
            db,
            email=email,
            password=None,
            full_name=info.get("name"),
            role=data.role,
            google_sub=sub,
            avatar_url=info.get("picture"),
        )
    elif not user.google_sub:
        user.google_sub = sub
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


# ---- Users / me ----

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
