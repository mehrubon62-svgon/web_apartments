"""Email verification codes: create + verify, with hashing and attempt limits."""
from __future__ import annotations

import hashlib
import secrets
from datetime import timedelta, timezone, datetime

from sqlalchemy.orm import Session

from models import EmailCode, EmailCodePurpose, utcnow
from config import EMAIL_CODE_TTL_MIN, EMAIL_CODE_MAX_ATTEMPTS


def _hash_code(code: str) -> str:
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


def generate_code() -> str:
    """A 6-digit numeric code."""
    return f"{secrets.randbelow(1_000_000):06d}"


def create_code(db: Session, email: str, purpose: EmailCodePurpose) -> str:
    db.query(EmailCode).filter(
        EmailCode.email == email,
        EmailCode.purpose == purpose,
        EmailCode.used.is_(False),
    ).update({"used": True})

    code = generate_code()
    row = EmailCode(
        email=email,
        code_hash=_hash_code(code),
        purpose=purpose,
        expires_at=utcnow() + timedelta(minutes=EMAIL_CODE_TTL_MIN),
    )
    db.add(row)
    db.commit()
    return code


def verify_code(db: Session, email: str, purpose: EmailCodePurpose, code: str) -> tuple[bool, str]:
    """Returns (ok, reason). On success the code is marked used."""
    row = (
        db.query(EmailCode)
        .filter(
            EmailCode.email == email,
            EmailCode.purpose == purpose,
            EmailCode.used.is_(False),
        )
        .order_by(EmailCode.created_at.desc())
        .first()
    )
    if not row:
        return False, "No active code. Request a new one."

    expires_at = row.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < utcnow():
        row.used = True
        db.commit()
        return False, "Code expired. Request a new one."

    if row.attempts >= EMAIL_CODE_MAX_ATTEMPTS:
        row.used = True
        db.commit()
        return False, "Too many attempts. Request a new code."

    row.attempts += 1
    if _hash_code(code) != row.code_hash:
        db.commit()
        return False, "Invalid code."

    row.used = True
    db.commit()
    return True, "ok"
