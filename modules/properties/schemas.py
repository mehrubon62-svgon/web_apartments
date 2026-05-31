from datetime import datetime, date

from pydantic import BaseModel, Field

from models import PropertyType, DealType, RentTerm, PropertyStatus, MediaKind
from modules.users.schemas import UserPublic


class MediaIn(BaseModel):
    url: str
    type: MediaKind = MediaKind.photo
    order: int = 0


class MediaOut(BaseModel):
    id: int
    url: str
    type: MediaKind
    order: int

    class Config:
        from_attributes = True


class PropertyCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str | None = None
    type: PropertyType
    deal_type: DealType
    rent_term: RentTerm | None = None
    price: float = Field(gt=0)
    area: float = Field(gt=0)
    rooms: int | None = Field(default=None, ge=0)
    address: str | None = None
    # Manual pin (optional). If omitted, we geocode `address` via Mapbox.
    lat: float | None = None
    lng: float | None = None
    house_rules: str | None = None
    media: list[MediaIn] = Field(default_factory=list)


class PropertyUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    type: PropertyType | None = None
    deal_type: DealType | None = None
    rent_term: RentTerm | None = None
    price: float | None = Field(default=None, gt=0)
    area: float | None = Field(default=None, gt=0)
    rooms: int | None = None
    address: str | None = None
    lat: float | None = None
    lng: float | None = None
    house_rules: str | None = None
    status: PropertyStatus | None = None


class PropertyOut(BaseModel):
    id: int
    seller: UserPublic
    title: str
    description: str | None
    type: PropertyType
    deal_type: DealType
    rent_term: RentTerm | None
    price: float
    area: float
    rooms: int | None
    address: str | None
    lat: float | None
    lng: float | None
    house_rules: str | None
    status: PropertyStatus
    views_count: int
    created_at: datetime
    media: list[MediaOut] = []
    has_tour: bool = False
    is_favorited: bool = False
    avg_rating: float | None = None

    class Config:
        from_attributes = True


class PropertyList(BaseModel):
    items: list[PropertyOut]
    total: int


class MapMarker(BaseModel):
    id: int
    lat: float
    lng: float
    price: float
    type: PropertyType
    deal_type: DealType
    title: str


class InfrastructureMarker(BaseModel):
    id: int
    kind: str  # metro | school | shop
    name: str
    lat: float
    lng: float

    class Config:
        from_attributes = True


class PriceHistoryPoint(BaseModel):
    price: float
    recorded_at: datetime

    class Config:
        from_attributes = True


class AvailabilityIn(BaseModel):
    start_date: date
    end_date: date


class AvailabilityOut(AvailabilityIn):
    id: int

    class Config:
        from_attributes = True


class ReviewIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    text: str | None = None


class ReviewOut(BaseModel):
    id: int
    user: UserPublic
    rating: int
    text: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class MortgageRequest(BaseModel):
    down_payment: float = Field(ge=0)
    annual_rate: float = Field(gt=0, description="Annual interest rate in percent, e.g. 7.5")
    years: int = Field(gt=0, le=40)


class MortgageResponse(BaseModel):
    principal: float
    monthly_payment: float
    total_paid: float
    total_interest: float


class ComparisonRow(BaseModel):
    id: int
    title: str
    type: PropertyType
    deal_type: DealType
    price: float
    area: float
    rooms: int | None
    price_per_sqm: float
    avg_rating: float | None
    has_tour: bool


class ComparisonResult(BaseModel):
    items: list[ComparisonRow]
    cheapest_id: int | None = None
    largest_id: int | None = None
    best_value_id: int | None = None  # lowest price per m²


class AIReviewResult(BaseModel):
    verdict: str  # great_deal | fair | overpriced | suspicious | likely_scam | insufficient_data
    deal_score: int  # 0..100
    scam_risk: str  # low | medium | high | unknown
    summary: str
    pros: list[str] = []
    cons: list[str] = []
    red_flags: list[str] = []
    market: dict = {}
    ai_used: bool = False
