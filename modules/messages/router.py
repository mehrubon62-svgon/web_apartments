from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from models import (
    get_db,
    User,
    Property,
    Conversation,
    DirectMessage,
    PropertyStatus,
    RoleEnum,
    NotificationType,
)
from dependencies import get_current_user
from modules.messages.schemas import (
    StartConversationIn,
    MessageIn,
    MessageEdit,
    MessageOut,
    ConversationOut,
    ConversationList,
)
from modules.messages.crud import (
    get_or_create_conversation,
    add_message,
    get_message,
    edit_message,
    delete_message,
    list_conversations,
    list_messages,
    unread_count,
    last_message_text,
    mark_read,
)
from modules.media.router import save_attachment
from modules.notifications.crud import create_notification
from modules.realtime.manager import publish_event_sync


router = APIRouter(prefix="/conversations", tags=["Messages (Contact Realtor)"])


def _serialize_convo(db: Session, convo: Conversation, user_id: int) -> ConversationOut:
    buyer = db.query(User).filter(User.id == convo.buyer_id).first()
    seller = db.query(User).filter(User.id == convo.seller_id).first()
    return ConversationOut(
        id=convo.id,
        buyer=buyer,
        seller=seller,
        property_id=convo.property_id,
        last_message_at=convo.last_message_at,
        unread=unread_count(db, convo.id, user_id),
        last_message=last_message_text(db, convo.id),
    )


def _ensure_member(convo: Conversation, user_id: int) -> None:
    if user_id not in (convo.buyer_id, convo.seller_id):
        raise HTTPException(status_code=403, detail="Not a participant of this conversation")


@router.post("", response_model=ConversationOut, status_code=201)
def start_conversation(
    data: StartConversationIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """'Contact Realtor': open (or reuse) a chat with a property's seller."""
    prop = db.query(Property).filter(Property.id == data.property_id).first()
    if not prop or prop.status == PropertyStatus.deleted:
        raise HTTPException(status_code=404, detail="Property not found")
    if prop.seller_id == current_user.id:
        raise HTTPException(status_code=400, detail="You are the seller of this property")

    convo = get_or_create_conversation(
        db, buyer_id=current_user.id, seller_id=prop.seller_id, property_id=prop.id
    )

    if data.text:
        msg = add_message(db, convo, current_user.id, text=data.text)
        _notify_recipient(db, convo, current_user, _preview(msg))

    return _serialize_convo(db, convo, current_user.id)


@router.get("", response_model=ConversationList)
def my_conversations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    convos = list_conversations(db, current_user.id)
    return ConversationList(
        items=[_serialize_convo(db, c, current_user.id) for c in convos],
        total=len(convos),
    )


@router.get("/{conversation_id}/messages", response_model=list[MessageOut])
def get_messages(
    conversation_id: int,
    limit: int = Query(50, le=100),
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    convo = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not convo:
        raise HTTPException(status_code=404, detail="Conversation not found")
    _ensure_member(convo, current_user.id)

    items, _ = list_messages(db, conversation_id, limit, offset)
    mark_read(db, conversation_id, current_user.id)
    return [MessageOut.model_validate(m) for m in items]


@router.post("/{conversation_id}/messages", response_model=MessageOut, status_code=201)
def send_message(
    conversation_id: int,
    data: MessageIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    convo = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not convo:
        raise HTTPException(status_code=404, detail="Conversation not found")
    _ensure_member(convo, current_user.id)

    msg = add_message(db, convo, current_user.id, text=data.text)
    _notify_recipient(db, convo, current_user, _preview(msg))
    return MessageOut.model_validate(msg)


@router.post("/{conversation_id}/messages/upload", response_model=MessageOut, status_code=201)
async def send_file_message(
    conversation_id: int,
    file: UploadFile = File(...),
    text: str | None = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send a message with a file attachment (image or document), optional caption."""
    convo = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not convo:
        raise HTTPException(status_code=404, detail="Conversation not found")
    _ensure_member(convo, current_user.id)

    attachment = await save_attachment(file)
    msg = add_message(db, convo, current_user.id, text=text, attachment=attachment)
    _notify_recipient(db, convo, current_user, _preview(msg))
    return MessageOut.model_validate(msg)


@router.put("/{conversation_id}/messages/{message_id}", response_model=MessageOut)
def update_message(
    conversation_id: int,
    message_id: int,
    data: MessageEdit,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Edit your own message text."""
    convo = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not convo:
        raise HTTPException(status_code=404, detail="Conversation not found")
    _ensure_member(convo, current_user.id)

    msg = get_message(db, message_id)
    if not msg or msg.conversation_id != conversation_id:
        raise HTTPException(status_code=404, detail="Message not found")
    if msg.sender_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only edit your own messages")
    if msg.is_deleted:
        raise HTTPException(status_code=400, detail="Cannot edit a deleted message")

    msg = edit_message(db, msg, data.text)

    # Live update to the other participant
    recipient_id = convo.seller_id if current_user.id == convo.buyer_id else convo.buyer_id
    publish_event_sync(
        recipient_id,
        "message:edited",
        {"conversation_id": convo.id, "message_id": msg.id, "text": msg.text},
    )
    return MessageOut.model_validate(msg)


@router.delete("/{conversation_id}/messages/{message_id}", response_model=MessageOut)
def remove_message(
    conversation_id: int,
    message_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete your own message (soft delete — shows as 'Message deleted')."""
    convo = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not convo:
        raise HTTPException(status_code=404, detail="Conversation not found")
    _ensure_member(convo, current_user.id)

    msg = get_message(db, message_id)
    if not msg or msg.conversation_id != conversation_id:
        raise HTTPException(status_code=404, detail="Message not found")
    if msg.sender_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only delete your own messages")

    msg = delete_message(db, msg)

    recipient_id = convo.seller_id if current_user.id == convo.buyer_id else convo.buyer_id
    publish_event_sync(
        recipient_id,
        "message:deleted",
        {"conversation_id": convo.id, "message_id": msg.id},
    )
    return MessageOut.model_validate(msg)


def _preview(msg: DirectMessage) -> str:
    if msg.text:
        return msg.text
    if msg.attachment_url:
        return f"📎 {msg.attachment_name or 'Attachment'}"
    return ""


def _notify_recipient(db: Session, convo: Conversation, sender: User, text: str) -> None:
    recipient_id = convo.seller_id if sender.id == convo.buyer_id else convo.buyer_id

    # Realtime live message event
    publish_event_sync(
        recipient_id,
        "message:new",
        {
            "conversation_id": convo.id,
            "sender_id": sender.id,
            "text": text,
        },
    )
    # Persisted notification (matches the brief's "new message from realtor")
    create_notification(
        db,
        user_id=recipient_id,
        type=NotificationType.new_message,
        content={
            "title": "New message",
            "body": f"{sender.full_name or sender.email}: {text[:80]}",
            "conversation_id": convo.id,
            "property_id": convo.property_id,
        },
    )
