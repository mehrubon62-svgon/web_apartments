"""Viewer (tour3d.html) structural checks — Section 9 items 9-13.

A full WebGL render needs a real browser (see the manual checklist in the PR
notes). What we CAN verify automatically, without a browser, is that the served
viewer document is well-formed and contains the required building blocks:
the persistent Nestora watermark (and that it is not display:none), the WebGL /
Three.js engine, the three viewing modes, the room selector, the measure +
fullscreen tools, per-sweep heading usage (the anti-spin fix) and the crossfade.
"""
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
SERVED = ROOT / "frontend" / "tour3d.html"     # what FastAPI actually serves
SOURCE = ROOT / "web" / "public" / "tour3d.html"  # vite source of truth


@pytest.fixture(scope="module")
def html():
    assert SERVED.exists(), "frontend/tour3d.html must be served"
    return SERVED.read_text(encoding="utf-8")


def test_served_and_source_match():
    assert SOURCE.exists(), "web/public/tour3d.html (source) must exist"
    assert SERVED.read_text(encoding="utf-8") == SOURCE.read_text(encoding="utf-8"), \
        "served copy must match the source viewer"


def test_uses_webgl_threejs(html):
    assert "three.module.js" in html and 'import * as THREE' in html
    assert "WebGLRenderer" in html


def test_watermark_present_and_visible(html):
    assert 'id="nestora-watermark"' in html, "watermark element must exist"
    assert "Nestora" in html
    # the watermark must not be hidden in CSS
    css = re.search(r"#nestora-watermark\s*\{([^}]*)\}", html)
    assert css, "watermark must be styled"
    body = css.group(1)
    assert "display: none" not in body and "display:none" not in body
    assert "pointer-events: none" in body, "must not block interaction"
    # and it is force-kept visible / re-added if removed (not a casual toggle)
    assert "ensureWatermark" in html and "MutationObserver" in html


def test_three_modes_present(html):
    for mode in ("pano", "doll", "plan"):
        assert f'data-mode="{mode}"' in html
    assert "Dollhouse" in html and "Floor plan" in html and "Panorama" in html


def test_navigation_and_features(html):
    assert "carTrack" in html and "car-card" in html   # point carousel selector
    assert "floorDrop" in html and "setFloor" in html   # floor selector
    assert "GLTFLoader" in html                       # dollhouse mesh loader
    assert "buildHotspots" in html                    # nav arrows from neighbors


def test_heading_consistency_and_crossfade(html):
    # per-sweep heading is applied to the sphere (the anti-"world spins" fix)
    assert "applyHeading" in html and "room.heading" in html
    # smooth crossfade transition between sweeps
    assert "crossfade" in html.lower() or "sphereFront" in html
    # deep-link to a specific sweep/room
    assert "room" in html and "searchParams" in html or "URLSearchParams" in html


def test_reads_base_and_metadata(html):
    assert "base" in html and "metadata.json" in html
    assert "?base=" in html or "get('base')" in html
