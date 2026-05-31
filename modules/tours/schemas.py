from pydantic import BaseModel, Field, field_validator


class RoomLink(BaseModel):
    """An arrow hotspot that walks the viewer to another room.

    Mirrors a Pannellum 'scene' hotspot:
      - yaw/pitch  : where the arrow sits in THIS panorama (degrees)
      - to_room_id : the scene to jump to
      - target_yaw : where the camera looks when arriving (optional)
      - label      : tooltip text on the arrow
    """
    to_room_id: str
    yaw: float = Field(0.0, ge=-180, le=180)
    pitch: float = Field(0.0, ge=-90, le=90)
    target_yaw: float | None = Field(default=None, ge=-180, le=180)
    label: str | None = None


class Room(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    name: str
    media_url: str  # equirectangular 360° image URL
    # Initial camera angles when this room loads
    init_yaw: float = Field(0.0, ge=-180, le=180)
    init_pitch: float = Field(0.0, ge=-90, le=90)
    init_hfov: float = Field(100.0, ge=50, le=120)
    links: list[RoomLink] = Field(default_factory=list)


class TourIn(BaseModel):
    rooms: list[Room]
    # Which room opens first. Defaults to the first room.
    first_room_id: str | None = None

    @field_validator("rooms")
    @classmethod
    def rooms_must_have_unique_ids(cls, rooms):
        if not rooms:
            raise ValueError("A tour needs at least one room")
        ids = [r.id for r in rooms]
        if len(ids) != len(set(ids)):
            raise ValueError("Room ids must be unique")
        # Every link must point to an existing room
        valid = set(ids)
        for r in rooms:
            for link in r.links:
                if link.to_room_id not in valid:
                    raise ValueError(
                        f"Room '{r.id}' links to unknown room '{link.to_room_id}'"
                    )
                if link.to_room_id == r.id:
                    raise ValueError(f"Room '{r.id}' cannot link to itself")
        return rooms


class TourOut(BaseModel):
    id: int
    property_id: int
    first_room_id: str | None = None
    rooms: list[Room]

    class Config:
        from_attributes = True


class ShareResponse(BaseModel):
    url: str
