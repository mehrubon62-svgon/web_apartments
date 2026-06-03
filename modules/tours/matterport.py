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

# Matterport skybox face index -> py360convert "list" order [F, R, B, L, U, D]
_FACE_ORDER = [1, 2, 3, 4, 0, 5]
_PANO_RES_PREF = ["2k", "high", "low"]   # best available first (2k = 2048² faces)


def is_matterport_dump(names: list[str]) -> bool:
    """True if the archive looks like a matterport-dl showcase dump."""
    joined = "\n".join(names)
    return ("graph_GetShowcaseSweeps" in joined) or ("/assets/pan/" in joined and "_skybox" in joined)


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
    # yaw (around Y) from quaternion
    siny = 2 * (w * y + x * z)
    cosy = 1 - 2 * (y * y + z * z)
    return math.degrees(math.atan2(siny, cosy))


def _bearing_deg(dx: float, dz: float) -> float:
    """Compass-like bearing of vector (dx,dz) on the floor plane, in degrees,
    used to place a navigation arrow toward a neighbour sweep."""
    return math.degrees(math.atan2(dx, dz))


def convert(zf: zipfile.ZipFile, dest: Path) -> dict:
    """Convert a matterport-dl ZIP (already opened) into our viewer layout under
    `dest`. Writes skyboxes/*.jpg + metadata.json. Returns the metadata dict.
    Raises ValueError if the dump can't be parsed.
    """
    import numpy as np
    from PIL import Image
    import py360convert

    names = [n for n in zf.namelist() if not n.startswith("__MACOSX")]
    top = _strip_top(names)

    # locate the sweeps graph
    sweeps_name = next((n for n in names if n.endswith("graph_GetShowcaseSweeps.json")), None)
    if not sweeps_name:
        raise ValueError("graph_GetShowcaseSweeps.json not found in archive")
    sweeps = _read_json(zf, sweeps_name)
    try:
        locations = sweeps["data"]["model"]["locations"]
    except (KeyError, TypeError):
        raise ValueError("Unexpected sweeps JSON structure")

    # optional room labels
    rooms_json = next((n for n in names if n.endswith("graph_GetRooms.json")), None)
    room_label_by_id: dict[str, str] = {}
    if rooms_json:
        rj = _read_json(zf, rooms_json) or {}
        try:
            for r in rj["data"]["model"]["rooms"]:
                lbl = (r.get("label") or r.get("type") or "").strip()
                if r.get("id") and lbl:
                    room_label_by_id[r["id"]] = lbl
        except (KeyError, TypeError):
            pass

    # index all skybox face files by (uuid, res, face)
    face_index: dict[tuple, str] = {}
    for n in names:
        if "_skybox" in n and n.lower().endswith(".jpg") and "/assets/pan/" in n:
            try:
                res = n.split("/assets/pan/")[1].split("/")[0]
                fname = n.rsplit("/", 1)[-1]            # <uuid>_skyboxN.jpg
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

    # build room nodes
    id_to_room: dict[str, dict] = {}
    positions: dict[str, tuple] = {}
    rooms: list[dict] = []
    order: list[str] = []

    for loc in locations:
        pano = loc.get("pano") or {}
        uuid = pano.get("sweepUuid")
        loc_id = loc.get("id")
        if not uuid or not loc_id:
            continue
        face_names, res = faces_for(uuid)
        if not face_names:
            continue

        # convert 6 cube faces -> equirectangular
        imgs = []
        for fn in face_names:
            img = Image.open(io.BytesIO(zf.read(fn))).convert("RGB")
            imgs.append(np.asarray(img))
        cube = [imgs[i] for i in _FACE_ORDER]
        size = imgs[0].shape[0]
        # equirect width = 4 * face edge gives ~native sharpness; cap at 4096
        # so files stay reasonable. 2048² faces -> 4096×2048 panorama.
        out_w = min(4096, max(2048, size * 4))
        out_h = out_w // 2
        eq = py360convert.c2e(cube, h=out_h, w=out_w, cube_format="list")
        rel = f"skyboxes/{uuid}.jpg"
        Image.fromarray(eq.astype("uint8")).save(dest / rel, quality=92)

        pos = pano.get("position") or loc.get("position") or {"x": 0, "y": 0, "z": 0}
        positions[loc_id] = (pos.get("x", 0.0), pos.get("y", 0.0), pos.get("z", 0.0))
        label = (loc.get("room") or {}).get("id")
        name = room_label_by_id.get(label) or f"Точка {pano.get('label') or len(rooms) + 1}"

        room = {
            "id": loc_id,
            "name": name,
            "skybox": rel,
            "_neighbors": loc.get("neighbors", []),
            "links": [],
        }
        id_to_room[loc_id] = room
        rooms.append(room)
        order.append(loc_id)

    if not rooms:
        raise ValueError("No usable sweeps with panoramas found")

    # ------------------------------------------------------------------
    # Coordinate frame. Matterport sweep positions are metres in a Z-up (or
    # sometimes Y-up) world. All sweeps sit at ~tripod height, so the vertical
    # axis is the one with the *smallest* spread. The other two form the floor
    # plane used for the map, arrows and dollhouse layout.
    # ------------------------------------------------------------------
    axes = list(zip(*positions.values()))  # ([all x], [all y], [all z])
    spreads = [max(a) - min(a) for a in axes]
    up_axis = spreads.index(min(spreads))
    floor_axes = [i for i in range(3) if i != up_axis]
    fa, fb = floor_axes  # the two horizontal axes

    def viewer_xyz(p):
        """World position -> viewer space (Y-up): x=floor_a, y=height, z=-floor_b.
        Matches the .dam mesh transform so dollhouse markers sit on the mesh."""
        return (p[fa], p[up_axis], -p[fb])

    # camera positions in viewer space (used by the dollhouse / overview mode)
    for r in rooms:
        vx, vy, vz = viewer_xyz(positions[r["id"]])
        r["camera"] = {"x": round(vx, 3), "y": round(vy, 3), "z": round(vz, 3)}

    # links from neighbour graph. Heading convention matches the viewer camera:
    # a hotspot at yaw sits at viewer direction (cos yaw, *, sin yaw). The viewer
    # maps world -> (p[fa], height, -p[fb]), so the horizontal direction toward a
    # neighbour is (da, -db) and yaw = atan2(-db, da).
    for room in rooms:
        ax, ay, az = positions[room["id"]]
        a0, b0 = (ax, ay, az)[fa], (ax, ay, az)[fb]
        for nb in room.get("_neighbors", []):
            if nb in id_to_room:
                bp = positions[nb]
                da, db = bp[fa] - a0, bp[fb] - b0
                yaw = round(math.degrees(math.atan2(-db, da)), 1)
                room["links"].append({"to": nb, "yaw": yaw, "pitch": -18})
        # Face the first available doorway on arrival (so an arrow is in view).
        room["initialYaw"] = room["links"][0]["yaw"] if room["links"] else 0
        room.pop("_neighbors", None)

    # floor-plan layout from the two horizontal axes (normalised into 0..1,
    # keeping aspect ratio so the map isn't stretched).
    fa_vals = [positions[r["id"]][fa] for r in rooms]
    fb_vals = [positions[r["id"]][fb] for r in rooms]
    mina, maxa = min(fa_vals), max(fa_vals)
    minb, maxb = min(fb_vals), max(fb_vals)
    span = max(maxa - mina, maxb - minb) or 1.0
    for r in rooms:
        p = positions[r["id"]]
        r["plan"] = {
            "x": round(0.12 + 0.76 * (p[fa] - mina) / span, 4),
            "y": round(0.12 + 0.76 * (p[fb] - minb) / span, 4),
        }

    meta = {
        "name": "Matterport tour",
        "scale": 1.0,
        "headingOffset": 0,          # tune if the panorama's north is rotated
        "startRoom": order[0],
        "rooms": rooms,
        "floorplan": {"image": None, "width": 600, "height": 400},
        "measurements": [],
    }

    # Decode the proprietary .dam mesh into a textured .glb for the dollhouse /
    # top-down plan. Uses the SAME axis mapping as the camera positions so the
    # mesh and the room markers share one coordinate frame, and passes the sweep
    # positions so triangles are oriented into the rooms (dollhouse cutaway).
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
