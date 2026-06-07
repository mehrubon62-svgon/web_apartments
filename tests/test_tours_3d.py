"""3D-tour (Matterport ZIP) ingestion tests — Section 9 of the spec.

Covers: dump detection, model-id extraction, cube->equirect conversion,
metadata correctness, the upload/get/delete endpoints (auth, path-traversal,
oversize), and persistence that does NOT clobber an existing 360° tour.

Synthetic Matterport dumps are built in-memory with tiny (16x16) cube faces so
the real numpy/Pillow/py360convert conversion runs fast.
"""
import io
import json
import math
import zipfile

import pytest

from modules.tours import matterport
from modules.tours import router as tours_router


HASH = "8885f156284c47c0b6e49daff3cf2c8b"
MODEL_ID = "BxeZPN7PQWL"
FACE_COLORS = [(200, 60, 60), (60, 200, 60), (60, 60, 200),
               (200, 200, 60), (60, 200, 200), (200, 60, 200)]


def _tiny_face(color, size=16):
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (size, size), color).save(buf, format="JPEG")
    return buf.getvalue()


def _quat_up(angle_deg):
    """Quaternion for a twist of `angle_deg` about the vertical (z, the
    smallest-spread axis in our synthetic layout)."""
    a = math.radians(angle_deg) / 2
    return {"x": 0.0, "y": 0.0, "z": math.sin(a), "w": math.cos(a)}


def build_matterport_zip(n=3, top=MODEL_ID, with_details=True, with_rooms=True, floors=1):
    uuids = [f"{i:032x}" for i in range(1, n + 1)]
    locations = []
    for i, uuid in enumerate(uuids):
        pos = {"x": i * 3.0, "y": i * 0.5, "z": 1.45}
        neighbors = []
        if i > 0:
            neighbors.append(f"loc{i - 1}")
        if i < n - 1:
            neighbors.append(f"loc{i + 1}")
        locations.append({
            "id": f"loc{i}",
            "index": i + 1,
            "floor": {"id": f"floor{i % floors}"},
            "room": {"id": "room_kitchen" if i % 2 == 0 else "room_bed"},
            "neighbors": neighbors,
            "position": {"x": pos["x"], "y": pos["y"], "z": 0.0},
            "pano": {
                "id": f"loc{i}", "sweepUuid": uuid, "label": str(i + 1),
                "position": pos, "rotation": _quat_up(i * 25.0),
                "resolutions": ["2k", "high", "low"],
            },
        })
    sweeps = {"data": {"model": {"id": MODEL_ID, "locations": locations}}}

    buf = io.BytesIO()
    pre = f"{top}/" if top else ""
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(f"{pre}index.html", "<html><base href='.../showcase/26.5.4_webgl-x/'></html>")
        zf.writestr(f"{pre}api/mp/models/graph_GetShowcaseSweeps.json", json.dumps(sweeps))
        if floors > 1:
            zf.writestr(f"{pre}api/mp/models/graph_GetFloors.json", json.dumps({"data": {"model": {"floors": [
                {"id": f"floor{k}", "sequence": k, "label": f"Floor {k + 1}"} for k in range(floors)
            ]}}}))
        if with_details:
            zf.writestr(f"{pre}api/mp/models/graph_GetModelDetails.json",
                        json.dumps({"data": {"model": {"id": MODEL_ID}}}))
        if with_rooms:
            zf.writestr(f"{pre}api/mp/models/graph_GetRooms.json", json.dumps({"data": {"model": {"rooms": [
                {"id": "room_kitchen", "tags": ["kitchen", "living"]},
                {"id": "room_bed", "tags": ["bedroom"]},
            ]}}}))
        for uuid in uuids:
            for f in range(6):
                zf.writestr(
                    f"{pre}models/{HASH}/assets/pan/low/_/{uuid}_skybox{f}.jpg",
                    _tiny_face(FACE_COLORS[f]))
    buf.seek(0)
    return buf.getvalue()


def build_plain_image_zip():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("photo1.jpg", _tiny_face((10, 10, 10)))
        zf.writestr("photo2.png", _tiny_face((20, 20, 20)))
    buf.seek(0)
    return buf.getvalue()


def build_generic_skybox_zip(with_meta=True, traversal=False):
    """The simpler skyboxes/+metadata.json layout (also supported)."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("skyboxes/r1.jpg", _tiny_face((30, 30, 30)))
        zf.writestr("skyboxes/r2.jpg", _tiny_face((40, 40, 40)))
        if with_meta:
            zf.writestr("metadata.json", json.dumps({
                "name": "Plain", "startRoom": "room1",
                "rooms": [
                    {"id": "room1", "name": "Room 1", "skybox": "skyboxes/r1.jpg",
                     "camera": {"x": 0, "y": 1.6, "z": 0}, "links": [{"to": "room2", "yaw": 90, "pitch": -8}], "plan": {"x": 0.3, "y": 0.5}},
                    {"id": "room2", "name": "Room 2", "skybox": "skyboxes/r2.jpg",
                     "camera": {"x": 4, "y": 1.6, "z": 0}, "links": [], "plan": {"x": 0.7, "y": 0.5}},
                ],
            }))
        if traversal:
            zf.writestr("../evil.txt", b"pwned")
            zf.writestr("/abs_evil.txt", b"pwned")
            zf.writestr("ok/passwd.exe", b"bad")
    buf.seek(0)
    return buf.getvalue()


def test_is_matterport_dump_true_for_dump():
    names = zipfile.ZipFile(io.BytesIO(build_matterport_zip(n=2))).namelist()
    assert matterport.is_matterport_dump(names) is True


def test_is_matterport_dump_false_for_plain_images():
    names = zipfile.ZipFile(io.BytesIO(build_plain_image_zip())).namelist()
    assert matterport.is_matterport_dump(names) is False


def test_extract_model_id_from_top_folder():
    zf = zipfile.ZipFile(io.BytesIO(build_matterport_zip(n=2, top=MODEL_ID)))
    assert matterport.extract_model_id(zf, zf.namelist()) == MODEL_ID


def test_extract_model_id_from_details_when_no_top_folder():
    zf = zipfile.ZipFile(io.BytesIO(build_matterport_zip(n=2, top="")))
    assert matterport.extract_model_id(zf, zf.namelist()) == MODEL_ID


def test_extract_model_id_none_for_plain():
    zf = zipfile.ZipFile(io.BytesIO(build_plain_image_zip()))
    assert matterport.extract_model_id(zf, zf.namelist()) is None


def test_cube_to_equirect(tmp_path):
    from PIL import Image
    zf = zipfile.ZipFile(io.BytesIO(build_matterport_zip(n=2)))
    meta = matterport.convert(zf, tmp_path)
    sky = sorted((tmp_path / "skyboxes").glob("*.jpg"))
    assert len(sky) == 2, "one equirect panorama per sweep"
    for p in sky:
        w, h = Image.open(p).size
        assert w == 2 * h, f"{p.name} must be equirectangular (w == 2*h), got {w}x{h}"


def test_metadata_correctness(tmp_path):
    zf = zipfile.ZipFile(io.BytesIO(build_matterport_zip(n=3)))
    meta = matterport.convert(zf, tmp_path)

    rooms = meta["rooms"]
    ids = [r["id"] for r in rooms]
    assert len(ids) == len(set(ids)), "room ids unique"
    assert meta["startRoom"] in set(ids), "startRoom points at a real room"

    valid = set(ids)
    for r in rooms:
        for link in r["links"]:
            assert link["to"] in valid
            assert -180.0 <= link["yaw"] <= 180.0, "sane yaw"
            assert math.isfinite(link["yaw"])
        assert 0.0 <= r["plan"]["x"] <= 1.0 and 0.0 <= r["plan"]["y"] <= 1.0
        assert "heading" in r and math.isfinite(r["heading"])

    assert any("Kitchen" in r["name"] or "Bedroom" in r["name"] for r in rooms)
    assert sum(len(r["links"]) for r in rooms) >= 2


@pytest.fixture()
def media_tmp(monkeypatch, tmp_path):
    """Point the 3D-tour storage at a throwaway dir so tests don't touch real media."""
    monkeypatch.setattr(tours_router, "MEDIA_DIR", str(tmp_path))
    return tmp_path


def _upload(client, headers, pid, data, filename="tour.zip"):
    return client.post(f"/tours/{pid}/3d", headers=headers,
                       files={"file": (filename, data, "application/zip")})


def test_upload_generic_ok(client, seller, listing, media_tmp):
    pid = listing["id"]
    r = _upload(client, seller["headers"], pid, build_generic_skybox_zip())
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["base"] == f"/media-files/tours3d/{pid}/"
    assert body["viewer_url"] == f"/tour3d.html?base=/media-files/tours3d/{pid}/"
    assert (media_tmp / "tours3d" / str(pid) / "metadata.json").exists()


def test_upload_buyer_forbidden(client, buyer, seller, listing, media_tmp):
    pid = listing["id"]
    r = _upload(client, buyer["headers"], pid, build_generic_skybox_zip())
    assert r.status_code == 403


def test_upload_blocks_path_traversal(client, seller, listing, media_tmp):
    pid = listing["id"]
    r = _upload(client, seller["headers"], pid, build_generic_skybox_zip(traversal=True))
    assert r.status_code == 200, r.text
    base = media_tmp / "tours3d" / str(pid)
    assert not (media_tmp / "evil.txt").exists()
    assert not (base.parent / "evil.txt").exists()
    assert not (base / "ok" / "passwd.exe").exists()
    assert (base / "skyboxes" / "r1.jpg").exists()


def test_upload_oversize_rejected(client, seller, listing, media_tmp, monkeypatch):
    monkeypatch.setattr(tours_router, "_MAX_ZIP_MB", 0)
    r = _upload(client, seller["headers"], pid := listing["id"], build_generic_skybox_zip())
    assert r.status_code == 400
    assert "exceeds" in r.json()["detail"].lower()


def test_upload_matterport_returns_model_id(client, seller, listing, media_tmp):
    pid = listing["id"]
    r = _upload(client, seller["headers"], pid, build_matterport_zip(n=3))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True and body["source"] == "matterport"
    assert body["matterport_id"] == MODEL_ID
    base = media_tmp / "tours3d" / str(pid)
    assert (base / "metadata.json").exists()
    assert list((base / "skyboxes").glob("*.jpg")), "equirect panoramas written"


def test_3d_upload_preserves_existing_360_tour(client, seller, buyer, listing, media_tmp):
    pid = listing["id"]
    tour360 = {
        "first_room_id": "a",
        "rooms": [
            {"id": "a", "name": "Living", "media_url": "http://x/a.jpg",
             "links": [{"to_room_id": "b", "yaw": 90, "pitch": 0}]},
            {"id": "b", "name": "Kitchen", "media_url": "http://x/b.jpg", "links": []},
        ],
    }
    assert client.put(f"/tours/{pid}", headers=seller["headers"], json=tour360).status_code == 200

    r = _upload(client, seller["headers"], pid, build_matterport_zip(n=2))
    assert r.status_code == 200, r.text

    g = client.get(f"/tours/{pid}/3d")
    assert g.status_code == 200, g.text
    assert g.json()["base"] == f"/media-files/tours3d/{pid}/"
    assert g.json()["matterport_id"] == MODEL_ID

    t = client.get(f"/tours/{pid}", headers=buyer["headers"])
    assert t.status_code == 200
    room_ids = {room["id"] for room in t.json()["rooms"]}
    assert {"a", "b"} <= room_ids, "existing 360 rooms must not be clobbered"


def test_get_3d_404_when_absent(client, buyer, listing, media_tmp):
    r = client.get(f"/tours/{listing['id']}/3d")
    assert r.status_code == 404


def test_delete_3d_tour(client, seller, buyer, listing, media_tmp):
    pid = listing["id"]
    assert _upload(client, seller["headers"], pid, build_matterport_zip(n=2)).status_code == 200
    base = media_tmp / "tours3d" / str(pid)
    assert base.exists()

    assert client.delete(f"/tours/{pid}/3d", headers=buyer["headers"]).status_code == 403

    d = client.delete(f"/tours/{pid}/3d", headers=seller["headers"])
    assert d.status_code == 200
    assert not base.exists()
    assert client.get(f"/tours/{pid}/3d").status_code == 404


def test_rename_3d_rooms(client, seller, buyer, listing, media_tmp):
    pid = listing["id"]
    assert _upload(client, seller["headers"], pid, build_matterport_zip(n=3)).status_code == 200

    g = client.get(f"/tours/{pid}/3d/rooms")
    assert g.status_code == 200, g.text
    rooms = g.json()["rooms"]
    assert len(rooms) == 3 and all(r["id"] for r in rooms)

    rid = rooms[0]["id"]
    assert client.patch(f"/tours/{pid}/3d/rooms", headers=buyer["headers"],
                        json={"names": {rid: "Hack"}}).status_code == 403

    r = client.patch(f"/tours/{pid}/3d/rooms", headers=seller["headers"],
                     json={"names": {rid: "Living Room"}})
    assert r.status_code == 200, r.text
    assert r.json()["updated"] == 1

    g2 = client.get(f"/tours/{pid}/3d/rooms")
    name_by_id = {x["id"]: x["name"] for x in g2.json()["rooms"]}
    assert name_by_id[rid] == "Living Room"

    import json as _json
    meta = _json.loads((media_tmp / "tours3d" / str(pid) / "metadata.json").read_text())
    assert any(rm["id"] == rid and rm["name"] == "Living Room" for rm in meta["rooms"])


def test_rename_3d_rooms_404_without_tour(client, seller, listing, media_tmp):
    r = client.patch(f"/tours/{listing['id']}/3d/rooms", headers=seller["headers"],
                     json={"names": {"x": "y"}})
    assert r.status_code == 404


def test_3d_progress_endpoint(client, seller, listing, media_tmp):
    pid = listing["id"]
    r0 = client.get(f"/tours/{pid}/3d/progress")
    assert r0.status_code == 200 and r0.json()["pct"] == 0
    assert _upload(client, seller["headers"], pid, build_matterport_zip(n=2)).status_code == 200
    r1 = client.get(f"/tours/{pid}/3d/progress")
    assert r1.status_code == 200
    assert r1.json()["stage"] == "done" and r1.json()["pct"] == 100


def test_floors_metadata(tmp_path):
    zf = zipfile.ZipFile(io.BytesIO(build_matterport_zip(n=4, floors=2)))
    meta = matterport.convert(zf, tmp_path)
    floors = meta.get("floors")
    assert floors and len(floors) == 2
    assert {f["index"] for f in floors} == {0, 1}
    seen = set()
    for r in meta["rooms"]:
        assert r.get("floor") in (0, 1)
        seen.add(r["floor"])
    assert seen == {0, 1}, "both floors represented"


def test_single_floor_default(tmp_path):
    zf = zipfile.ZipFile(io.BytesIO(build_matterport_zip(n=3)))
    meta = matterport.convert(zf, tmp_path)
    assert len(meta.get("floors", [])) == 1
    assert all(r.get("floor") == 0 for r in meta["rooms"])


def _varint(n):
    out = bytearray()
    while True:
        b = n & 0x7F
        n >>= 7
        if n:
            out.append(b | 0x80)
        else:
            out.append(b)
            return bytes(out)


def _dam_chunk(verts, tris):
    import struct as _s
    pos = b"".join(_s.pack("<fff", *v) for v in verts)
    uvs = b"".join(_s.pack("<ff", 0.0, 0.0) for _ in verts)
    idx = b"".join(_varint(i) for t in tris for i in t)
    return {"positions": pos, "uvs": uvs, "indices": idx, "texture": "", "name": ""}


def test_build_glb_clips_outlier_spikes():
    from modules.tours.dam import build_glb
    import struct as _s, json as _json
    verts = [(0, 0, 0), (1, 0, 0), (0, 0, 1), (1, 0, 1), (1000.0, 1000.0, 1000.0)]
    tris = [(0, 1, 2), (1, 3, 2), (0, 4, 1)]
    glb = build_glb([_dam_chunk(verts, tris)], None, axis_map=(0, 2, 1), sweeps=[(0, 0, 0)])
    off, L = 12, _s.unpack_from("<I", glb, 8)[0]
    gltf = None
    while off < L:
        clen, ct = _s.unpack_from("<II", glb, off); off += 8
        if ct == 0x4E4F534A:
            gltf = _json.loads(glb[off:off + clen])
        off += clen
    posacc = next(a for a in gltf["accessors"] if a.get("type") == "VEC3" and "min" in a)
    assert max(abs(x) for x in posacc["min"] + posacc["max"]) < 50, "outlier spike not clipped"


def test_build_glb_rejects_mostly_garbage():
    from modules.tours.dam import build_glb
    import pytest as _pytest
    verts = [(500.0 + i, 500.0, 500.0) for i in range(6)]
    tris = [(0, 1, 2), (3, 4, 5)]
    with _pytest.raises(Exception):
        build_glb([_dam_chunk(verts, tris)], None, axis_map=(0, 2, 1), sweeps=[(0, 0, 0)])

