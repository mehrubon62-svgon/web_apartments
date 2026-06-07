from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from models import RoleEnum, UserStatus


class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    full_name: str | None = None
    role: RoleEnum = RoleEnum.buyer
    company_name: str | None = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    refresh_token: str | None = None
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class GoogleAuthRequest(BaseModel):
    """Exchange a Google ID token (from the frontend) for our JWTs."""
    id_token: str
    role: RoleEnum = RoleEnum.buyer


class SendCodeRequest(BaseModel):
    email: EmailStr
    purpose: str = "verify"


class VerifyCodeRequest(BaseModel):
    email: EmailStr
    code: str = Field(min_length=4, max_length=8)
    purpose: str = "verify"


class PasswordResetRequest(BaseModel):
    email: EmailStr
    code: str = Field(min_length=4, max_length=8)
    new_password: str = Field(min_length=6, max_length=128)


class PasswordChange(BaseModel):
    old_password: str
    new_password: str = Field(min_length=6, max_length=128)


class UserPublic(BaseModel):
    id: int
    full_name: str | None = None
    avatar_url: str | None = None
    role: RoleEnum
    company_name: str | None = None

    class Config:
        from_attributes = True


class UserMe(UserPublic):
    email: str
    phone: str | None = None
    status: UserStatus
    is_email_verified: bool = False
    created_at: datetime


class UserUpdate(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    avatar_url: str | None = None
    company_name: str | None = None
