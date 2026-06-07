from datetime import datetime

from pydantic import BaseModel, Field


class ZoneCoords(BaseModel):
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    w: float = Field(gt=0, le=1)
    h: float = Field(gt=0, le=1)


class SpatialQuestionIn(BaseModel):
    property_id: int
    room_id: str | None = None
    zone_coords: ZoneCoords
    question: str = Field(min_length=1, max_length=1000)
    image_b64: str | None = None


class SpatialQAOut(BaseModel):
    id: int
    property_id: int
    room_id: str | None
    zone_coords: dict
    question: str
    answer: str | None
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class SpatialQAList(BaseModel):
    items: list[SpatialQAOut]
    total: int
