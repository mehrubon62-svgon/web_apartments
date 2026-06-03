from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from models import get_db, User, Property, Tour, PropertyStatus
from dependencies import get_current_user, require_seller
from config import AI_APP_URL, MEDIA_DIR
from modules.tours.schemas import TourIn, TourOut, ShareResponse


router = APIRouter(prefix="/tours", tags=["360 Tours"])


def _get_property(db: Session, property_id: int) -> Property:
    prop = db.query(Property).filter(Property.id == property_id).first()
    if not prop or prop.status == PropertyStatus.deleted:
        raise HTTPException(status_code=404, detail="Property not found")
    return prop


def _rooms(tour: Tour) -> list[dict]:
    data = tour.rooms or []
    # Backwards-compat: tours stored as a bare list vs. {"rooms": [...]}
    if isinstance(data, dict):
        return data.get("rooms", [])
    return data


def _first_room_id(tour: Tour, rooms: list[dict]) -> str | None:
    data = tour.rooms
    if isinstance(data, dict) and data.get("first_room_id"):
        return data["first_room_id"]
    return rooms[0]["id"] if rooms else None


@router.get("/{property_id}", response_model=TourOut)
def get_tour(
    property_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Fetch the 360° tour for a property. Viewing it is recorded in history."""
    _get_property(db, property_id)
    tour = db.query(Tour).filter(Tour.property_id == property_id).first()
    if not tour:
        raise HTTPException(status_code=404, detail="No tour for this property")

    # The tour view counts as a view -> saved to history.
    from modules.history.crud import track_view
    track_view(db, current_user.id, property_id)

    rooms = _rooms(tour)
    return TourOut(
        id=tour.id,
        property_id=property_id,
        first_room_id=_first_room_id(tour, rooms),
        rooms=rooms,
    )


@router.put("/{property_id}", response_model=TourOut)
def upsert_tour(
    property_id: int,
    data: TourIn,
    db: Session = Depends(get_db),
    seller: User = Depends(require_seller),
):
    """Create or replace the 360° tour (seller only).

    Each room can define `links` — arrow hotspots that walk the viewer to
    another room, like the navigation arrows in Google Street View.
    """
    prop = _get_property(db, property_id)
    if prop.seller_id != seller.id and seller.role.value != "admin":
        raise HTTPException(status_code=403, detail="Not your listing")

    rooms = [r.model_dump() for r in data.rooms]
    first_room_id = data.first_room_id or (rooms[0]["id"] if rooms else None)
    payload = {"rooms": rooms, "first_room_id": first_room_id}

    tour = db.query(Tour).filter(Tour.property_id == property_id).first()
    if tour:
        tour.rooms = payload
    else:
        tour = Tour(property_id=property_id, rooms=payload)
        db.add(tour)
    db.commit()
    db.refresh(tour)
    return TourOut(id=tour.id, property_id=property_id, first_room_id=first_room_id, rooms=rooms)


@router.get("/{property_id}/pannellum")
def pannellum_config(
    property_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Ready-to-use Pannellum multi-scene config.

    The frontend can feed this straight into `pannellum.viewer(el, config)`.
    Each room becomes a scene; each link becomes a clickable 'scene' hotspot
    (the navigation arrow) that transitions to the linked panorama and faces
    `targetYaw` on arrival.
    """
    _get_property(db, property_id)
    tour = db.query(Tour).filter(Tour.property_id == property_id).first()
    if not tour:
        raise HTTPException(status_code=404, detail="No tour for this property")

    rooms = _rooms(tour)
    if not rooms:
        raise HTTPException(status_code=404, detail="Tour has no rooms")

    scenes: dict[str, dict] = {}
    name_by_id = {r["id"]: (r.get("name") or r["id"]) for r in rooms}
    for room in rooms:
        hotspots = []
        for link in room.get("links", []):
            dest = link["to_room_id"]
            # Tooltip = where this arrow leads (Street-View style: "To: Kitchen").
            label = link.get("label") or name_by_id.get(dest) or "Go"
            hs = {
                "type": "scene",
                "text": label,
                "yaw": link.get("yaw", 0.0),
                # Default arrows sit low (on the floor) like Street View if no
                # explicit pitch was authored.
                "pitch": link.get("pitch", -25.0),
                "sceneId": dest,
                "cssClass": "pnlm-scene-arrow",  # frontend styles this as a floor arrow
            }
            if link.get("target_yaw") is not None:
                hs["targetYaw"] = link["target_yaw"]
            hotspots.append(hs)

        scenes[room["id"]] = {
            "title": room.get("name"),
            "type": "equirectangular",
            "panorama": room["media_url"],
            "yaw": room.get("init_yaw", 0.0),
            "pitch": room.get("init_pitch", 0.0),
            "hfov": room.get("init_hfov", 100.0),
            "hotSpots": hotspots,
        }

    first_scene = _first_room_id(tour, rooms)
    return {
        "default": {
            "firstScene": first_scene,
            "sceneFadeDuration": 1000,  # smooth crossfade between panoramas
            "autoLoad": True,
        },
        "scenes": scenes,
    }


@router.get("/{property_id}/share", response_model=ShareResponse)
def share_room(
    property_id: int,
    room_id: str = Query(..., description="Room to deep-link to"),
    current_user: User = Depends(get_current_user),
):
    """Build a shareable deep link to a specific room of the tour."""
    url = f"{AI_APP_URL.rstrip('/')}/properties/{property_id}/tour?room={room_id}"
    return ShareResponse(url=url)


# ============================================================================
# 3D tour (Matterport-style): upload a ZIP with skyboxes/ + mesh/ + metadata.json
# ============================================================================
import io
import json
import zipfile
from pathlib import Path

# Where extracted 3D tours live, and the public URL prefix that serves them.
_TOURS3D_DIRNAME = "tours3d"
_MAX_ZIP_MB = 200
_ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".webp", ".json", ".glb", ".gltf", ".bin", ".hdr", ".ktx2"}


def _tour3d_dir(property_id: int) -> Path:
    return Path(MEDIA_DIR) / _TOURS3D_DIRNAME / str(property_id)


def _tour3d_base_url(property_id: int) -> str:
    return f"/media-files/{_TOURS3D_DIRNAME}/{property_id}/"


def _has_3d(tour: Tour | None) -> bool:
    return bool(isinstance(tour and tour.rooms, dict) and (tour.rooms or {}).get("model3d"))


def _safe_members(zf: zipfile.ZipFile) -> list[zipfile.ZipInfo]:
    """Return safe-to-extract members, blocking path traversal / absolute paths
    and disallowed file types."""
    safe = []
    for info in zf.infolist():
        if info.is_dir():
            continue
        name = info.filename.replace("\\", "/")
        if name.startswith("/") or ".." in name.split("/"):
            continue
        ext = Path(name).suffix.lower()
        if ext and ext not in _ALLOWED_EXT:
            continue
        safe.append(info)
    return safe


def _find_in_zip(names: list[str], *needles: str) -> str | None:
    for n in names:
        low = n.lower()
        if all(part in low for part in needles):
            return n
    return None


def _generate_metadata(dest: Path) -> dict:
    """Build a reasonable metadata.json from whatever files exist, so the viewer
    is usable even if the Matterport export didn't include one."""
    skybox_files = sorted(
        [p for p in (dest / "skyboxes").glob("*") if p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}]
    ) if (dest / "skyboxes").exists() else []
    # fall back: any images anywhere
    if not skybox_files:
        skybox_files = sorted([p for p in dest.rglob("*") if p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}])

    rooms = []
    n = len(skybox_files)
    for i, img in enumerate(skybox_files):
        rel = img.relative_to(dest).as_posix()
        rid = f"room{i + 1}"
        # chain rooms linearly so navigation works out of the box
        links = []
        if i > 0:
            links.append({"to": f"room{i}", "yaw": -90, "pitch": -8})
        if i < n - 1:
            links.append({"to": f"room{i + 2}", "yaw": 90, "pitch": -8})
        rooms.append({
            "id": rid,
            "name": f"Комната {i + 1}",
            "skybox": rel,
            "camera": {"x": i * 4.0, "y": 1.6, "z": 0.0},
            "initialYaw": 0,
            "links": links,
            "plan": {"x": (i + 1) / (n + 1), "y": 0.5},
        })

    glb = None
    for p in dest.rglob("*"):
        if p.suffix.lower() in {".glb", ".gltf"}:
            glb = p.relative_to(dest).as_posix()
            break

    meta = {
        "name": "3D tour",
        "scale": 1.0,
        "startRoom": rooms[0]["id"] if rooms else None,
        "rooms": rooms,
        "floorplan": {"image": None, "width": 600, "height": 400},
        "measurements": [],
    }
    if glb:
        meta["mesh"] = glb
    return meta


@router.post("/{property_id}/3d")
async def upload_3d_tour(
    property_id: int,
    file: UploadFile = File(..., description="ZIP with skyboxes/, mesh/, metadata.json"),
    db: Session = Depends(get_db),
    seller: User = Depends(require_seller),
):
    """Upload a Matterport-style 3D tour as a single ZIP (seller only).

    The archive is extracted into media_files/tours3d/{property_id}/. If it has
    no metadata.json, one is generated from the panoramas/model found inside.
    The 3D viewer is then available at /tour3d.html?base=<public folder>.
    """
    prop = _get_property(db, property_id)
    if prop.seller_id != seller.id and seller.role.value != "admin":
        raise HTTPException(status_code=403, detail="Not your listing")

    raw = await file.read()
    if len(raw) > _MAX_ZIP_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"ZIP exceeds {_MAX_ZIP_MB} MB")
    try:
        zf = zipfile.ZipFile(io.BytesIO(raw))
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Not a valid ZIP archive")

    members = _safe_members(zf)
    if not members:
        raise HTTPException(status_code=400, detail="ZIP has no usable files")

    dest = _tour3d_dir(property_id)
    # wipe any previous upload for this property
    if dest.exists():
        import shutil
        shutil.rmtree(dest, ignore_errors=True)
    dest.mkdir(parents=True, exist_ok=True)

    # ---- Matterport showcase dump? Convert cube skyboxes -> equirectangular. ----
    from modules.tours.matterport import is_matterport_dump, convert as convert_matterport
    all_names = [m.filename.replace("\\", "/") for m in members]
    if is_matterport_dump(all_names):
        try:
            convert_matterport(zf, dest)
        except Exception as exc:  # fall back to raw extract if conversion fails
            import shutil
            shutil.rmtree(dest, ignore_errors=True)
            dest.mkdir(parents=True, exist_ok=True)
            raise HTTPException(status_code=400, detail=f"Matterport conversion failed: {exc}")
        base_url = _tour3d_base_url(property_id)
        tour = db.query(Tour).filter(Tour.property_id == property_id).first()
        wrapper = dict(tour.rooms) if (tour and isinstance(tour.rooms, dict)) else \
            ({"rooms": tour.rooms} if (tour and isinstance(tour.rooms, list)) else {})
        wrapper["model3d"] = {"base": base_url, "metadata_generated": True, "source": "matterport"}
        if tour:
            tour.rooms = wrapper
        else:
            tour = Tour(property_id=property_id, rooms=wrapper)
            db.add(tour)
        db.commit()
        return JSONResponse({
            "ok": True, "base": base_url,
            "viewer_url": f"/tour3d.html?base={base_url}",
            "metadata_generated": True, "source": "matterport",
        })

    # Detect a common top-level folder to strip (Matterport exports often nest).
    names = all_names
    tops = {n.split("/")[0] for n in names if "/" in n}
    strip = ""
    if len(tops) == 1 and not any("/" not in n for n in names):
        strip = next(iter(tops)) + "/"

    for info in members:
        name = info.filename.replace("\\", "/")
        rel = name[len(strip):] if strip and name.startswith(strip) else name
        if not rel:
            continue
        target = dest / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        with zf.open(info) as src, target.open("wb") as out:
            out.write(src.read())

    # Ensure metadata.json exists.
    meta_path = dest / "metadata.json"
    if not meta_path.exists():
        meta = _generate_metadata(dest)
        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        generated = True
    else:
        generated = False

    base_url = _tour3d_base_url(property_id)

    # Persist a marker in the tour record (reuse the rooms JSON wrapper).
    # NOTE: build a NEW dict — SQLAlchemy won't detect in-place mutation of a
    # JSON column, so reassigning the same object reference wouldn't save.
    tour = db.query(Tour).filter(Tour.property_id == property_id).first()
    if tour and isinstance(tour.rooms, dict):
        wrapper = dict(tour.rooms)
    elif tour and isinstance(tour.rooms, list):
        wrapper = {"rooms": tour.rooms}
    else:
        wrapper = {}
    wrapper["model3d"] = {"base": base_url, "metadata_generated": generated}
    if tour:
        tour.rooms = wrapper
    else:
        tour = Tour(property_id=property_id, rooms=wrapper)
        db.add(tour)
    db.commit()

    return JSONResponse({
        "ok": True,
        "base": base_url,
        "viewer_url": f"/tour3d.html?base={base_url}",
        "metadata_generated": generated,
        "files": len(members),
    })


@router.get("/{property_id}/3d")
def get_3d_tour(
    property_id: int,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
):
    """Return the 3D-tour info (base folder + viewer URL) if one was uploaded."""
    tour = db.query(Tour).filter(Tour.property_id == property_id).first()
    if not _has_3d(tour):
        raise HTTPException(status_code=404, detail="No 3D tour for this property")
    base = tour.rooms["model3d"]["base"]
    return {"base": base, "viewer_url": f"/tour3d.html?base={base}"}


@router.delete("/{property_id}/3d")
def delete_3d_tour(
    property_id: int,
    db: Session = Depends(get_db),
    seller: User = Depends(require_seller),
):
    """Remove the uploaded 3D tour (seller only)."""
    prop = _get_property(db, property_id)
    if prop.seller_id != seller.id and seller.role.value != "admin":
        raise HTTPException(status_code=403, detail="Not your listing")
    import shutil
    shutil.rmtree(_tour3d_dir(property_id), ignore_errors=True)
    tour = db.query(Tour).filter(Tour.property_id == property_id).first()
    if tour and isinstance(tour.rooms, dict) and "model3d" in tour.rooms:
        w = dict(tour.rooms)
        w.pop("model3d", None)
        tour.rooms = w
        db.commit()
    return {"detail": "3D tour removed"}
