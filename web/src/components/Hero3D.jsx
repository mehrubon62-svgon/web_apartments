import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/* ============================================================
   3D hero — translucent glass house with glowing edges.
   Draggable (OrbitControls). The camera orientation is persisted
   to localStorage, so after a page reload the house keeps the
   same rotation/zoom the user left it at.
   ============================================================ */
const VIEW_KEY = 'nestora_hero3d_view';

export function Hero3D() {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const css = getComputedStyle(document.documentElement);
    const BRAND = new THREE.Color(css.getPropertyValue('--brand').trim() || '#c2502e');
    const ACCENT = new THREE.Color(css.getPropertyValue('--accent').trim() || '#1f5c4d');
    const GOLD = new THREE.Color(css.getPropertyValue('--gold').trim() || '#b8862f');

    let w = mount.clientWidth, h = mount.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
    camera.position.set(0, 1.2, 12);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.enablePan = false;
    controls.enableZoom = true;
    controls.minDistance = 7;
    controls.maxDistance = 18;
    controls.autoRotate = !reduced;
    controls.autoRotateSpeed = 1.1;
    controls.target.set(0, 0.4, 0);

    // ---- restore saved view (rotation + zoom) ----
    let userInteracted = false;
    try {
      const saved = JSON.parse(localStorage.getItem(VIEW_KEY));
      if (saved && Number.isFinite(saved.az) && Number.isFinite(saved.pol) && Number.isFinite(saved.dist)) {
        const r = saved.dist;
        const pol = saved.pol, az = saved.az;
        camera.position.set(
          controls.target.x + r * Math.sin(pol) * Math.sin(az),
          controls.target.y + r * Math.cos(pol),
          controls.target.z + r * Math.sin(pol) * Math.cos(az),
        );
        controls.update();
        controls.autoRotate = false;   // respect the user's saved angle
        userInteracted = true;
      }
    } catch {}

    let saveTimer = null;
    function saveView() {
      if (saveTimer) return;
      saveTimer = setTimeout(() => {
        saveTimer = null;
        try {
          localStorage.setItem(VIEW_KEY, JSON.stringify({
            az: controls.getAzimuthalAngle(),
            pol: controls.getPolarAngle(),
            dist: camera.position.distanceTo(controls.target),
          }));
        } catch {}
      }, 200);
    }
    controls.addEventListener('start', () => { controls.autoRotate = false; userInteracted = true; });
    controls.addEventListener('change', saveView);

    // ---- lights ----
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const keyLight = new THREE.PointLight(BRAND.getHex(), 90, 60);
    const fillLight = new THREE.PointLight(ACCENT.getHex(), 70, 60);
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.6);
    rimLight.position.set(4, 8, 6);
    scene.add(keyLight, fillLight, rimLight);

    // ---- the house ----
    const house = new THREE.Group();
    const s = 1.15;
    const body = new THREE.BoxGeometry(2.4 * s, 1.8 * s, 2.4 * s);
    const roof = new THREE.ConeGeometry(2.0 * s, 1.5 * s, 4);

    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, metalness: 0.1, roughness: 0.15,
      transmission: 0.6, transparent: true, opacity: 0.28,
      reflectivity: 0.6, clearcoat: 1, clearcoatRoughness: 0.2,
    });
    const bodyMesh = new THREE.Mesh(body, glassMat);
    bodyMesh.position.y = -0.2;
    const roofMesh = new THREE.Mesh(roof, glassMat.clone());
    roofMesh.position.y = 1.45;
    roofMesh.rotation.y = Math.PI / 4;
    house.add(bodyMesh, roofMesh);

    const bodyEdges = new THREE.LineSegments(new THREE.EdgesGeometry(body), new THREE.LineBasicMaterial({ color: BRAND.getHex(), transparent: true, opacity: 0.9 }));
    bodyEdges.position.copy(bodyMesh.position);
    const roofEdges = new THREE.LineSegments(new THREE.EdgesGeometry(roof), new THREE.LineBasicMaterial({ color: GOLD.getHex(), transparent: true, opacity: 0.95 }));
    roofEdges.position.copy(roofMesh.position);
    roofEdges.rotation.y = Math.PI / 4;
    house.add(bodyEdges, roofEdges);

    // ---- windows (always warm-lit) ----
    const winMat = new THREE.MeshStandardMaterial({ color: GOLD.getHex(), emissive: GOLD.clone().multiplyScalar(0.5).getHex(), emissiveIntensity: 0.5, roughness: 0.4, transparent: true, opacity: 0.9 });
    const half = 1.2 * s + 0.01;
    const winGeo = new THREE.PlaneGeometry(0.5, 0.62);
    const winPositions = [
      [-0.62, 0.25, half, 0], [0.62, 0.25, half, 0],
      [-0.62, 0.25, -half, Math.PI], [0.62, 0.25, -half, Math.PI],
      [half, 0.25, -0.62, Math.PI / 2], [half, 0.25, 0.62, Math.PI / 2],
      [-half, 0.25, -0.62, -Math.PI / 2], [-half, 0.25, 0.62, -Math.PI / 2],
    ];
    for (const [x, y, z, ry] of winPositions) {
      const win = new THREE.Mesh(winGeo, winMat);
      win.position.set(x, y, z); win.rotation.y = ry;
      house.add(win);
    }

    const door = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.1), new THREE.MeshBasicMaterial({ color: ACCENT.getHex(), transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
    door.position.set(0, -0.55, 1.39 * s);
    house.add(door);

    scene.add(house);

    // ---- floating crystals ----
    const crystals = [];
    const crystalGeo = new THREE.IcosahedronGeometry(0.42, 0);
    for (let i = 0; i < 14; i++) {
      const useBrand = i % 2 === 0;
      const mat = new THREE.MeshStandardMaterial({ color: (useBrand ? BRAND : ACCENT).getHex(), metalness: 0.4, roughness: 0.25, flatShading: true, transparent: true, opacity: 0.92 });
      const m = new THREE.Mesh(crystalGeo, mat);
      const ang = (i / 14) * Math.PI * 2;
      const rad = 5 + Math.random() * 3;
      m.position.set(Math.cos(ang) * rad, (Math.random() - 0.5) * 6, Math.sin(ang) * rad - 1);
      m.scale.setScalar(0.5 + Math.random() * 1.1);
      m.userData = { baseY: m.position.y, sp: 0.3 + Math.random() * 0.7, phase: Math.random() * 6.28, rot: new THREE.Vector3((Math.random() - 0.5) * 0.02, (Math.random() - 0.5) * 0.02, (Math.random() - 0.5) * 0.02) };
      const wire = new THREE.LineSegments(new THREE.EdgesGeometry(crystalGeo), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 }));
      m.add(wire);
      crystals.push(m);
      scene.add(m);
    }

    // ---- starfield ----
    const starCount = 600;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 14 + Math.random() * 22;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      starPos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      starPos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
      starPos[i * 3 + 2] = r * Math.cos(ph);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.06, transparent: true, opacity: 0.45, sizeAttenuation: true }));
    scene.add(stars);

    // ---- ground ring ----
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(3.4, 9, 64, 1),
      new THREE.MeshBasicMaterial({ color: BRAND.getHex(), transparent: true, opacity: 0.06, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -2.4;
    scene.add(ring);

    // ---- resize ----
    function resize() {
      w = mount.clientWidth; h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    // ---- animate ----
    const clock = new THREE.Clock();
    let raf = null, visible = true;
    const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; }, { threshold: 0 });
    io.observe(mount);

    function tick() {
      raf = requestAnimationFrame(tick);
      if (!visible) return;
      const t = clock.getElapsedTime();
      const speed = reduced ? 0 : 1;

      house.position.y = Math.sin(t * 0.6) * 0.15 * speed;
      for (const m of crystals) {
        const u = m.userData;
        m.position.y = u.baseY + Math.sin(t * u.sp + u.phase) * 0.6 * speed;
        m.rotation.x += u.rot.x * speed;
        m.rotation.y += u.rot.y * speed;
        m.rotation.z += u.rot.z * speed;
      }
      stars.rotation.y = t * 0.02 * speed;
      ring.rotation.z = t * 0.05 * speed;
      keyLight.position.set(Math.cos(t * 0.7) * 7, 4 + Math.sin(t * 0.5) * 2, Math.sin(t * 0.7) * 7);
      fillLight.position.set(Math.cos(t * 0.7 + Math.PI) * 7, -2 + Math.cos(t * 0.4) * 2, Math.sin(t * 0.7 + Math.PI) * 7);
      controls.update();
      renderer.render(scene, camera);
    }
    tick();

    return () => {
      cancelAnimationFrame(raf);
      if (saveTimer) clearTimeout(saveTimer);
      ro.disconnect(); io.disconnect();
      controls.dispose();
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach((mm) => mm.dispose());
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} className="hero3d" />;
}
