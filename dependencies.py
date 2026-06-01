from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import APIKeyHeader
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from config import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES
from models import get_db, User, RoleEnum, UserStatus


api_key_scheme = APIKeyHeader(
    name="Authorization",
    description="Enter: Bearer <your_token>",
    auto_error=True,
)


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def _extract_token(value: str) -> str:
    if not value:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    parts = value.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        raise HTTPException(
            status_code=401,
            detail="Invalid Authorization header. Expected: 'Bearer <token>'",
        )
    return parts[1].strip()


def get_current_user(
    authorization: str = Depends(api_key_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    token = _extract_token(authorization)
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        sub = payload.get("sub")
        if sub is None:
            raise credentials_exception
        user_id = int(sub)
    except (JWTError, ValueError):
        raise credentials_exception

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise credentials_exception
    if user.status == UserStatus.banned:
        raise HTTPException(status_code=403, detail="Account is banned")
    return user


def require_seller(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in (RoleEnum.seller, RoleEnum.admin):
        raise HTTPException(status_code=403, detail="Seller access required")
    return current_user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != RoleEnum.admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


_optional_api_key = APIKeyHeader(
    name="Authorization",
    description="Optional: Bearer <token>. Public endpoints work without it.",
    auto_error=False,
)


def get_optional_user(
    authorization: str | None = Depends(_optional_api_key),
    db: Session = Depends(get_db),
) -> User | None:
    """Like get_current_user, but returns None for anonymous visitors instead of
    raising. Lets public endpoints (catalog, map, listing detail) work for guests
    while still personalizing for logged-in users."""
    if not authorization:
        return None
    try:
        token = _extract_token(authorization)
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        sub = payload.get("sub")
        if sub is None:
            return None
        user = db.query(User).filter(User.id == int(sub)).first()
    except (JWTError, ValueError, HTTPException):
        return None
    if user is None or user.status == UserStatus.banned:
        return None
    return user
