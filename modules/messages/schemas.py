from datetime import datetime

from pydantic import BaseModel, Field

from modules.users.schemas import UserPublic


class StartConversationIn(BaseModel):
    """Open (or reuse) a chat with the realtor of a property."""
    property_id: int
    text: str | None = Field(default=None, max_length=4000)


class MessageIn(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    reply_to_id: int | None = None


class MessageEdit(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


class MessageOut(BaseModel):
    id: int
    conversation_id: int
    sender_id: int
    text: str | None = None
    attachment_url: str | None = None
    attachment_name: str | None = None
    attachment_type: str | None = None
    attachment_size: int | None = None
    reply_to_id: int | None = None
    is_read: bool
    is_edited: bool = False
    is_deleted: bool = False
    edited_at: datetime | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class ConversationOut(BaseModel):
    id: int
    buyer: UserPublic
    seller: UserPublic
    property_id: int | None
    last_message_at: datetime
    unread: int = 0
    last_message: str | None = None

    class Config:
        from_attributes = True


class ConversationList(BaseModel):
    items: list[ConversationOut]
    total: int
