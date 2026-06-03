"""Decode a Matterport `.dam` mesh into a self-contained binary glTF (.glb).

Matterport's `models/<hash>/assets/<id>_50k.dam` is an undocumented protobuf:

    message Dam {            // top level
        repeated Chunk chunks = 1;
    }
    message Chunk {
        VertexBuf vertices = 1;   // { bytes positions = 1 (vec3 f32),
                                  //   bytes uvs       = 2 (vec2 f32) }
        IndexBuf  indices  = 2;   // { bytes tris = 1 (packed varint u32) }
        string    name     = 3;   // e.g. "g chunk000_group000_sub002"
        string    texture  = 4;   // e.g. "<id>_50k_000.jpg"
    }

Positions/UVs are plain little-endian float arrays. Triangle indices are a
stream of base-128 varints (already absolute vertex indices, not delta-coded).
Every chunk references a full-resolution JPG that lives under
`assets/_/<id>_50k_texture_jpg_high/<texture>`.

We merge all chunks that share a texture into one glTF primitive and write a
single .glb with an embedded image. The result loads in three.js GLTFLoader,
giving a real, textured dollhouse instead of a synthesized one.
"""
from __future__ import annotations

import io
import json
import struct
import zipfile
from pathlib import Path


def _read_varint(b: bytes, i: int) -> tuple[int, int]:
    shift = 0
    result = 0
    while True:
        x = b[i]
        i += 1
        result |= (x & 0x7F) << shift
        if not (x & 0x80):
            break
        shift += 7
    return result, i


def _iter_fields(buf: bytes, start: int, end: int):
    """Yield (field_number, wire_type, value_or_(off,len)) over a protobuf range."""
    i = start
    while i < end:
        tag, i = _read_varint(buf, i)
        field = tag >> 3
        wt = tag & 7
        if wt == 2:                       # length-delimited
            ln, i = _read_varint(buf, i)
            yield field, wt, (i, ln)
            i += ln
        elif wt == 0:                     # varint
            val, i = _read_varint(buf, i)
            yield field, wt, val
        elif wt == 5:                     # 32-bit
            yield field, wt, struct.unpack_from("<f", buf, i)[0]
            i += 4
        elif wt == 1:                     # 64-bit
            yield field, wt, struct.unpack_from("<d", buf, i)[0]
            i += 8
        else:
            raise ValueError(f"bad wire type {wt} at {i}")


def parse_dam(data: bytes) -> list[dict]:
    """Return a list of chunk dicts: {positions, uvs, indices, texture, name}."""
    chunks = []
    for f, wt, v in _iter_fields(data, 0, len(data)):
        if f != 1 or wt != 2:
            continue
        cstart, clen = v
        cend = cstart + clen
        positions = uvs = indices = None
        name = texture = ""
        for cf, cwt, cv in _iter_fields(data, cstart, cend):
            if cf == 1 and cwt == 2:                  # vertex sub-buffer
                vs, vl = cv
                for vf, vwt, vv in _iter_fields(data, vs, vs + vl):
                    if vf == 1 and vwt == 2:
                        po, pl = vv
                        positions = data[po:po + pl]
                    elif vf == 2 and vwt == 2:
                        uo, ul = vv
                        uvs = data[uo:uo + ul]
            elif cf == 2 and cwt == 2:                # index sub-buffer
                is_, il = cv
                # one nested length-delimited field holds the varint stream
                for jf, jwt, jv in _iter_fields(data, is_, is_ + il):
                    if jf == 1 and jwt == 2:
                        io_, ilen = jv
                        indices = data[io_:io_ + ilen]
                        break
            elif cf == 3 and cwt == 2:
                no, nl = cv
                name = data[no:no + nl].decode("latin1")
            elif cf == 4 and cwt == 2:
                to, tl = cv
                texture = data[to:to + tl].decode("latin1")
        if positions and indices:
            chunks.append({
                "positions": positions, "uvs": uvs or b"",
                "indices": indices, "texture": texture, "name": name,
            })
    return chunks


def _decode_indices(stream: bytes) -> list[int]:
    out = []
    i = 0
    n = len(stream)
    while i < n:
        v, i = _read_varint(stream, i)
        out.append(v)
    return out


def _pad4(b: bytearray) -> None:
    while len(b) % 4:
        b.append(0)


def build_glb(chunks: list[dict], texture_jpg: bytes | None, axis_map=(0, 2, 1), sweeps=None) -> bytes:
    """Assemble decoded chunks + one shared JPG texture into a .glb byte string.

    `axis_map` = (floor_a, up, floor_b) indices into the world (x,y,z) position,
    so the mesh is mapped to a Y-up viewer frame as (p[a], p[up], -p[b]). It MUST
    match the camera-position transform used by the tour metadata, otherwise the
    dollhouse room markers won't line up with the mesh.

    `sweeps` = list of (x,y,z) sweep-camera positions in the SAME viewer frame.
    They are used to orient every triangle so its front-facing normal points
    toward the room interior (the nearest sweep). Rendered single-sided, this
    produces the classic Matterport "dollhouse" cutaway: looking in from above
    the near walls/ceiling are culled and you see straight into the rooms.
    """
    import numpy as np

    fa, up, fb = axis_map
    all_pos = []
    all_uv = []
    all_idx = []
    voff = 0
    for c in chunks:
        pos = np.frombuffer(c["positions"], dtype="<f4").reshape(-1, 3)
        nv = len(pos)
        uv = (np.frombuffer(c["uvs"], dtype="<f4").reshape(-1, 2)
              if c["uvs"] else np.zeros((nv, 2), dtype="<f4"))
        idx = np.array(_decode_indices(c["indices"]), dtype=np.uint32)
        idx = idx[: (len(idx) // 3) * 3]
        # keep only valid triangles
        idx = idx[idx < nv] if idx.size and idx.max() >= nv else idx
        all_pos.append(pos)
        all_uv.append(uv)
        all_idx.append(idx + voff)
        voff += nv

    pos = np.concatenate(all_pos).astype(np.float32)
    uv = np.concatenate(all_uv).astype(np.float32)
    idx = np.concatenate(all_idx).astype(np.uint32)

    # world -> Y-up viewer space:  (p[a], p[up], -p[b])
    pos_y = np.empty_like(pos)
    pos_y[:, 0] = pos[:, fa]
    pos_y[:, 1] = pos[:, up]
    pos_y[:, 2] = -pos[:, fb]
    pos = pos_y
    # glTF expects UV origin at top-left; flip V
    uv = uv.copy()
    uv[:, 1] = 1.0 - uv[:, 1]

    # ---- orient triangles so normals face the room interior --------------
    tris = idx.reshape(-1, 3).astype(np.int64)
    v0 = pos[tris[:, 0]]; v1 = pos[tris[:, 1]]; v2 = pos[tris[:, 2]]
    centroid = (v0 + v1 + v2) / 3.0
    fnormal = np.cross(v1 - v0, v2 - v0)            # CCW front-face normal

    if sweeps:
        sw = np.asarray(sweeps, dtype=np.float32)   # (S,3) viewer-frame
        # nearest sweep per triangle (vectorised; T*S is small)
        d2 = ((centroid[:, None, :] - sw[None, :, :]) ** 2).sum(axis=2)
        nearest = sw[np.argmin(d2, axis=1)]         # (T,3)
        to_interior = nearest - centroid
    else:
        # fallback: point toward the overall mesh centre
        to_interior = pos.mean(axis=0) - centroid

    flip = (fnormal * to_interior).sum(axis=1) < 0  # normal faces outward -> flip
    tris[flip] = tris[flip][:, [0, 2, 1]]
    fnormal[flip] *= -1.0
    idx = tris.reshape(-1).astype(np.uint32)

    # smooth vertex normals (accumulate oriented face normals)
    nlen = np.linalg.norm(fnormal, axis=1, keepdims=True)
    fn_unit = np.divide(fnormal, nlen, out=np.zeros_like(fnormal), where=nlen > 1e-12)
    normals = np.zeros_like(pos)
    for k in range(3):
        np.add.at(normals, tris[:, k], fn_unit)
    nl = np.linalg.norm(normals, axis=1, keepdims=True)
    normals = np.divide(normals, nl, out=np.zeros_like(normals), where=nl > 1e-12).astype(np.float32)

    pmin = pos.min(axis=0).tolist()
    pmax = pos.max(axis=0).tolist()

    # ---- binary buffer: positions | normals | uvs | indices | image ----
    bin_blob = bytearray()
    pos_bytes = pos.tobytes(); pos_off = len(bin_blob); bin_blob += pos_bytes; _pad4(bin_blob)
    nrm_bytes = normals.tobytes(); nrm_off = len(bin_blob); bin_blob += nrm_bytes; _pad4(bin_blob)
    uv_bytes = uv.tobytes(); uv_off = len(bin_blob); bin_blob += uv_bytes; _pad4(bin_blob)
    idx_bytes = idx.tobytes(); idx_off = len(bin_blob); bin_blob += idx_bytes; _pad4(bin_blob)
    img_off = img_len = None
    if texture_jpg:
        img_off = len(bin_blob); bin_blob += texture_jpg; img_len = len(texture_jpg); _pad4(bin_blob)

    buffer_views = [
        {"buffer": 0, "byteOffset": pos_off, "byteLength": len(pos_bytes), "target": 34962},
        {"buffer": 0, "byteOffset": nrm_off, "byteLength": len(nrm_bytes), "target": 34962},
        {"buffer": 0, "byteOffset": uv_off, "byteLength": len(uv_bytes), "target": 34962},
        {"buffer": 0, "byteOffset": idx_off, "byteLength": len(idx_bytes), "target": 34963},
    ]
    accessors = [
        {"bufferView": 0, "componentType": 5126, "count": len(pos), "type": "VEC3", "min": pmin, "max": pmax},
        {"bufferView": 1, "componentType": 5126, "count": len(normals), "type": "VEC3"},
        {"bufferView": 2, "componentType": 5126, "count": len(uv), "type": "VEC2"},
        {"bufferView": 3, "componentType": 5125, "count": len(idx), "type": "SCALAR"},
    ]

    gltf = {
        "asset": {"version": "2.0", "generator": "nestora-dam"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0}],
        "meshes": [{
            "primitives": [{
                "attributes": {"POSITION": 0, "NORMAL": 1, "TEXCOORD_0": 2},
                "indices": 3,
                "material": 0,
            }]
        }],
        "buffers": [{"byteLength": len(bin_blob)}],
        "bufferViews": buffer_views,
        "accessors": accessors,
    }

    if texture_jpg:
        buffer_views.append({"buffer": 0, "byteOffset": img_off, "byteLength": img_len})
        gltf["images"] = [{"bufferView": len(buffer_views) - 1, "mimeType": "image/jpeg"}]
        gltf["samplers"] = [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}]
        gltf["textures"] = [{"sampler": 0, "source": 0}]
        gltf["materials"] = [{
            "pbrMetallicRoughness": {
                "baseColorTexture": {"index": 0},
                "metallicFactor": 0.0, "roughnessFactor": 1.0,
            },
            # single-sided -> back-face culling gives the dollhouse cutaway
            "doubleSided": False,
            "name": "matterport",
        }]
    else:
        gltf["materials"] = [{
            "pbrMetallicRoughness": {"baseColorFactor": [0.8, 0.8, 0.82, 1.0], "metallicFactor": 0.0, "roughnessFactor": 0.9},
            "doubleSided": False,
        }]

    json_bytes = bytearray(json.dumps(gltf, separators=(",", ":")).encode("utf-8"))
    while len(json_bytes) % 4:
        json_bytes.append(0x20)
    _pad4(bin_blob)

    glb = bytearray()
    glb += struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(json_bytes) + 8 + len(bin_blob))
    glb += struct.pack("<II", len(json_bytes), 0x4E4F534A) + json_bytes      # JSON chunk
    glb += struct.pack("<II", len(bin_blob), 0x004E4942) + bin_blob          # BIN chunk
    return bytes(glb)


def _find_texture(zf: zipfile.ZipFile, names: list[str], tex_name: str) -> bytes | None:
    """Locate the full-resolution texture JPG for a chunk inside the ZIP."""
    base = tex_name.rsplit("/", 1)[-1]
    # prefer the untiled high-res file: .../_texture_jpg_high/<base>
    for n in names:
        fn = n.rsplit("/", 1)[-1]
        if fn == base and "_texture_jpg_high/" in n:
            return zf.read(n)
    for n in names:
        fn = n.rsplit("/", 1)[-1]
        if fn == base and "_texture_jpg_low/" in n:
            return zf.read(n)
    return None


def convert_dam_to_glb(zf: zipfile.ZipFile, names: list[str], dest: Path, axis_map=(0, 2, 1), sweeps=None) -> str | None:
    """If the archive has a `.dam` mesh, decode it to dest/mesh/model.glb and
    return the relative path (e.g. "mesh/model.glb"). Returns None if no mesh
    or on failure (caller falls back to the procedural dollhouse).

    `axis_map` MUST be the same (floor_a, up, floor_b) the tour converter used
    for camera positions, so markers align with the mesh. `sweeps` are the
    sweep-camera positions in viewer space, used to orient the cutaway.
    """
    dam_name = next((n for n in names if n.endswith(".dam")), None)
    if not dam_name:
        return None
    try:
        data = zf.read(dam_name)
        chunks = parse_dam(data)
        if not chunks:
            return None
        tex = _find_texture(zf, names, chunks[0]["texture"]) if chunks[0].get("texture") else None
        glb = build_glb(chunks, tex, axis_map=axis_map, sweeps=sweeps)
        out_dir = dest / "mesh"
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "model.glb").write_bytes(glb)
        return "mesh/model.glb"
    except Exception:
        return None
