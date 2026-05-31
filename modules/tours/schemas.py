from pydantic import BaseModel, Field


class RoomLink(BaseModel):
    """A hotspot linking to another room (Pannellum scene link)."""
    to_room_id: str
    yaw: float = 0.0
    pitch: float = 0.0
    label: str | None = None


class Room(BaseModel):
    id: str
    name: str
    media_url: str  # equirectangular 360° image URL
    links: list[RoomLink] = Field(default_factory=list)


class TourIn(BaseModel):
    rooms: list[Room]


class TourOut(BaseModel):
    id: int
    property_id: int
    rooms: list[Room]

    class Config:
        from_attributes = True


class ShareResponse(BaseModel):
    url: str
