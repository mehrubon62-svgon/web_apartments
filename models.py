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


# SQLite needs check_same_thread=False; Postgres/Supabase must not get that arg.
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


# ===== Enums =====

class RoleEnum(str, enum.Enum):
    buyer = "buyer"        # buyer / renter
    seller = "seller"      # seller / landlord / realtor / developer / agency
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
    short = "short"        # short-term
    long = "long"          # long-term


class PropertyStatus(str, enum.Enum):
    active = "active"
    paused = "paused"
    deleted = "deleted"


class MediaKind(str, enum.Enum):
    photo = "photo"
    pano = "360"           # 360° panorama


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
    unfounded = "unfounded"   # complaints unfounded, no action
    warning = "warning"
    ban = "ban"


# ===== Users =====

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=True)  # nullable for Google-only accounts
    full_name = Column(String(120), nullable=True)
    avatar_url = Column(String(500), nullable=True)
    phone = Column(String(30), nullable=True)

    role = Column(SQLEnum(RoleEnum), default=RoleEnum.buyer, nullable=False, index=True)
    status = Column(SQLEnum(UserStatus), default=UserStatus.active, nullable=False, index=True)

    # Seller-specific profile bits (optional)
    company_name = Column(String(150), nullable=True)

    google_sub = Column(String(255), unique=True, nullable=True, index=True)

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


# ===== Properties =====

class Property(Base):
    __tablename__ = "properties"

    id = Column(Integer, primary_key=True, index=True)
    seller_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    type = Column(SQLEnum(PropertyType), nullable=False, index=True)
    deal_type = Column(SQLEnum(DealType), nullable=False, index=True)
    rent_term = Column(SQLEnum(RentTerm), nullable=True)  # only for rentals

    price = Column(Float, nullable=False, index=True)
    area = Column(Float, nullable=False, index=True)  # m²
    rooms = Column(Integer, nullable=True)

    address = Column(String(400), nullable=True)
    lat = Column(Float, nullable=True, index=True)
    lng = Column(Float, nullable=True, index=True)

    house_rules = Column(Text, nullable=True)        # rentals
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


# ===== Rentals: availability calendar =====

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
    status = Column(String(20), default="open", nullable=False)  # open|paid|cancelled|expired
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)

    booking = relationship("Booking")


# ===== Purchase requests (sale) / viewing requests =====

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


# ===== Favorites =====

class Favorite(Base):
    __tablename__ = "favorites"
    __table_args__ = (
        UniqueConstraint("user_id", "property_id", name="uq_favorite_user_property"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    property_id = Column(Integer, ForeignKey("properties.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


# ===== Viewing history =====

class ViewingHistory(Base):
    __tablename__ = "viewing_history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    property_id = Column(Integer, ForeignKey("properties.id", ondelete="CASCADE"), nullable=False, index=True)
    viewed_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)


# ===== Spatial Q&A =====

class SpatialQA(Base):
    """A question asked about a rectangular zone inside a 360° tour."""
    __tablename__ = "spatial_qa"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    property_id = Column(Integer, ForeignKey("properties.id", ondelete="CASCADE"), nullable=False, index=True)
    room_id = Column(String(100), nullable=True)  # which tour room
    zone_coords = Column(JSON, nullable=False)     # {"x":..,"y":..,"w":..,"h":..} normalized 0..1
    image_url = Column(String(500), nullable=True) # screenshot of the zone
    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=True)
    status = Column(String(20), default="pending", nullable=False)  # pending|done|error
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)


# ===== AI conversations =====

class AIConversation(Base):
    __tablename__ = "ai_conversations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    messages = Column(JSON, nullable=False, default=list)  # [{"role","content"}, ...]
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


# ===== Notifications =====

class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    type = Column(SQLEnum(NotificationType), nullable=False)
    content = Column(JSON, nullable=False, default=dict)  # {"title","body","property_id",...}
    read = Column(Boolean, default=False, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)


# ===== Complaints & moderation =====

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


# ===== Reviews =====

class Review(Base):
    __tablename__ = "reviews"
    __table_args__ = (
        UniqueConstraint("property_id", "user_id", name="uq_review_property_user"),
    )

    id = Column(Integer, primary_key=True, index=True)
    property_id = Column(Integer, ForeignKey("properties.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    rating = Column(Integer, nullable=False)  # 1..5
    text = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)

    property = relationship("Property", back_populates="reviews")
    user = relationship("User")


# ===== Price history & trackers =====

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
    target_price = Column(Float, nullable=True)  # notify when price <= target (or any drop if null)
    last_seen_price = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


# ===== Infrastructure markers (metro, schools, shops) =====

class InfrastructurePOI(Base):
    __tablename__ = "infrastructure_pois"

    id = Column(Integer, primary_key=True, index=True)
    kind = Column(String(40), nullable=False, index=True)  # metro|school|shop
    name = Column(String(200), nullable=False)
    lat = Column(Float, nullable=False, index=True)
    lng = Column(Float, nullable=False, index=True)
