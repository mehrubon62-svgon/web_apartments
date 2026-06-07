from sqlalchemy import (
    Column,
    Integer,
    Float,
    String,
    ForeignKey,
    Enum as SQLEnum,
    Boolean,
    DateTime,
    Date,
    Text,
    JSON,
    UniqueConstraint,
    Index,
    create_engine,
)
from sqlalchemy.orm import relationship, sessionmaker, DeclarativeBase
from datetime import datetime, timezone
import enum

from config import DATABASE_URL


_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=_connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def utcnow():
    return datetime.now(timezone.utc)



class RoleEnum(str, enum.Enum):
    buyer = "buyer"
    seller = "seller"
    admin = "admin"


class UserStatus(str, enum.Enum):
    active = "active"
    warned = "warned"
    banned = "banned"


class PropertyType(str, enum.Enum):
    apartment = "apartment"
    house = "house"
    commercial = "commercial"


class DealType(str, enum.Enum):
    rent = "rent"
    sale = "sale"


class RentTerm(str, enum.Enum):
    short = "short"
    long = "long"


class PropertyStatus(str, enum.Enum):
    active = "active"
    paused = "paused"
    deleted = "deleted"


class MediaKind(str, enum.Enum):
    photo = "photo"
    pano = "360"


class BookingStatus(str, enum.Enum):
    pending = "pending"
    confirmed = "confirmed"
    cancelled = "cancelled"


class PaymentStatus(str, enum.Enum):
    unpaid = "unpaid"
    paid = "paid"
    refunded = "refunded"


class NotificationType(str, enum.Enum):
    price_drop = "price_drop"
    new_message = "new_message"
    booking_confirmed = "booking_confirmed"
    recommendation = "recommendation"
    warning = "warning"
    ban = "ban"
    complaint_decision = "complaint_decision"


class ModerationDecision(str, enum.Enum):
    unfounded = "unfounded"
    warning = "warning"
    ban = "ban"



class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=True)
    full_name = Column(String(120), nullable=True)
    avatar_url = Column(String(500), nullable=True)
    phone = Column(String(30), nullable=True)

    role = Column(SQLEnum(RoleEnum), default=RoleEnum.buyer, nullable=False, index=True)
    status = Column(SQLEnum(UserStatus), default=UserStatus.active, nullable=False, index=True)

    company_name = Column(String(150), nullable=True)

    google_sub = Column(String(255), unique=True, nullable=True, index=True)

    is_email_verified = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    properties = relationship(
        "Property", back_populates="seller", cascade="all, delete-orphan"
    )
    refresh_tokens = relationship(
        "RefreshToken", back_populates="user", cascade="all, delete-orphan"
    )

    @property
    def is_active(self) -> bool:
        return self.status != UserStatus.banned


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token = Column(String(255), unique=True, nullable=False, index=True)
    revoked = Column(Boolean, default=False, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    user = relationship("User", back_populates="refresh_tokens")


class EmailCodePurpose(str, enum.Enum):
    verify = "verify"
    login = "login"
    reset = "reset"


class EmailCode(Base):
    """A one-time numeric code sent to an email for verification/login/reset."""
    __tablename__ = "email_codes"
    __table_args__ = (
        Index("ix_email_codes_email_purpose", "email", "purpose"),
    )

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), nullable=False, index=True)
    code_hash = Column(String(255), nullable=False)
    purpose = Column(SQLEnum(EmailCodePurpose), nullable=False)
    attempts = Column(Integer, default=0, nullable=False)
    used = Column(Boolean, default=False, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)



class Property(Base):
    __tablename__ = "properties"

    id = Column(Integer, primary_key=True, index=True)
    seller_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    type = Column(SQLEnum(PropertyType), nullable=False, index=True)
    deal_type = Column(SQLEnum(DealType), nullable=False, index=True)
    rent_term = Column(SQLEnum(RentTerm), nullable=True)

    price = Column(Float, nullable=False, index=True)
    area = Column(Float, nullable=False, index=True)
    rooms = Column(Integer, nullable=True)

    address = Column(String(400), nullable=True)
    lat = Column(Float, nullable=True, index=True)
    lng = Column(Float, nullable=True, index=True)

    house_rules = Column(Text, nullable=True)
    status = Column(SQLEnum(PropertyStatus), default=PropertyStatus.active, nullable=False, index=True)

    views_count = Column(Integer, default=0, nullable=False)

    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    seller = relationship("User", back_populates="properties")
    media = relationship(
        "PropertyMedia", back_populates="property", cascade="all, delete-orphan",
        order_by="PropertyMedia.order",
    )
    tour = relationship(
        "Tour", back_populates="property", uselist=False, cascade="all, delete-orphan"
    )
    reviews = relationship(
        "Review", back_populates="property", cascade="all, delete-orphan"
    )
    price_points = relationship(
        "PriceHistory", back_populates="property", cascade="all, delete-orphan",
        order_by="PriceHistory.recorded_at",
    )
    availability = relationship(
        "Availability", back_populates="property", cascade="all, delete-orphan"
    )


class PropertyMedia(Base):
    __tablename__ = "property_media"

    id = Column(Integer, primary_key=True, index=True)
    property_id = Column(Integer, ForeignKey("properties.id", ondelete="CASCADE"), nullable=False, index=True)
    url = Column(String(500), nullable=False)
    type = Column(SQLEnum(MediaKind), default=MediaKind.photo, nullable=False)
    order = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    property = relationship("Property", back_populates="media")


class Tour(Base):
    """360° tour. rooms is a JSON list of room nodes:
    [{"id": "living", "name": "Living room", "media_url": "...", "links": [...]}]
    """
    __tablename__ = "tours"

    id = Column(Integer, primary_key=True, index=True)
    property_id = Column(Integer, ForeignKey("properties.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    rooms = Column(JSON, nullable=False, default=list)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    property = relationship("Property", back_populates="tour")



class Availability(Base):
    """A single bookable date range a landlord marks as available."""
    __tablename__ = "availability"

    id = Column(Integer, primary_key=True, index=True)
    property_id = Column(Integer, ForeignKey("properties.id", ondelete="CASCADE"), nullable=False, index=True)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    property = relationship("Property", back_populates="availability")


class Booking(Base):
    __tablename__ = "bookings"

    id = Column(Integer, primary_key=True, index=True)
    property_id = Column(Integer, ForeignKey("properties.id", ondelete="CASCADE"), nullable=False, index=True)
    renter_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    total_price = Column(Float, nullable=False, default=0.0)

    status = Column(SQLEnum(BookingStatus), default=BookingStatus.pending, nullable=False, index=True)
    payment_status = Column(SQLEnum(PaymentStatus), default=PaymentStatus.unpaid, nullable=False, index=True)
    payment_token = Column(String(64), nullable=True, index=True)

    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)

    property = relationship("Property")
    renter = relationship("User")


class PaymentSession(Base):
    """A mock payment session (our own 'MockPay' gateway, Stripe-like flow).

    Created when a renter starts checkout. The hosted checkout page reads it by
    token, the user 'pays', and we mark the session paid + confirm the booking.
    """
    __tablename__ = "payment_sessions"

    id = Column(Integer, primary_key=True, index=True)
    token = Column(String(64), unique=True, nullable=False, index=True)
    booking_id = Column(Integer, ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False, index=True)
    amount = Column(Float, nullable=False)
    currency = Column(String(10), default="usd", nullable=False)
    status = Column(String(20), default="open", nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)

    booking = relationship("Booking")



class PurchaseRequest(Base):
    """A viewing/purchase request submitted by a buyer for a sale listing."""
    __tablename__ = "purchase_requests"

    id = Column(Integer, primary_key=True, index=True)
    property_id = Column(Integer, ForeignKey("properties.id", ondelete="CASCADE"), nullable=False, index=True)
    buyer_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    message = Column(Text, nullable=True)
    preferred_date = Column(Date, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)

    property = relationship("Property")
    buyer = relationship("User")



class Favorite(Base):
    __tablename__ = "favorites"
    __table_args__ = (
        UniqueConstraint("user_id", "property_id", name="uq_favorite_user_property"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    property_id = Column(Integer, ForeignKey("properties.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)



class ViewingHistory(Base):
    __tablename__ = "viewing_history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    property_id = Column(Integer, ForeignKey("properties.id", ondelete="CASCADE"), nullable=False, index=True)
    viewed_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)



class SpatialQA(Base):
    """A question asked about a rectangular zone inside a 360° tour."""
    __tablename__ = "spatial_qa"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    property_id = Column(Integer, ForeignKey("properties.id", ondelete="CASCADE"), nullable=False, index=True)
    room_id = Column(String(100), nullable=True)
    zone_coords = Column(JSON, nullable=False)
    image_url = Column(String(500), nullable=True)
    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=True)
    status = Column(String(20), default="pending", nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)



class AIConversation(Base):
    __tablename__ = "ai_conversations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    messages = Column(JSON, nullable=False, default=list)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)



class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    type = Column(SQLEnum(NotificationType), nullable=False)
    content = Column(JSON, nullable=False, default=dict)
    read = Column(Boolean, default=False, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)



class Complaint(Base):
    __tablename__ = "complaints"

    id = Column(Integer, primary_key=True, index=True)
    seller_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    buyer_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    property_id = Column(Integer, ForeignKey("properties.id", ondelete="SET NULL"), nullable=True, index=True)
    reason = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)


class ModerationRecord(Base):
    __tablename__ = "moderation_decisions"

    id = Column(Integer, primary_key=True, index=True)
    seller_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    decision = Column(SQLEnum(ModerationDecision), nullable=False)
    ai_reasoning = Column(Text, nullable=True)
    overridden_by_admin = Column(Boolean, default=False, nullable=False)
    admin_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)



class Review(Base):
    __tablename__ = "reviews"
    __table_args__ = (
        UniqueConstraint("property_id", "user_id", name="uq_review_property_user"),
    )

    id = Column(Integer, primary_key=True, index=True)
    property_id = Column(Integer, ForeignKey("properties.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    rating = Column(Integer, nullable=False)
    text = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)

    property = relationship("Property", back_populates="reviews")
    user = relationship("User")



class PriceHistory(Base):
    __tablename__ = "price_history"

    id = Column(Integer, primary_key=True, index=True)
    property_id = Column(Integer, ForeignKey("properties.id", ondelete="CASCADE"), nullable=False, index=True)
    price = Column(Float, nullable=False)
    recorded_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)

    property = relationship("Property", back_populates="price_points")


class PriceTracker(Base):
    __tablename__ = "price_trackers"
    __table_args__ = (
        UniqueConstraint("user_id", "property_id", name="uq_tracker_user_property"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    property_id = Column(Integer, ForeignKey("properties.id", ondelete="CASCADE"), nullable=False, index=True)
    target_price = Column(Float, nullable=True)
    last_seen_price = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)



class InfrastructurePOI(Base):
    __tablename__ = "infrastructure_pois"

    id = Column(Integer, primary_key=True, index=True)
    kind = Column(String(40), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    lat = Column(Float, nullable=False, index=True)
    lng = Column(Float, nullable=False, index=True)



class Conversation(Base):
    """A 1-on-1 thread between a buyer and a seller, optionally about a property."""
    __tablename__ = "conversations"
    __table_args__ = (
        UniqueConstraint("buyer_id", "seller_id", "property_id", name="uq_conversation_pair"),
    )

    id = Column(Integer, primary_key=True, index=True)
    buyer_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    seller_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    property_id = Column(Integer, ForeignKey("properties.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    last_message_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)

    messages = relationship(
        "DirectMessage", back_populates="conversation",
        cascade="all, delete-orphan", order_by="DirectMessage.created_at",
    )


class DirectMessage(Base):
    __tablename__ = "direct_messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    sender_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    text = Column(Text, nullable=True)

    attachment_url = Column(String(500), nullable=True)
    attachment_name = Column(String(255), nullable=True)
    attachment_type = Column(String(100), nullable=True)
    attachment_size = Column(Integer, nullable=True)

    is_read = Column(Boolean, default=False, nullable=False, index=True)
    is_edited = Column(Boolean, default=False, nullable=False)
    is_deleted = Column(Boolean, default=False, nullable=False)
    reply_to_id = Column(Integer, ForeignKey("direct_messages.id", ondelete="SET NULL"), nullable=True)
    edited_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)

    conversation = relationship("Conversation", back_populates="messages")
    reply_to = relationship("DirectMessage", remote_side=[id])
