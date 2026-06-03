import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';
import { Icon } from '../lib/icons.jsx';

/* ============================================================
   Native 3D / 360° tour viewer (Three.js, bundled).

   Like https://discover.matterport.com :
     • Panorama  — look around, and WALK FREELY: click the floor anywhere and
       the viewer flies to the nearest sweep in that direction (not just along
       fixed arrows). A reticle shows where you'll land.
     • Dollhouse — the REAL textured mesh decoded from Matterport's .dam,
       orbitable; click anywhere to drop into the closest sweep.
     • Plan      — the same mesh seen straight from above (true floor plan).

   Geometry: sweep camera positions and the .glb mesh share one Y-up frame
   (produced by the backend converter), so everything lines up.
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
      const camVec = (r) => new THREE.Vector3((r.camera?.x || 0) * SCALE, (r.camera?.y || 1.45) * SCALE, (r.camera?.z || 0) * SCALE);

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
      let MODE = 'pano';
      let MEASURE = false;

      // ---- panorama spheres (two, for cross-fade glide) -------------------
      // Each sphere is centred on its own sweep's world position, so gliding
      // the camera between sweeps produces a real positional move (parallax),
      // not a teleport. The look DIRECTION (lon/lat) is never touched by moves.
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

      // ---- lon/lat pano controller with inertia ---------------------------
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

      // ---- dollhouse orbit controls --------------------------------------
      const dollControls = new OrbitControls(dollCam, renderer.domElement);
      dollControls.enableDamping = true; dollControls.dampingFactor = 0.08;
      dollControls.maxPolarAngle = Math.PI / 2.05; dollControls.enabled = false; dollControls.minDistance = 1;

      scene.add(new THREE.AmbientLight(0xffffff, 1.05));
      const dir = new THREE.DirectionalLight(0xffffff, 0.55); dir.position.set(6, 14, 8); scene.add(dir);
      const dir2 = new THREE.DirectionalLight(0xffffff, 0.3); dir2.position.set(-8, 10, -6); scene.add(dir2);

      // ---- the real textured mesh (.glb from .dam) ------------------------
      const meshGroup = new THREE.Group(); meshGroup.visible = false; scene.add(meshGroup);
      let houseMesh = null, meshBox = null, meshReady = false;
      let dollCenter = new THREE.Vector3(), dollSpan = 10, floorY = 0;

      function frameDollhouse() {
        if (!meshBox) return;
        const size = meshBox.getSize(new THREE.Vector3());
        const dist = Math.max(size.x, size.z) * 1.05 + size.y + 3;
        dollCam.position.set(dollCenter.x + dist * 0.5, floorY + dist * 0.85, dollCenter.z + dist * 0.7);
        dollControls.target.set(dollCenter.x, floorY + size.y * 0.35, dollCenter.z);
        dollControls.update();
      }
      function topView() {
        if (!meshBox) return;
        const size = meshBox.getSize(new THREE.Vector3());
        const h = Math.max(size.x, size.z) * 1.15 + 5;
        dollCam.position.set(dollCenter.x + 0.001, floorY + h, dollCenter.z);
        dollControls.target.set(dollCenter.x, floorY, dollCenter.z);
        dollControls.update();
      }

      const gltfLoader = new GLTFLoader();
      if (META.mesh) {
        gltfLoader.load(base + META.mesh, (gltf) => {
          if (disposed) return;
          meshGroup.add(gltf.scene);
          // Keep the mesh single-sided: back-face culling on inward-oriented
          // triangles yields the Matterport "dollhouse" cutaway (near walls and
          // ceiling drop away so you see into the rooms from above).
          gltf.scene.traverse((o) => { if (o.isMesh) { houseMesh = o; o.material.side = THREE.FrontSide; o.material.metalness = 0; } });
          meshBox = new THREE.Box3().setFromObject(gltf.scene);
          dollCenter = meshBox.getCenter(new THREE.Vector3());
          floorY = meshBox.min.y;
          dollSpan = meshBox.getSize(new THREE.Vector3()).length();
          meshReady = true;
          frameDollhouse();
        }, undefined, () => { /* mesh optional */ });
      }
      // ---- click-to-walk reticle -----------------------------------------
      const reticle = new THREE.Mesh(
        new THREE.RingGeometry(0.18, 0.28, 28),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: false })
      );
      reticle.rotation.x = -Math.PI / 2; reticle.visible = false; reticle.renderOrder = 6; scene.add(reticle);

      // ---- measuring tool -------------------------------------------------
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

      // pointer -> NDC
      function setPtr(e) { const r = el.getBoundingClientRect(); ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1; ptr.y = -((e.clientY - r.top) / r.height) * 2 + 1; }

      // Where on the floor is the pointer aiming? Prefer the real mesh; fall
      // back to a horizontal plane at floor height through the sweep.
      function floorHit() {
        if (houseMesh) { const h = ray.intersectObject(houseMesh, true)[0]; if (h) return h.point.clone(); }
        const hit = new THREE.Vector3(); floorPlane.constant = -(MODE === 'pano' ? panoCam.position.y - 1.45 * SCALE : floorY);
        return ray.ray.intersectPlane(floorPlane, hit) ? hit : null;
      }

      // pick nearest sweep to a world point, excluding the current one
      function nearestSweep(point, excludeId) {
        let best = null, bd = Infinity;
        ROOMS.forEach((r) => {
          if (r.id === excludeId) return;
          const d = camVec(r).distanceTo(point);
          if (d < bd) { bd = d; best = r; }
        });
        return best;
      }

      // hover reticle in panorama (shows where a click would take you)
      const hover = (e) => {
        if (MODE !== 'pano' || MEASURE || dragging || trans) { reticle.visible = false; return; }
        setPtr(e); ray.setFromCamera(ptr, panoCam);
        const fp = floorHit();
        if (fp) { reticle.position.set(fp.x, (houseMesh ? fp.y : floorY) + 0.02, fp.z); reticle.visible = true; }
        else reticle.visible = false;
      };
      el.addEventListener('mousemove', hover);

      el.addEventListener('click', (e) => {
        if (moved) return;                       // ignore drag-release clicks
        setPtr(e); ray.setFromCamera(ptr, activeCam);
        if (MEASURE) {
          if (MODE === 'pano') { const fp = floorHit(); if (fp) addPoint(fp); }
          else { const fp = floorHit(); if (fp) addPoint(fp); }
          return;
        }
        if (MODE === 'pano') {
          // free walk: go to nearest sweep toward the clicked floor point
          const fp = floorHit();
          if (fp) { const t = nearestSweep(fp, currentId); if (t) go(t.id, { toward: fp }); }
          return;
        }
        // dollhouse / plan: click anywhere on the house -> enter nearest sweep
        if (houseMesh) { const h = ray.intersectObject(houseMesh, true)[0]; if (h) { const t = nearestSweep(h.point, null); if (t) go(t.id, { from: 'doll' }); } }
      });

      // ---- navigation: glide between sweeps, keeping the look direction ----
      let currentId = null, firstLoaded = false;
      let trans = null;   // { start, dur, fromPos, toPos }
      const easeIO = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
      function applyTexTo(mesh, tex) { if (mesh.material.map) mesh.material.map.dispose(); mesh.material.map = tex; mesh.material.color.set(0xffffff); mesh.material.needsUpdate = true; }

      function go(rid, opts = {}) {
        const room = ROOM_BY_ID[rid]; if (!room) return;
        if (rid === currentId && firstLoaded) { if (opts.from === 'doll') setSceneMode('pano'); return; }
        const dest = camVec(room);

        // First load: just place everything, no animation.
        if (!firstLoaded) {
          currentId = rid; setCurRoom(room);
          panoCam.position.copy(dest); sphereMain.position.copy(dest);
          if (room.initialYaw != null) { pv.lon = pv.tLon = room.initialYaw; pv.lat = pv.tLat = 0; }
          texLoader.load(base + room.skybox, (tex) => {
            if (disposed) return;
            tuneTex(tex); applyTexTo(sphereMain, tex);
            firstLoaded = true; setStatus('ready');
          }, undefined, (err) => { if (!disposed) { setStatus('error'); setErrMsg(L('Не удалось загрузить панораму', 'Failed to load the panorama')); } });
          if (MODE !== 'pano') setSceneMode('pano');
          return;
        }

        // Subsequent moves: load the target panorama, then glide the camera to
        // it while cross-fading. The view direction (lon/lat) is NOT changed.
        // If a glide is already running, finalise it instantly first.
        if (trans) {
          if (sphereFade.material.map) { applyTexTo(sphereMain, sphereFade.material.map); sphereMain.position.copy(trans.toPos); }
          panoCam.position.copy(trans.toPos);
          sphereFade.visible = false; sphereFade.material.map = null; sphereFade.material.opacity = 0;
          trans = null;
        }
        const fromPos = panoCam.position.clone();
        currentId = rid; setCurRoom(room);
        if (MODE !== 'pano') setSceneMode('pano');
        pv.vLon = pv.vLat = 0;   // kill any look-inertia so the move feels clean

        texLoader.load(base + room.skybox, (tex) => {
          if (disposed) return;
          tuneTex(tex);
          // new panorama on the fade sphere, centred at the destination
          applyTexTo(sphereFade, tex);
          sphereFade.position.copy(dest);
          sphereFade.material.opacity = 0; sphereFade.visible = true;
          trans = { start: performance.now(), dur: 700, fromPos, toPos: dest };
        }, undefined, (err) => { console.warn('panorama load failed:', base + room.skybox, err); });
      }

      function setSceneMode(m) {
        const prev = MODE; MODE = m; setMode(m);
        const isPano = m === 'pano', isDoll = m === 'doll', isPlan = m === 'plan';
        sphereMain.visible = isPano;
        sphereFade.visible = isPano && sphereFade.visible;
        reticle.visible = false;
        meshGroup.visible = isDoll || isPlan;
        dollControls.enabled = isDoll || isPlan;
        dollControls.enableRotate = isDoll;          // plan = locked top-down
        activeCam = isPano ? panoCam : dollCam;
        if (MEASURE) clearMeasure();
        if (isDoll && prev !== 'doll') frameDollhouse();
        if (isPlan) topView();
      }

      apiRef.current = {
        go: (rid) => go(rid, { from: 'list' }),
        setMode: setSceneMode,
        toggleMeasure: (on) => { MEASURE = on; reticle.visible = false; if (!on) clearMeasure(); },
        resetView: () => {
          if (MODE === 'doll') { frameDollhouse(); return; }
          if (MODE === 'plan') { topView(); return; }
          panoCam.fov = BASE_FOV; panoCam.updateProjectionMatrix();
          const r = ROOM_BY_ID[currentId]; pv.tLon = r ? (r.initialYaw || 0) : 0; pv.tLat = 0; pv.vLon = pv.vLat = 0;
        },
      };

      const onResize = () => { renderer.setSize(W(), H()); [panoCam, dollCam].forEach((c) => { c.aspect = W() / H(); c.updateProjectionMatrix(); }); };
      window.addEventListener('resize', onResize);
      cleanup.push(() => window.removeEventListener('resize', onResize));

      go(META.startRoom || ROOMS[0]?.id, {});
      setSceneMode('pano');
      const readyFallback = setTimeout(() => { if (!disposed && !firstLoaded) { firstLoaded = true; setStatus('ready'); } }, 8000);
      cleanup.push(() => clearTimeout(readyFallback));

      function tick() {
        raf = requestAnimationFrame(tick);
        if (MODE === 'pano') {
          // look-around inertia (direction only)
          if (!dragging) {
            pv.tLon += pv.vLon; pv.tLat = THREE.MathUtils.clamp(pv.tLat + pv.vLat, -85, 85);
            pv.vLon *= 0.93; pv.vLat *= 0.93;
            if (Math.abs(pv.vLon) < 0.001) pv.vLon = 0; if (Math.abs(pv.vLat) < 0.001) pv.vLat = 0;
          }
          pv.lon += (pv.tLon - pv.lon) * 0.14; pv.lat += (pv.tLat - pv.lat) * 0.14;

          // positional glide between sweeps (does NOT touch lon/lat)
          if (trans) {
            const k = Math.min((performance.now() - trans.start) / trans.dur, 1);
            const e = easeIO(k);
            panoCam.position.lerpVectors(trans.fromPos, trans.toPos, e);
            sphereFade.material.opacity = Math.min(1, k * 1.4);    // fade the new view in
            if (k >= 1) {
              // promote: new panorama becomes the main sphere at the destination
              const tex = sphereFade.material.map;
              applyTexTo(sphereMain, tex);
              sphereMain.position.copy(trans.toPos);
              panoCam.position.copy(trans.toPos);
              sphereFade.visible = false; sphereFade.material.map = null; sphereFade.material.opacity = 0;
              trans = null;
            }
          }
          if (reticle.visible) { const s = 1 + Math.sin(performance.now() / 300) * 0.12; reticle.scale.setScalar(s); }
          aim();
        } else {
          dollControls.update();
        }
        renderer.render(scene, activeCam);
      }
      tick();

      cleanup.push(() => {
        cancelAnimationFrame(raf);
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

          {mode === 'pano' && <div className="t3d-hint">{L('Кликните по полу, чтобы перейти · тяните, чтобы осмотреться', 'Click the floor to move · drag to look around')}</div>}
          {mode === 'doll' && <div className="t3d-hint">{L('Вращайте дом · клик по комнате — войти внутрь', 'Orbit the house · click a room to step inside')}</div>}
          {mode === 'plan' && <div className="t3d-hint">{L('Вид сверху · клик по комнате — войти внутрь', 'Top-down view · click a room to step inside')}</div>}
          {measure && !measureText && <div className="t3d-hint">{L('Отметьте две точки для измерения', 'Click two points to measure')}</div>}
          {measureText && <div className="t3d-measure">{measureText}</div>}
        </>
      )}
    </div>
  );
}
