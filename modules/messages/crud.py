from sqlalchemy.orm import Session

from models import Conversation, DirectMessage, utcnow


def get_or_create_conversation(
    db: Session, buyer_id: int, seller_id: int, property_id: int | None
) -> Conversation:
    convo = (
        db.query(Conversation)
        .filter(
            Conversation.buyer_id == buyer_id,
            Conversation.seller_id == seller_id,
            Conversation.property_id == property_id,
        )
        .first()
    )
    if convo:
        return convo
    convo = Conversation(buyer_id=buyer_id, seller_id=seller_id, property_id=property_id)
    db.add(convo)
    db.commit()
    db.refresh(convo)
    return convo


def add_message(
    db: Session,
    conversation: Conversation,
    sender_id: int,
    text: str | None = None,
    attachment: dict | None = None,
) -> DirectMessage:
    msg = DirectMessage(
        conversation_id=conversation.id,
        sender_id=sender_id,
        text=text,
        attachment_url=(attachment or {}).get("url"),
        attachment_name=(attachment or {}).get("name"),
        attachment_type=(attachment or {}).get("type"),
        attachment_size=(attachment or {}).get("size"),
    )
    db.add(msg)
    conversation.last_message_at = utcnow()
    db.commit()
    db.refresh(msg)
    return msg


def get_message(db: Session, message_id: int) -> DirectMessage | None:
    return db.query(DirectMessage).filter(DirectMessage.id == message_id).first()


def edit_message(db: Session, msg: DirectMessage, text: str) -> DirectMessage:
    msg.text = text
    msg.is_edited = True
    msg.edited_at = utcnow()
    db.commit()
    db.refresh(msg)
    return msg


def delete_message(db: Session, msg: DirectMessage) -> DirectMessage:
    """Soft delete: keep the row so the thread stays consistent, blank the content."""
    msg.is_deleted = True
    msg.text = None
    msg.attachment_url = None
    msg.attachment_name = None
    msg.attachment_type = None
    msg.attachment_size = None
    db.commit()
    db.refresh(msg)
    return msg


def list_conversations(db: Session, user_id: int):
    convos = (
        db.query(Conversation)
        .filter((Conversation.buyer_id == user_id) | (Conversation.seller_id == user_id))
        .order_by(Conversation.last_message_at.desc())
        .all()
    )
    return convos


def unread_count(db: Session, conversation_id: int, user_id: int) -> int:
    return (
        db.query(DirectMessage)
        .filter(
            DirectMessage.conversation_id == conversation_id,
            DirectMessage.sender_id != user_id,
            DirectMessage.is_read.is_(False),
        )
        .count()
    )


def last_message_text(db: Session, conversation_id: int) -> str | None:
    msg = (
        db.query(DirectMessage)
        .filter(DirectMessage.conversation_id == conversation_id)
        .order_by(DirectMessage.created_at.desc())
        .first()
    )
    if not msg:
        return None
    if msg.is_deleted:
        return "Message deleted"
    if msg.text:
        return msg.text
    if msg.attachment_url:
        return f"📎 {msg.attachment_name or 'Attachment'}"
    return None


def list_messages(db: Session, conversation_id: int, limit: int = 50, offset: int = 0):
    q = (
        db.query(DirectMessage)
        .filter(DirectMessage.conversation_id == conversation_id)
        .order_by(DirectMessage.created_at.asc())
    )
    total = q.count()
    items = q.offset(offset).limit(limit).all()
    return items, total


def mark_read(db: Session, conversation_id: int, user_id: int) -> int:
    """Mark messages from the other party as read."""
    rows = (
        db.query(DirectMessage)
        .filter(
            DirectMessage.conversation_id == conversation_id,
            DirectMessage.sender_id != user_id,
            DirectMessage.is_read.is_(False),
        )
        .update({"is_read": True})
    )
    db.commit()
    return rows
