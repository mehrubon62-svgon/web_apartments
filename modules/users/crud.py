import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
from sqlalchemy.orm import Session

from models import User, RoleEnum, RefreshToken
from config import REFRESH_TOKEN_EXPIRE_DAYS


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str | None) -> bool:
    if not hashed_password:
        return False
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.query(User).filter(User.email == email).first()


def get_user_by_id(db: Session, user_id: int) -> User | None:
    return db.query(User).filter(User.id == user_id).first()


def get_user_by_google_sub(db: Session, sub: str) -> User | None:
    return db.query(User).filter(User.google_sub == sub).first()


def create_user(
    db: Session,
    email: str,
    password: str | None,
    full_name: str | None = None,
    role: RoleEnum = RoleEnum.buyer,
    company_name: str | None = None,
    google_sub: str | None = None,
    avatar_url: str | None = None,
) -> User:
    user = User(
        email=email,
        hashed_password=hash_password(password) if password else None,
        full_name=full_name,
        role=role,
        company_name=company_name,
        google_sub=google_sub,
        avatar_url=avatar_url,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def update_user(db: Session, user_id: int, **fields) -> User | None:
    user = get_user_by_id(db, user_id)
    if not user:
        return None
    for key, value in fields.items():
        if value is not None:
            setattr(user, key, value)
    db.commit()
    db.refresh(user)
    return user


def set_password(db: Session, user: User, new_password: str) -> None:
    user.hashed_password = hash_password(new_password)
    db.commit()



def create_refresh_token(db: Session, user_id: int) -> RefreshToken:
    token = secrets.token_urlsafe(48)
    expires_at = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    rt = RefreshToken(user_id=user_id, token=token, expires_at=expires_at)
    db.add(rt)
    db.commit()
    db.refresh(rt)
    return rt


def get_refresh_token(db: Session, token: str) -> RefreshToken | None:
    return db.query(RefreshToken).filter(RefreshToken.token == token).first()


def revoke_refresh_token(db: Session, token: str) -> bool:
    rt = get_refresh_token(db, token)
    if not rt:
        return False
    rt.revoked = True
    db.commit()
    return True


def revoke_all_user_tokens(db: Session, user_id: int) -> None:
    db.query(RefreshToken).filter(
        RefreshToken.user_id == user_id, RefreshToken.revoked.is_(False)
    ).update({"revoked": True})
    db.commit()
