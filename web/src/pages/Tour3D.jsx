import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';
import { Icon } from '../lib/icons.jsx';

/* ============================================================
   Native 3D / 360° tour viewer (Three.js, bundled) — Matterport-style.

   • Panorama  — look around; click anywhere to WALK there. The camera glides
     forward to the sweep nearest the clicked spot (with a motion-blur "step"),
     keeping your viewing direction. All panoramas are rotated into one shared
     world frame using each sweep's captured `heading`, so moving never flips
     the view.
   • Dollhouse — the real textured mesh (decoded from Matterport's .dam).
   • Plan      — the same mesh straight from above.
   • Entering the tour flies the camera from the dollhouse into the first room.
   ============================================================ */
export function Tour3DPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { lang } = useI18n();
  const L = (ru, en) => (lang === 'ru' ? ru : en);

  const mountRef = useRef(null);
  const apiRef = useRef(null);
  const [status, setStatus] = useState('loading');
  const [errMsg, setErrMsg] = useState('');
  const [meta, setMeta] = useState(null);
  const [mode, setMode] = useState('pano');
  const [curRoom, setCurRoom] = useState(null);
  const [measure, setMeasure] = useState(false);
  const [measureText, setMeasureText] = useState('');

  const [base, setBase] = useState(null);
  useEffect(() => {
    let alive = true;
    api.get3dTour(id)
      .then((d) => { if (alive) setBase(d.base.endsWith('/') ? d.base : d.base + '/'); })
      .catch(() => { if (alive) { setStatus('error'); setErrMsg(L('3D-тур не найден', '3D tour not found')); } });
    return () => { alive = false; };
  }, [id]);

  useEffect(() => {
    if (!base || !mountRef.current) return;
    const mount = mountRef.current;
    let disposed = false;
    let raf = null;
    const cleanup = [];

    (async () => {
      let META;
      try {
        const res = await fetch(base + 'metadata.json', { cache: 'no-cache' });
        if (!res.ok) throw new Error('metadata ' + res.status);
        META = await res.json();
      } catch (e) {
        if (!disposed) { setStatus('error'); setErrMsg(L('Не удалось прочитать данные тура', 'Could not read tour data') + ': ' + e.message); }
        return;
      }
      if (disposed) return;
      setMeta(META);

      const ROOMS = META.rooms || [];
      const ROOM_BY_ID = Object.fromEntries(ROOMS.map((r) => [r.id, r]));
      const SCALE = META.scale || 1;
      const HEAD_OFFSET = THREE.MathUtils.degToRad(META.headingOffset || 0);
      const camVec = (r) => new THREE.Vector3((r.camera?.x || 0) * SCALE, (r.camera?.y || 1.45) * SCALE, (r.camera?.z || 0) * SCALE);
      const roomRot = (r) => THREE.MathUtils.degToRad(r?.heading || 0) + HEAD_OFFSET;

      const W = () => mount.clientWidth || window.innerWidth;
      const H = () => mount.clientHeight || window.innerHeight;

      let renderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
      } catch (e) {
        setStatus('error'); setErrMsg(L('WebGL недоступен в этом браузере', 'WebGL is not available')); return;
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(W(), H());
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.domElement.style.display = 'block';
      renderer.domElement.style.touchAction = 'none';
      mount.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const BASE_FOV = 72;
      const panoCam = new THREE.PerspectiveCamera(BASE_FOV, W() / H(), 0.1, 1100);
      const dollCam = new THREE.PerspectiveCamera(50, W() / H(), 0.05, 2000);
      let activeCam = panoCam;
      let MODE = 'pano';        // pano | doll | plan | intro (camera fly-in)
      let MEASURE = false;

      // ---- panorama spheres (two, for the walk cross-fade) ----------------
      const texLoader = new THREE.TextureLoader();
      texLoader.setCrossOrigin('anonymous');
      const maxAniso = renderer.capabilities.getMaxAnisotropy?.() || 1;
      function makeSphere(opts = {}) {
        const g = new THREE.SphereGeometry(500, 72, 48); g.scale(-1, 1, 1);
        const m = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, color: 0x0c0d12, ...opts });
        return new THREE.Mesh(g, m);
      }
      const sphereMain = makeSphere(); sphereMain.renderOrder = 0;
      const sphereFade = makeSphere({ transparent: true, opacity: 0, depthTest: false, depthWrite: false }); sphereFade.renderOrder = 1;
      sphereFade.visible = false;
      scene.add(sphereMain); scene.add(sphereFade);
      function tuneTex(t) { t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.anisotropy = Math.min(8, maxAniso); return t; }
      // Apply a panorama to a sphere AND align it to the shared world frame.
      function applyPano(sphere, tex, room) {
        if (sphere.material.map && sphere.material.map !== tex) sphere.material.map.dispose();
        sphere.material.map = tex; sphere.material.color.set(0xffffff); sphere.material.needsUpdate = true;
        sphere.position.copy(camVec(room));
        sphere.rotation.y = roomRot(room);
      }

      // ---- look controller (direction only; never changed by moving) ------
      const pv = { lon: 0, lat: 0, tLon: 0, tLat: 0, vLon: 0, vLat: 0 };
      let dragging = false, prev = { x: 0, y: 0 }, pinch = 0, moved = false, downPos = { x: 0, y: 0 };
      function aim() {
        const phi = THREE.MathUtils.degToRad(90 - pv.lat), th = THREE.MathUtils.degToRad(pv.lon);
        const c = panoCam.position;
        panoCam.lookAt(c.x + Math.sin(phi) * Math.cos(th), c.y + Math.cos(phi), c.z + Math.sin(phi) * Math.sin(th));
      }
      const SENS = 0.10;
      const down = (e) => {
        if (MODE !== 'pano' || MEASURE) return;
        dragging = true; moved = false; pv.vLon = pv.vLat = 0;
        const p = e.touches ? e.touches[0] : e; prev = { x: p.clientX, y: p.clientY }; downPos = { x: p.clientX, y: p.clientY };
        if (e.touches && e.touches.length === 2) pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        el.style.cursor = 'grabbing';
      };
      const move = (e) => {
        if (!dragging || MODE !== 'pano') return;
        if (e.touches && e.touches.length === 2) {
          const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
          if (pinch) { panoCam.fov = THREE.MathUtils.clamp(panoCam.fov - (d - pinch) * 0.1, 35, 90); panoCam.updateProjectionMatrix(); }
          pinch = d; return;
        }
        const p = e.touches ? e.touches[0] : e;
        const dx = p.clientX - prev.x, dy = p.clientY - prev.y;
        if (Math.abs(p.clientX - downPos.x) + Math.abs(p.clientY - downPos.y) > 4) moved = true;
        const k = panoCam.fov / BASE_FOV;
        pv.tLon -= dx * SENS * k; pv.vLon = -dx * SENS * k;
        pv.tLat = THREE.MathUtils.clamp(pv.tLat + dy * SENS * k, -85, 85); pv.vLat = dy * SENS * k;
        prev = { x: p.clientX, y: p.clientY };
      };
      const up = () => { dragging = false; pinch = 0; el.style.cursor = 'grab'; };
      const wheel = (e) => { if (MODE !== 'pano') return; panoCam.fov = THREE.MathUtils.clamp(panoCam.fov + e.deltaY * 0.04, 35, 90); panoCam.updateProjectionMatrix(); };
      const el = renderer.domElement; el.style.cursor = 'grab';
      el.addEventListener('mousedown', down); el.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
      el.addEventListener('touchstart', down, { passive: true }); el.addEventListener('touchmove', move, { passive: true }); el.addEventListener('touchend', up);
      el.addEventListener('wheel', wheel, { passive: true });

      // ---- dollhouse / plan orbit ----------------------------------------
      const dollControls = new OrbitControls(dollCam, renderer.domElement);
      dollControls.enableDamping = true; dollControls.dampingFactor = 0.08;
      dollControls.maxPolarAngle = Math.PI / 2.05; dollControls.enabled = false; dollControls.minDistance = 1;

      scene.add(new THREE.AmbientLight(0xffffff, 1.05));
      const dl = new THREE.DirectionalLight(0xffffff, 0.55); dl.position.set(6, 14, 8); scene.add(dl);
      const dl2 = new THREE.DirectionalLight(0xffffff, 0.3); dl2.position.set(-8, 10, -6); scene.add(dl2);

      // ---- the real textured mesh (.glb from .dam) ------------------------
      const meshGroup = new THREE.Group(); meshGroup.visible = false; scene.add(meshGroup);
      let houseMesh = null, meshBox = null, meshReady = false;
      let dollCenter = new THREE.Vector3(), floorY = 0, meshSize = new THREE.Vector3(10, 3, 10);

      function dollPose() {
        // a pleasant overview pose (position + target) for the dollhouse
        const dist = Math.max(meshSize.x, meshSize.z) * 1.05 + meshSize.y + 3;
        return {
          pos: new THREE.Vector3(dollCenter.x + dist * 0.5, floorY + dist * 0.85, dollCenter.z + dist * 0.7),
          target: new THREE.Vector3(dollCenter.x, floorY + meshSize.y * 0.35, dollCenter.z),
        };
      }
      function frameDollhouse() { const p = dollPose(); dollCam.position.copy(p.pos); dollControls.target.copy(p.target); dollControls.update(); }
      function topView() {
        const h = Math.max(meshSize.x, meshSize.z) * 1.15 + 5;
        dollCam.position.set(dollCenter.x + 0.001, floorY + h, dollCenter.z);
        dollControls.target.set(dollCenter.x, floorY, dollCenter.z); dollControls.update();
      }

      const gltfLoader = new GLTFLoader();
      if (META.mesh) {
        gltfLoader.load(base + META.mesh, (gltf) => {
          if (disposed) return;
          meshGroup.add(gltf.scene);
          gltf.scene.traverse((o) => { if (o.isMesh) { houseMesh = o; o.material.side = THREE.FrontSide; o.material.metalness = 0; } });
          meshBox = new THREE.Box3().setFromObject(gltf.scene);
          dollCenter = meshBox.getCenter(new THREE.Vector3());
          floorY = meshBox.min.y; meshSize = meshBox.getSize(new THREE.Vector3());
          meshReady = true; maybeIntro();
        }, undefined, () => { meshReady = false; maybeIntro(); });
      }

      // ---- click-to-walk reticle — hugs the surface under the cursor ------
      // It sits ON whatever you point at (floor, wall, sofa, counter) and tilts
      // to match that surface, like Matterport's probe. Stability comes from
      // using SMOOTH interpolated vertex normals (continuous across the scan,
      // unlike jittery per-triangle normals) plus heavy easing in the loop.
      const reticle = new THREE.Group(); reticle.visible = false; reticle.renderOrder = 6;
      const reticleRing = new THREE.Mesh(
        new THREE.RingGeometry(0.18, 0.30, 48),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthTest: false })
      );
      const reticleDot = new THREE.Mesh(
        new THREE.CircleGeometry(0.055, 24),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthTest: false })
      );
      reticle.add(reticleRing); reticle.add(reticleDot); scene.add(reticle);
      const retTargetPos = new THREE.Vector3();
      const retTargetQuat = new THREE.Quaternion();
      const _zAxis = new THREE.Vector3(0, 0, 1);
      let retActive = false;

      // Floor height per room, found once by casting straight down from the
      // sweep onto the mesh (≈ camera height below the sweep). Cached.
      const floorYCache = {};
      function floorYForRoom(room) {
        if (!room) return 0;
        if (room.id in floorYCache) return floorYCache[room.id];
        let y = camVec(room).y - 1.45 * SCALE;     // sensible default (tripod height)
        if (houseMesh) {
          const c = camVec(room);
          ray.set(new THREE.Vector3(c.x, c.y, c.z), new THREE.Vector3(0, -1, 0));
          const hits = ray.intersectObject(houseMesh, true);
          if (hits.length) y = hits[hits.length - 1].point.y;   // lowest = the actual floor
        }
        floorYCache[room.id] = y;
        return y;
      }

      // ---- measuring ------------------------------------------------------
      const measureGroup = new THREE.Group(); scene.add(measureGroup);
      const ray = new THREE.Raycaster(); const ptr = new THREE.Vector2(); let mpts = [];
      const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      function clearMeasure() { [...measureGroup.children].forEach((c) => measureGroup.remove(c)); mpts = []; setMeasureText(''); }
      function addPoint(p) {
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
        dot.position.copy(p); dot.renderOrder = 7; measureGroup.add(dot); mpts.push(p.clone());
        if (mpts.length === 2) {
          const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(mpts), new THREE.LineBasicMaterial({ color: 0xc2502e, depthTest: false }));
          line.renderOrder = 7; measureGroup.add(line);
          setMeasureText((lang === 'ru' ? 'Расстояние: ' : 'Distance: ') + (mpts[0].distanceTo(mpts[1]) / SCALE).toFixed(2) + ' ' + (lang === 'ru' ? 'м' : 'm'));
          mpts = [];
        }
      }

      function setPtr(e) { const r = el.getBoundingClientRect(); ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1; ptr.y = -((e.clientY - r.top) / r.height) * 2 + 1; }

      // Smooth surface normal at a hit: interpolate the mesh's baked vertex
      // normals across the triangle (barycentric). This is continuous over the
      // surface, so the probe glides instead of snapping between facets.
      const _vA = new THREE.Vector3(), _vB = new THREE.Vector3(), _vC = new THREE.Vector3();
      const _nA = new THREE.Vector3(), _nB = new THREE.Vector3(), _nC = new THREE.Vector3();
      const _bc = new THREE.Vector3(), _lp = new THREE.Vector3();
      function smoothNormal(h) {
        const obj = h.object, g = obj && obj.geometry;
        let n = h.face ? h.face.normal.clone() : new THREE.Vector3(0, 1, 0);
        if (h.face && g && g.attributes.normal && g.attributes.position) {
          const pos = g.attributes.position, nor = g.attributes.normal;
          _vA.fromBufferAttribute(pos, h.face.a); _vB.fromBufferAttribute(pos, h.face.b); _vC.fromBufferAttribute(pos, h.face.c);
          _nA.fromBufferAttribute(nor, h.face.a); _nB.fromBufferAttribute(nor, h.face.b); _nC.fromBufferAttribute(nor, h.face.c);
          _lp.copy(h.point); obj.worldToLocal(_lp);
          const bc = THREE.Triangle.getBarycoord(_lp, _vA, _vB, _vC, _bc);
          if (bc) { const m = new THREE.Vector3().addScaledVector(_nA, _bc.x).addScaledVector(_nB, _bc.y).addScaledVector(_nC, _bc.z); if (m.lengthSq() > 1e-8) n.copy(m); }
        }
        if (obj) n.transformDirection(obj.matrixWorld);
        return n.normalize();
      }

      // Probe the surface under the pointer. Returns {point, normal}. If nothing
      // is hit (or no mesh), falls back to the room's floor plane (flat).
      function probe() {
        if (houseMesh) {
          const h = ray.intersectObject(houseMesh, true)[0];
          if (h) return { point: h.point.clone(), normal: smoothNormal(h) };
        }
        const fy = MODE === 'pano' ? floorYForRoom(ROOM_BY_ID[currentId]) : floorY;
        floorPlane.constant = -fy;
        const hit = new THREE.Vector3();
        if (!ray.ray.intersectPlane(floorPlane, hit)) return null;
        if (MODE === 'pano' && hit.distanceTo(panoCam.position) > 60) return null;
        return { point: hit, normal: new THREE.Vector3(0, 1, 0) };
      }

      // For walking we only care about a floor position: take the probe point
      // and drop it to the room floor so we pick the right destination sweep.
      function floorTarget() {
        const p = probe(); if (!p) return null;
        const fy = MODE === 'pano' ? floorYForRoom(ROOM_BY_ID[currentId]) : floorY;
        return new THREE.Vector3(p.point.x, fy, p.point.z);
      }

      // Sweep nearest to a world point, measured on the FLOOR (ignore height),
      // so clicking a far room sends you to THAT room, not one behind you.
      function targetSweep(point) {
        let best = null, bd = Infinity;
        ROOMS.forEach((r) => {
          const c = camVec(r); const dx = c.x - point.x, dz = c.z - point.z;
          const d = dx * dx + dz * dz; if (d < bd) { bd = d; best = r; }
        });
        return best;
      }

      const hover = (e) => {
        if (MODE !== 'pano' || MEASURE || dragging || anim) { retActive = false; reticle.visible = false; return; }
        setPtr(e); ray.setFromCamera(ptr, panoCam);
        const p = probe();
        if (p) {
          retTargetPos.copy(p.point).addScaledVector(p.normal, 0.02);   // float just above the surface
          retTargetQuat.setFromUnitVectors(_zAxis, p.normal);            // ring's +Z -> surface normal
          if (!retActive) { reticle.position.copy(retTargetPos); reticle.quaternion.copy(retTargetQuat); reticle.visible = true; }
          retActive = true;
        } else { retActive = false; reticle.visible = false; }
      };
      el.addEventListener('mousemove', hover);

      el.addEventListener('click', (e) => {
        if (moved || anim) return;
        setPtr(e); ray.setFromCamera(ptr, activeCam);
        if (MEASURE) {
          // measuring still uses the real surface (so you can measure objects)
          let p = null;
          if (houseMesh) { const h = ray.intersectObject(houseMesh, true)[0]; if (h) p = h.point.clone(); }
          if (!p) { const fp = floorTarget(); if (fp) p = fp; }
          if (p) addPoint(p);
          return;
        }
        if (MODE === 'pano') { const fp = floorTarget(); if (fp) { const t = targetSweep(fp); if (t) walkTo(t); } return; }
        // dollhouse / plan: click the house -> fly into the nearest room
        if (houseMesh) { const h = ray.intersectObject(houseMesh, true)[0]; if (h) { const t = targetSweep(h.point); if (t) flyInto(t); } }
      });

      // ---- transitions ----------------------------------------------------
      let currentId = null, firstPanoReady = false;
      let anim = null;   // { kind:'walk'|'fly', start, dur, ... }
      const easeIO = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

      // WALK: glide forward to a sweep, motion-blur, keep look direction.
      function walkTo(room) {
        if (!room || (room.id === currentId && firstPanoReady)) return;
        if (anim) finishAnim();           // collapse any running transition
        const fromPos = panoCam.position.clone();
        const toPos = camVec(room);
        const prevId = currentId;
        currentId = room.id; setCurRoom(room);
        pv.vLon = pv.vLat = 0;
        texLoader.load(base + room.skybox, (tex) => {
          if (disposed) return;
          tuneTex(tex); applyPano(sphereFade, tex, room);
          sphereFade.material.opacity = 0; sphereFade.visible = true;
          const dist = fromPos.distanceTo(toPos);
          anim = { kind: 'walk', start: performance.now(), dur: Math.min(950, 480 + dist * 90), fromPos, toPos, room };
        }, undefined, () => { currentId = prevId; });
      }

      // FLY: dollhouse/plan -> pano. Camera flies from the orbit pose into the
      // sweep, then control hands over to the panorama.
      function flyInto(room) {
        if (!room) return;
        if (anim) finishAnim();
        const startPos = dollCam.position.clone();
        const startQuat = dollCam.quaternion.clone();
        const endPos = camVec(room);
        const yaw = room.heading != null ? (room.initialYaw ?? 0) : 0;
        // build the end orientation for panoCam
        const tmp = panoCam.clone(); tmp.position.copy(endPos);
        const phi = THREE.MathUtils.degToRad(90), th = THREE.MathUtils.degToRad(yaw);
        tmp.lookAt(endPos.x + Math.sin(phi) * Math.cos(th), endPos.y + Math.cos(phi), endPos.z + Math.sin(phi) * Math.sin(th));
        const endQuat = tmp.quaternion.clone();

        currentId = room.id; setCurRoom(room);
        const apply = (tex) => {
          if (disposed) return;
          if (tex) { tuneTex(tex); applyPano(sphereMain, tex, room); }
          MODE = 'intro'; activeCam = panoCam; setMode('pano');
          meshGroup.visible = true; sphereMain.visible = false;
          anim = { kind: 'fly', start: performance.now(), dur: 1500, startPos, startQuat, endPos, endQuat, room, yaw };
        };
        texLoader.load(base + room.skybox, apply, undefined, () => apply(null));
      }

      function finishAnim() {
        if (!anim) return;
        if (anim.kind === 'walk') {
          if (sphereFade.material.map) applyPano(sphereMain, sphereFade.material.map, anim.room);
          panoCam.position.copy(anim.toPos);
          sphereFade.visible = false; sphereFade.material.map = null; sphereFade.material.opacity = 0;
        } else if (anim.kind === 'fly') {
          panoCam.position.copy(anim.endPos);
          pv.lon = pv.tLon = anim.yaw; pv.lat = pv.tLat = 0;
          MODE = 'pano'; sphereMain.visible = true; meshGroup.visible = false;
          panoCam.fov = BASE_FOV; panoCam.updateProjectionMatrix();
        }
        el.style.filter = '';
        anim = null;
      }

      // first entry: load the start panorama, reveal it, then (if the mesh is
      // ready) play the cinematic dollhouse fly-in.
      function loadFirstPano() {
        const room = ROOM_BY_ID[META.startRoom] || ROOMS[0];
        if (!room) { setStatus('error'); setErrMsg(L('Нет панорам', 'No panoramas')); return; }
        currentId = room.id; setCurRoom(room);
        texLoader.load(base + room.skybox, (tex) => {
          if (disposed) return;
          tuneTex(tex); applyPano(sphereMain, tex, room);
          panoCam.position.copy(camVec(room));
          pv.lon = pv.tLon = room.initialYaw ?? 0; pv.lat = pv.tLat = 0;
          firstPanoReady = true;
          // ready immediately — never leave a black screen waiting for the mesh
          MODE = 'pano'; activeCam = panoCam; sphereMain.visible = true; meshGroup.visible = false;
          setStatus('ready');
          maybeIntro();
        }, undefined, () => { if (!disposed) { setStatus('error'); setErrMsg(L('Не удалось загрузить панораму', 'Failed to load the panorama')); } });
      }

      let introStarted = false;
      function maybeIntro() {
        // Cinematic intro only if the mesh is already decoded AND we haven't
        // started interacting. Otherwise we simply stay in the panorama.
        if (introStarted || disposed || !firstPanoReady || !meshReady || !META.mesh) return;
        introStarted = true;
        const room = ROOM_BY_ID[currentId];
        MODE = 'intro'; activeCam = dollCam;
        meshGroup.visible = true; sphereMain.visible = false; frameDollhouse();
        setTimeout(() => { if (!disposed && MODE === 'intro') flyInto(room); }, 800);
      }

      function setSceneMode(m) {
        const prev = MODE; MODE = m; setMode(m === 'intro' ? 'pano' : m);
        const isPano = m === 'pano', isDoll = m === 'doll', isPlan = m === 'plan';
        sphereMain.visible = isPano; sphereFade.visible = isPano && sphereFade.visible;
        reticle.visible = false;
        meshGroup.visible = isDoll || isPlan;
        dollControls.enabled = isDoll || isPlan; dollControls.enableRotate = isDoll;
        activeCam = isPano ? panoCam : dollCam;
        if (MEASURE) clearMeasure();
        if (isDoll && prev !== 'doll') frameDollhouse();
        if (isPlan) topView();
      }

      apiRef.current = {
        go: (rid) => { const r = ROOM_BY_ID[rid]; if (!r) return; if (MODE === 'pano') walkTo(r); else flyInto(r); },
        setMode: (m) => { if (anim) finishAnim(); setSceneMode(m); },
        toggleMeasure: (on) => { MEASURE = on; reticle.visible = false; if (!on) clearMeasure(); },
        resetView: () => {
          if (MODE === 'doll') return frameDollhouse();
          if (MODE === 'plan') return topView();
          panoCam.fov = BASE_FOV; panoCam.updateProjectionMatrix();
          const r = ROOM_BY_ID[currentId]; pv.tLon = r ? (r.initialYaw || 0) : 0; pv.tLat = 0; pv.vLon = pv.vLat = 0;
        },
      };

      const onResize = () => { renderer.setSize(W(), H()); [panoCam, dollCam].forEach((c) => { c.aspect = W() / H(); c.updateProjectionMatrix(); }); };
      window.addEventListener('resize', onResize);
      cleanup.push(() => window.removeEventListener('resize', onResize));

      // boot
      loadFirstPano();

      function tick() {
        raf = requestAnimationFrame(tick);

        if (anim && anim.kind === 'fly') {
          const k = Math.min((performance.now() - anim.start) / anim.dur, 1);
          const e = easeIO(k);
          panoCam.position.lerpVectors(anim.startPos, anim.endPos, e);
          panoCam.quaternion.slerpQuaternions(anim.startQuat, anim.endQuat, e);
          panoCam.fov = THREE.MathUtils.lerp(50, BASE_FOV, e); panoCam.updateProjectionMatrix();
          // reveal the panorama for the final stretch, fade the mesh out
          if (k > 0.55) { sphereMain.visible = true; sphereMain.material.opacity = 1; }
          el.style.filter = `blur(${Math.sin(k * Math.PI) * 3}px)`;
          if (k >= 1) finishAnim();
          renderer.render(scene, activeCam);
          return;
        }

        if (MODE === 'pano') {
          if (!dragging && !anim) {
            pv.tLon += pv.vLon; pv.tLat = THREE.MathUtils.clamp(pv.tLat + pv.vLat, -85, 85);
            pv.vLon *= 0.93; pv.vLat *= 0.93;
            if (Math.abs(pv.vLon) < 0.001) pv.vLon = 0; if (Math.abs(pv.vLat) < 0.001) pv.vLat = 0;
          }
          pv.lon += (pv.tLon - pv.lon) * 0.14; pv.lat += (pv.tLat - pv.lat) * 0.14;

          // reticle eases to the probed surface (position + tilt to the normal)
          if (retActive && !anim) {
            reticle.visible = true;
            reticle.position.lerp(retTargetPos, 0.4);
            reticle.quaternion.slerp(retTargetQuat, 0.4);
            const s = 1 + Math.sin(performance.now() / 320) * 0.08; reticleRing.scale.setScalar(s);
          } else if (!retActive) reticle.visible = false;

          if (anim && anim.kind === 'walk') {
            const k = Math.min((performance.now() - anim.start) / anim.dur, 1);
            const e = easeIO(k);
            panoCam.position.lerpVectors(anim.fromPos, anim.toPos, e);
            sphereFade.material.opacity = Math.min(1, k * 1.5);
            // motion blur that peaks mid-step, fades at arrival
            el.style.filter = `blur(${Math.sin(k * Math.PI) * 4.5}px)`;
            if (k >= 1) finishAnim();
          }
          aim();
        } else {
          dollControls.update();
        }
        renderer.render(scene, activeCam);
      }
      tick();

      cleanup.push(() => {
        cancelAnimationFrame(raf);
        el.style.filter = '';
        el.removeEventListener('mousedown', down); el.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up);
        el.removeEventListener('mousemove', hover);
        el.removeEventListener('touchstart', down); el.removeEventListener('touchmove', move); el.removeEventListener('touchend', up);
        el.removeEventListener('wheel', wheel);
        dollControls.dispose();
        scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((mm) => { if (mm.map) mm.map.dispose(); mm.dispose(); }); });
        renderer.dispose();
        try { mount.removeChild(renderer.domElement); } catch {}
        apiRef.current = null;
      });
    })();

    return () => { disposed = true; cleanup.forEach((fn) => fn()); };
  }, [base]);

  const rooms = meta?.rooms || [];
  const hasMesh = !!meta?.mesh;

  return (
    <div className="t3d-stage">
      <div ref={mountRef} className="t3d-canvas" />

      {status === 'loading' && (
        <div className="t3d-overlay-center"><div className="boot-spinner" /><div style={{ marginTop: 14 }}>{L('Загрузка тура…', 'Loading tour…')}</div></div>
      )}
      {status === 'error' && (
        <div className="t3d-overlay-center">
          <Icon name="alert" size={48} />
          <h3 style={{ margin: '12px 0 6px' }}>{L('Тур недоступен', 'Tour unavailable')}</h3>
          <p style={{ opacity: .7, maxWidth: 420, textAlign: 'center' }}>{errMsg}</p>
          <button className="btn btn-primary mt-16" onClick={() => nav(`/properties/${id}`)}>{L('К объекту', 'To listing')}</button>
        </div>
      )}

      {status === 'ready' && (
        <>
          <div className="t3d-bar t3d-top">
            <button className="t3d-btn" onClick={() => nav(`/properties/${id}`)}><Icon name="arrow-left" /> {L('Объект', 'Listing')}</button>
            <div className="t3d-modes">
              <button className={mode === 'pano' ? 'on' : ''} onClick={() => apiRef.current?.setMode('pano')}><Icon name="globe" size={15} /> {L('Панорама', 'Panorama')}</button>
              {hasMesh && <button className={mode === 'doll' ? 'on' : ''} onClick={() => apiRef.current?.setMode('doll')}><Icon name="building" size={15} /> {L('Домик', 'Dollhouse')}</button>}
              {hasMesh && <button className={mode === 'plan' ? 'on' : ''} onClick={() => apiRef.current?.setMode('plan')}><Icon name="map" size={15} /> {L('План', 'Plan')}</button>}
            </div>
          </div>

          {rooms.length > 0 && (
            <div className="t3d-rooms">
              {rooms.map((r) => (
                <button key={r.id} className={curRoom?.id === r.id ? 'on' : ''} onClick={() => apiRef.current?.go(r.id)}>{r.name}</button>
              ))}
            </div>
          )}

          <div className="t3d-bar t3d-bottom">
            <button className={measure ? 'on' : ''} onClick={() => { const v = !measure; setMeasure(v); apiRef.current?.toggleMeasure(v); }}><Icon name="ruler" size={15} /> {L('Линейка', 'Measure')}</button>
            <button onClick={() => apiRef.current?.resetView()}><Icon name="repeat" size={15} /> {L('Сброс', 'Reset')}</button>
          </div>

          {mode === 'pano' && <div className="t3d-hint">{L('Кликните, чтобы пройти туда · тяните, чтобы осмотреться', 'Click to walk there · drag to look around')}</div>}
          {mode === 'doll' && <div className="t3d-hint">{L('Вращайте дом · клик по комнате — войти внутрь', 'Orbit the house · click a room to step inside')}</div>}
          {mode === 'plan' && <div className="t3d-hint">{L('Вид сверху · клик по комнате — войти внутрь', 'Top-down view · click a room to step inside')}</div>}
          {measure && !measureText && <div className="t3d-hint">{L('Отметьте две точки для измерения', 'Click two points to measure')}</div>}
          {measureText && <div className="t3d-measure">{measureText}</div>}
        </>
      )}
    </div>
  );
}
