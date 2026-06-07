"""Matterport export ingestion.

A Matterport "matterport-dl" dump (the ZIP some scanners/tools produce) is NOT
the simple skyboxes/+metadata.json layout — it's the raw showcase data:

    models/<hash>/assets/pan/<res>/_/<sweepUuid>_skybox0..5.jpg   (cube faces)
    api/mp/models/graph_GetShowcaseSweeps.json                    (sweep graph)

This module detects that layout, converts each sweep's 6 cube faces into a single
equirectangular panorama, and emits a metadata.json our 3D viewer understands:
rooms (id/name/skybox/camera), links (from sweep `neighbors`) and a floor plan
laid out from sweep world positions.

Cube-face order was determined empirically by edge-matching (seam error 0):
    skybox1,2,3,4 = horizontal ring (F,R,B,L), skybox0 = up, skybox5 = down.
"""
from __future__ import annotations

import io
import json
import math
import zipfile
from pathlib import Path

_FACE_ORDER = [1, 2, 3, 4, 0, 5]
_PANO_RES_PREF = ["2k", "high", "low"]


def is_matterport_dump(names: list[str]) -> bool:
    """True if the archive looks like a matterport-dl showcase dump."""
    joined = "\n".join(names)
    return ("graph_GetShowcaseSweeps" in joined) or ("/assets/pan/" in joined and "_skybox" in joined)


def extract_model_id(zf: zipfile.ZipFile, names: list[str]) -> str | None:
    """Recover the Matterport model ID (e.g. 'BxeZPN7PQWL') from a dump so we can
    embed the official Matterport player. matterport-dl names the top folder and
    the model API paths after the public model ID; it's also inside
    graph_GetModelDetails.json. Returns None if it can't be found."""
    import re
    id_re = re.compile(r"^[A-Za-z0-9]{11}$")

    top = _strip_top(names).rstrip("/")
    if top and id_re.match(top):
        return top

    details = next((n for n in names if n.endswith("graph_GetModelDetails.json")), None)
    if details:
        dj = _read_json(zf, details) or {}
        try:
            model = dj["data"]["model"]
            for key in ("id", "externalId", "sid"):
                v = model.get(key)
                if isinstance(v, str) and id_re.match(v):
                    return v
        except (KeyError, TypeError):
            pass

    for n in names:
        parts = n.split("/")
        for i, p in enumerate(parts):
            if p in ("models", "show") and i + 1 < len(parts) and id_re.match(parts[i + 1]):
                return parts[i + 1]
    return None



def _strip_top(names: list[str]) -> str:
    """Common top-level folder (e.g. 'BxeZPN7PQWL/'), if any."""
    tops = {n.split("/")[0] for n in names if "/" in n and not n.startswith("__MACOSX")}
    return (next(iter(tops)) + "/") if len(tops) == 1 else ""


def _read_json(zf: zipfile.ZipFile, name: str):
    try:
        return json.loads(zf.read(name))
    except Exception:
        return None


def _quat_to_yaw(rot: dict) -> float:
    """Yaw (degrees) around the vertical axis from a quaternion. Matterport uses
    Y-up; yaw is rotation about Y."""
    if not rot:
        return 0.0
    x, y, z, w = rot.get("x", 0), rot.get("y", 0), rot.get("z", 0), rot.get("w", 1)
    siny = 2 * (w * y + x * z)
    cosy = 1 - 2 * (y * y + z * z)
    return math.degrees(math.atan2(siny, cosy))


def _bearing_deg(dx: float, dz: float) -> float:
    """Compass-like bearing of vector (dx,dz) on the floor plane, in degrees,
    used to place a navigation arrow toward a neighbour sweep."""
    return math.degrees(math.atan2(dx, dz))


def convert(zf: zipfile.ZipFile, dest: Path, progress=None) -> dict:
    """Convert a matterport-dl ZIP (already opened) into our viewer layout under
    `dest`. Writes skyboxes/*.jpg + metadata.json. Returns the metadata dict.
    Raises ValueError if the dump can't be parsed.

    `progress(done, total)` — optional callback invoked as each sweep panorama
    finishes, so the caller can report conversion progress to the UI.
    """
    import numpy as np
    from PIL import Image
    import py360convert

    names = [n for n in zf.namelist() if not n.startswith("__MACOSX")]
    top = _strip_top(names)

    sweeps_name = next((n for n in names if n.endswith("graph_GetShowcaseSweeps.json")), None)
    if not sweeps_name:
        raise ValueError("graph_GetShowcaseSweeps.json not found in archive")
    sweeps = _read_json(zf, sweeps_name)
    try:
        locations = sweeps["data"]["model"]["locations"]
    except (KeyError, TypeError):
        raise ValueError("Unexpected sweeps JSON structure")

    rooms_json = next((n for n in names if n.endswith("graph_GetRooms.json")), None)
    room_label_by_id: dict[str, str] = {}
    if rooms_json:
        rj = _read_json(zf, rooms_json) or {}
        try:
            for r in rj["data"]["model"]["rooms"]:
                lbl = (r.get("label") or r.get("type") or "").strip()
                if not lbl and isinstance(r.get("tags"), list) and r["tags"]:
                    lbl = ", ".join(str(t).strip().capitalize() for t in r["tags"][:2] if t)
                if r.get("id") and lbl:
                    room_label_by_id[r["id"]] = lbl
        except (KeyError, TypeError):
            pass

    floors_json = next((n for n in names if n.endswith("graph_GetFloors.json")), None)
    floor_seq_by_id: dict[str, int] = {}
    floor_label_by_seq: dict[int, str] = {}
    if floors_json:
        fj = _read_json(zf, floors_json) or {}
        try:
            for f in fj["data"]["model"]["floors"]:
                seq = f.get("sequence", 0)
                if f.get("id") is not None:
                    floor_seq_by_id[f["id"]] = seq
                    floor_label_by_seq[seq] = (f.get("label") or f"Floor {seq + 1}").strip()
        except (KeyError, TypeError):
            pass

    face_index: dict[tuple, str] = {}
    for n in names:
        if "_skybox" in n and n.lower().endswith(".jpg") and "/assets/pan/" in n:
            try:
                res = n.split("/assets/pan/")[1].split("/")[0]
                fname = n.rsplit("/", 1)[-1]
                uuid, rest = fname.split("_skybox")
                face = int(rest.split(".")[0])
                face_index[(uuid, res, face)] = n
            except (ValueError, IndexError):
                continue

    def faces_for(uuid: str):
        for res in _PANO_RES_PREF:
            if all((uuid, res, f) in face_index for f in range(6)):
                return [face_index[(uuid, res, f)] for f in range(6)], res
        return None, None

    sky_dir = dest / "skyboxes"
    sky_dir.mkdir(parents=True, exist_ok=True)
    thumb_dir = dest / "thumbs"
    thumb_dir.mkdir(parents=True, exist_ok=True)

    id_to_room: dict[str, dict] = {}
    positions: dict[str, tuple] = {}
    rotations: dict[str, dict] = {}
    rooms: list[dict] = []
    order: list[str] = []

    convert_tasks = []
    for loc in locations:
        pano = loc.get("pano") or {}
        uuid = pano.get("sweepUuid")
        loc_id = loc.get("id")
        if not uuid or not loc_id:
            continue
        face_names, res = faces_for(uuid)
        if not face_names:
            continue
        try:
            face_bytes = [zf.read(face_names[i]) for i in _FACE_ORDER]
        except Exception:
            continue

        rel = f"skyboxes/{uuid}.jpg"
        thumb_rel = f"thumbs/{uuid}.jpg"
        convert_tasks.append((dest / rel, dest / thumb_rel, face_bytes))

        pos = pano.get("position") or loc.get("position") or {"x": 0, "y": 0, "z": 0}
        positions[loc_id] = (pos.get("x", 0.0), pos.get("y", 0.0), pos.get("z", 0.0))
        rotations[loc_id] = pano.get("rotation") or {}
        label = (loc.get("room") or {}).get("id")
        pano_label = pano.get("label") or str(len(rooms) + 1)
        room_name = room_label_by_id.get(label)
        name = f"{room_name} · {pano_label}" if room_name else f"Point {pano_label}"

        room = {
            "id": loc_id,
            "name": name,
            "skybox": rel,
            "thumb": thumb_rel,
            "_neighbors": loc.get("neighbors", []),
            "_floor_id": (loc.get("floor") or {}).get("id"),
            "links": [],
        }
        id_to_room[loc_id] = room
        rooms.append(room)
        order.append(loc_id)

    if not rooms:
        raise ValueError("No usable sweeps with panoramas found")

    import os
    from concurrent.futures import ThreadPoolExecutor
    import threading

    total = len(convert_tasks)
    _lock = threading.Lock()
    _done = [0]

    def _stitch(out_path, thumb_path, face_bytes):
        cube = [np.asarray(Image.open(io.BytesIO(b)).convert("RGB")) for b in face_bytes]
        size = cube[0].shape[0]
        out_w = min(4096, max(2048, size * 4))
        eq = py360convert.c2e(cube, h=out_w // 2, w=out_w, cube_format="list")
        Image.fromarray(eq.astype("uint8")).save(out_path, quality=92)
        try:
            h, w = eq.shape[:2]
            cw, ch = w // 4, h // 3
            cx, cy = w // 2, h // 2
            crop = eq[cy - ch // 2: cy + ch // 2, cx - cw // 2: cx + cw // 2]
            Image.fromarray(crop.astype("uint8")).resize((320, 200)).save(thumb_path, quality=80)
        except Exception:
            pass
        if progress:
            with _lock:
                _done[0] += 1
                try:
                    progress(_done[0], total)
                except Exception:
                    pass

    workers = max(1, min(len(convert_tasks), (os.cpu_count() or 2)))
    with ThreadPoolExecutor(max_workers=workers) as ex:
        list(ex.map(lambda t: _stitch(*t), convert_tasks))

    axes = list(zip(*positions.values()))
    spreads = [max(a) - min(a) for a in axes]
    up_axis = spreads.index(min(spreads))
    floor_axes = [i for i in range(3) if i != up_axis]
    fa, fb = floor_axes

    def viewer_xyz(p):
        """World position -> viewer space (Y-up): x=floor_a, y=height, z=-floor_b.
        Matches the .dam mesh transform so dollhouse markers sit on the mesh."""
        return (p[fa], p[up_axis], -p[fb])

    def sweep_heading(rid):
        rot = rotations.get(rid) or {}
        x, y, z, w = rot.get("x", 0.0), rot.get("y", 0.0), rot.get("z", 0.0), rot.get("w", 1.0)
        comp = (x, y, z)[up_axis]
        twist = math.degrees(2.0 * math.atan2(comp, w))
        return round(-twist, 2)

    for r in rooms:
        vx, vy, vz = viewer_xyz(positions[r["id"]])
        r["camera"] = {"x": round(vx, 3), "y": round(vy, 3), "z": round(vz, 3)}
        r["heading"] = sweep_heading(r["id"])

    floors_meta: list[dict] = []
    has_meta = bool(floor_seq_by_id) and any(r.get("_floor_id") in floor_seq_by_id for r in rooms)
    if has_meta:
        seqs = sorted({floor_seq_by_id[r["_floor_id"]] for r in rooms if r.get("_floor_id") in floor_seq_by_id})
        seq_to_idx = {s: i for i, s in enumerate(seqs)}
        for r in rooms:
            s = floor_seq_by_id.get(r.get("_floor_id"))
            r["floor"] = seq_to_idx.get(s, 0)
        floors_meta = [{"index": i, "name": floor_label_by_seq.get(s) or f"Floor {i + 1}"}
                       for i, s in enumerate(seqs)]
    else:
        ups = sorted(((positions[r["id"]][up_axis], r["id"]) for r in rooms), key=lambda t: t[0])
        GAP = 1.6
        idx, prev = -1, None
        floor_of: dict[str, int] = {}
        for h, rid in ups:
            if prev is None or (h - prev) > GAP:
                idx += 1
            floor_of[rid] = idx
            prev = h
        for r in rooms:
            r["floor"] = floor_of[r["id"]]
        floors_meta = [{"index": i, "name": f"Floor {i + 1}"} for i in range(idx + 1)]

    for r in rooms:
        r.pop("_floor_id", None)

    for room in rooms:
        ax, ay, az = positions[room["id"]]
        a0, b0 = (ax, ay, az)[fa], (ax, ay, az)[fb]
        for nb in room.get("_neighbors", []):
            if nb in id_to_room:
                bp = positions[nb]
                da, db = bp[fa] - a0, bp[fb] - b0
                yaw = round(math.degrees(math.atan2(-db, da)), 1)
                room["links"].append({"to": nb, "yaw": yaw, "pitch": -18})
        room["initialYaw"] = room["links"][0]["yaw"] if room["links"] else 0
        room.pop("_neighbors", None)

    xs = [r["camera"]["x"] for r in rooms]
    zs = [r["camera"]["z"] for r in rooms]
    minx, maxx = min(xs), max(xs)
    minz, maxz = min(zs), max(zs)
    span = max(maxx - minx, maxz - minz) or 1.0
    for r in rooms:
        cam = r["camera"]
        r["plan"] = {
            "x": round(0.12 + 0.76 * (cam["x"] - minx) / span, 4),
            "y": round(0.12 + 0.76 * (cam["z"] - minz) / span, 4),
        }

    meta = {
        "name": "Matterport tour",
        "scale": 1.0,
        "headingOffset": 0,
        "startRoom": order[0],
        "rooms": rooms,
        "floors": floors_meta,
        "floorplan": {"image": None, "width": 600, "height": 400},
        "measurements": [],
    }

    try:
        from modules.tours.dam import convert_dam_to_glb
        sweep_pts = [(r["camera"]["x"], r["camera"]["y"], r["camera"]["z"]) for r in rooms]
        mesh_rel = convert_dam_to_glb(zf, names, dest, axis_map=(fa, up_axis, fb), sweeps=sweep_pts)
        if mesh_rel:
            meta["mesh"] = mesh_rel
    except Exception:
        pass

    (dest / "metadata.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")


    return meta


_SPHR_FACE_TO_SKYBOX = {0: 5, 1: 1, 2: 2, 3: 3, 4: 4, 5: 0}


def _quat_to_euler_xyz(rot: dict):
    """Quaternion -> Euler XYZ (radians), matching three.js Euler order 'XYZ'."""
    import math as _m
    x, y, z, w = rot.get("x", 0.0), rot.get("y", 0.0), rot.get("z", 0.0), rot.get("w", 1.0)
    m11 = 1 - 2 * (y * y + z * z); m12 = 2 * (x * y - z * w); m13 = 2 * (x * z + y * w)
    m22 = 1 - 2 * (x * x + z * z); m23 = 2 * (y * z - x * w)
    m32 = 2 * (y * z + x * w); m33 = 1 - 2 * (x * x + y * y)
    ey = _m.asin(max(-1.0, min(1.0, m13)))
    if abs(m13) < 0.9999999:
        ex = _m.atan2(-m23, m33)
        ez = _m.atan2(-m12, m11)
    else:
        ex = _m.atan2(m32, m22)
        ez = 0.0
    return (ex, ey, ez)


def _emit_sphr(zf, names, dest, locations, face_index, mesh_rel, up_axis):
    """Write sphr's cube faces (cube/<uuid>_face<0..5>.jpg) and sphr_space.json
    so the self-hosted sphr engine can render this tour."""
    import io as _io
    from PIL import Image

    cube_dir = dest / "cube"
    cube_dir.mkdir(parents=True, exist_ok=True)

    def faces_for(uuid):
        for res in _PANO_RES_PREF:
            if all((uuid, res, f) in face_index for f in range(6)):
                return res
        return None

    nodes = []
    idx = 0
    first_uuid = None
    for loc in locations:
        pano = loc.get("pano") or {}
        uuid = pano.get("sweepUuid")
        if not uuid:
            continue
        res = faces_for(uuid)
        if not res:
            continue
        for sphr_face in range(6):
            sky = _SPHR_FACE_TO_SKYBOX[sphr_face]
            src = face_index.get((uuid, res, sky))
            if not src:
                continue
            out = cube_dir / f"{uuid}_face{sphr_face}.jpg"
            if not out.exists():
                img = Image.open(_io.BytesIO(zf.read(src))).convert("RGB")
                img.save(out, quality=90)

        pos = pano.get("position") or loc.get("position") or {"x": 0, "y": 0, "z": 0}
        px, py, pz = pos.get("x", 0.0), pos.get("y", 0.0), pos.get("z", 0.0)
        ex, ey, ez = _quat_to_euler_xyz(pano.get("rotation") or {})
        fp = {"x": px, "y": py, "z": pz}
        axis_key = ("x", "y", "z")[up_axis]
        fp[axis_key] = (px, py, pz)[up_axis] - 1.5
        if first_uuid is None:
            first_uuid = uuid
        nodes.append({
            "uuid": uuid,
            "image": uuid,
            "index": idx,
            "position": {"x": round(px, 6), "y": round(py, 6), "z": round(pz, 6)},
            "rotation": {"x": round(ex, 6), "y": round(ey, 6), "z": round(ez, 6)},
            "resolution": "2048",
            "floorPosition": {"x": round(fp["x"], 6), "y": round(fp["y"], 6), "z": round(fp["z"], 6)},
        })
        idx += 1

    space = {
        "type": "spaces",
        "version": None,
        "mesh": ("mesh/model.glb" if mesh_rel else None),
        "space_data": {
            "nodes": nodes,
            "initialNode": first_uuid,
            "sceneSettings": {
                "nodes": {"scale": 1, "offsetPosition": {"x": 0, "y": 0, "z": 0}, "offsetRotation": {"x": 0, "y": 0, "z": 0}},
                "dollhouse": {"scale": 1, "offsetPosition": {"x": 0, "y": 0, "z": 0}, "offsetRotation": {"x": 0, "y": 0, "z": 0}},
                "offsetPosition": {"x": 0, "y": 0, "z": 0},
                "offsetRotation": {"x": 0, "y": 0, "z": 0},
            },
            "initialRotation": {"polar": 90, "azimuth": 0},
        },
    }
    (dest / "sphr_space.json").write_text(json.dumps(space, ensure_ascii=False, indent=2), encoding="utf-8")
    return space
