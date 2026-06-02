import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/* ============================================================
   Real 3D hero — a detailed, draggable house (Three.js).
   - Grab & rotate with the mouse / touch (OrbitControls, damped)
   - Auto-spins gently until the user interacts
   - Detailed model: stone base, two-tone walls, gable roof,
     lit windows, door, chimney, porch, trees, ground
   - Orbiting brand-colored lights + soft shadows
   - Floating crystals + starfield around the scene
   Cleans up fully. Honors prefers-reduced-motion.
   ============================================================ */
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
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    let w = mount.clientWidth, h = mount.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    camera.position.set(7, 5, 9);

    // ---- controls: grab & rotate ----
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.enablePan = false;
    controls.enableZoom = true;
    controls.minDistance = 7;
    controls.maxDistance = 18;
    controls.minPolarAngle = 0.55;
    controls.maxPolarAngle = Math.PI / 2 - 0.02; // never go under the ground
    controls.autoRotate = !reduced;
    controls.autoRotateSpeed = 1.1;
    controls.target.set(0, 1.1, 0);
    // stop auto-rotate once the user grabs it
    controls.addEventListener('start', () => { controls.autoRotate = false; });

    // ---- lights ----
    scene.add(new THREE.AmbientLight(0xffffff, isDark ? 0.45 : 0.7));
    const sun = new THREE.DirectionalLight(0xfff4e6, 1.5);
    sun.position.set(6, 11, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 40;
    sun.shadow.camera.left = -12; sun.shadow.camera.right = 12;
    sun.shadow.camera.top = 12; sun.shadow.camera.bottom = -12;
    sun.shadow.bias = -0.0004;
    scene.add(sun);
    const keyLight = new THREE.PointLight(BRAND.getHex(), 60, 50);
    const fillLight = new THREE.PointLight(ACCENT.getHex(), 45, 50);
    scene.add(keyLight, fillLight);

    // ---- materials ----
    const mWallA = new THREE.MeshStandardMaterial({ color: 0xf3ece0, roughness: 0.85, metalness: 0.02 });
    const mWallB = new THREE.MeshStandardMaterial({ color: 0xe5d8c3, roughness: 0.9 });
    const mStone = new THREE.MeshStandardMaterial({ color: 0x8d8276, roughness: 1 });
    const mRoof = new THREE.MeshStandardMaterial({ color: BRAND.clone().multiplyScalar(0.95).getHex(), roughness: 0.6, metalness: 0.1 });
    const mTrim = new THREE.MeshStandardMaterial({ color: 0x3a322a, roughness: 0.7 });
    const mWin = new THREE.MeshStandardMaterial({ color: GOLD.getHex(), emissive: GOLD.clone().multiplyScalar(0.9).getHex(), emissiveIntensity: 1.1, roughness: 0.3, metalness: 0.2 });
    const mGlass = new THREE.MeshPhysicalMaterial({ color: 0x9fc4d6, roughness: 0.1, metalness: 0, transmission: 0.6, transparent: true, opacity: 0.5 });
    const mDoor = new THREE.MeshStandardMaterial({ color: ACCENT.getHex(), roughness: 0.5, metalness: 0.15 });
    const mLeaf = new THREE.MeshStandardMaterial({ color: 0x4c7a52, roughness: 0.9, flatShading: true });
    const mTrunk = new THREE.MeshStandardMaterial({ color: 0x6b4a31, roughness: 1 });

    const house = new THREE.Group();

    // helper: a window with frame + glow
    function makeWindow(width = 0.7, height = 0.9) {
      const g = new THREE.Group();
      const frame = new THREE.Mesh(new THREE.BoxGeometry(width + 0.12, height + 0.12, 0.08), mTrim);
      const glow = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.06), mWin);
      glow.position.z = 0.03;
      // mullions
      const barV = new THREE.Mesh(new THREE.BoxGeometry(0.04, height, 0.08), mTrim);
      const barH = new THREE.Mesh(new THREE.BoxGeometry(width, 0.04, 0.08), mTrim);
      barV.position.z = barH.position.z = 0.05;
      g.add(frame, glow, barV, barH);
      return g;
    }

    // ---- stone foundation ----
    const base = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.5, 4.4), mStone);
    base.position.y = 0.25; base.castShadow = base.receiveShadow = true;
    house.add(base);

    // ---- ground floor (lighter) ----
    const floor1 = new THREE.Mesh(new THREE.BoxGeometry(5, 1.9, 4), mWallA);
    floor1.position.y = 1.45; floor1.castShadow = floor1.receiveShadow = true;
    house.add(floor1);

    // ---- second floor (slightly inset, two-tone) ----
    const floor2 = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.6, 3.7), mWallB);
    floor2.position.y = 3.2; floor2.castShadow = floor2.receiveShadow = true;
    house.add(floor2);

    // floor divider trim
    const trimBand = new THREE.Mesh(new THREE.BoxGeometry(5.1, 0.18, 4.1), mTrim);
    trimBand.position.y = 2.45;
    house.add(trimBand);

    // ---- gable roof (triangular prism via extrude) ----
    const roofShape = new THREE.Shape();
    roofShape.moveTo(-2.55, 0); roofShape.lineTo(2.55, 0); roofShape.lineTo(0, 1.9); roofShape.lineTo(-2.55, 0);
    const roofGeo = new THREE.ExtrudeGeometry(roofShape, { depth: 4.1, bevelEnabled: false });
    roofGeo.translate(0, 0, -2.05);
    const roof = new THREE.Mesh(roofGeo, mRoof);
    roof.position.y = 4.0; roof.castShadow = true;
    house.add(roof);

    // roof edge beams (glowing brand outline)
    const roofEdges = new THREE.LineSegments(new THREE.EdgesGeometry(roofGeo), new THREE.LineBasicMaterial({ color: GOLD.getHex() }));
    roofEdges.position.y = 4.0;
    house.add(roofEdges);

    // chimney
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.6, 0.6), mStone);
    chimney.position.set(1.4, 5.2, -0.6); chimney.castShadow = true;
    house.add(chimney);

    // ---- door + porch ----
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.5, 0.12), mDoor);
    door.position.set(0, 1.15, 2.01);
    house.add(door);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 12), mWin);
    knob.position.set(0.3, 1.15, 2.09);
    house.add(knob);
    // porch roof
    const porch = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.8), mTrim);
    porch.position.set(0, 2.0, 2.3);
    house.add(porch);
    const post1 = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.5, 10), mTrim);
    post1.position.set(-0.7, 1.2, 2.6);
    const post2 = post1.clone(); post2.position.x = 0.7;
    house.add(post1, post2);
    // steps
    const step1 = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.16, 0.4), mStone);
    step1.position.set(0, 0.45, 2.35);
    const step2 = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.16, 0.5), mStone);
    step2.position.set(0, 0.3, 2.55);
    house.add(step1, step2);

    // ---- windows ----
    // front, ground floor (either side of door)
    const wfl = makeWindow(); wfl.position.set(-1.6, 1.3, 2.01); house.add(wfl);
    const wfr = makeWindow(); wfr.position.set(1.6, 1.3, 2.01); house.add(wfr);
    // front, second floor
    const w2l = makeWindow(0.7, 0.8); w2l.position.set(-1.2, 3.2, 1.86); house.add(w2l);
    const w2r = makeWindow(0.7, 0.8); w2r.position.set(1.2, 3.2, 1.86); house.add(w2r);
    // sides
    for (const sx of [-1, 1]) {
      const ws = makeWindow(0.8, 0.9); ws.rotation.y = Math.PI / 2; ws.position.set(sx * 2.51, 1.4, 0); house.add(ws);
      const ws2 = makeWindow(0.7, 0.7); ws2.rotation.y = Math.PI / 2; ws2.position.set(sx * 2.31, 3.2, 0); house.add(ws2);
    }
    // round attic window in the gable
    const attic = new THREE.Mesh(new THREE.CircleGeometry(0.45, 24), mWin);
    attic.position.set(0, 4.7, 2.04); house.add(attic);
    const atticFrame = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.06, 8, 24), mTrim);
    atticFrame.position.set(0, 4.7, 2.06); house.add(atticFrame);

    scene.add(house);

    // ---- trees / bushes ----
    function makeTree(x, z, s = 1) {
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.16 * s, 1 * s, 8), mTrunk);
      trunk.position.y = 0.5 * s; trunk.castShadow = true;
      const foliage = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7 * s, 0), mLeaf);
      foliage.position.y = 1.3 * s; foliage.castShadow = true;
      g.add(trunk, foliage);
      g.position.set(x, 0.25, z);
      return g;
    }
    house.add(makeTree(-3.2, 1.6, 1.1), makeTree(3.3, -1.2, 0.9), makeTree(-3, -1.8, 0.7));

    // ground disc
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(11, 64),
      new THREE.MeshStandardMaterial({ color: isDark ? 0x20303a : 0xd9e2d3, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2; ground.position.y = 0; ground.receiveShadow = true;
    scene.add(ground);
    // grid ring accent
    const ring = new THREE.Mesh(new THREE.RingGeometry(6.2, 10.5, 80, 1), new THREE.MeshBasicMaterial({ color: BRAND.getHex(), transparent: true, opacity: 0.08, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02;
    scene.add(ring);

    // ---- floating crystals ----
    const crystals = [];
    const crystalGeo = new THREE.IcosahedronGeometry(0.32, 0);
    for (let i = 0; i < 10; i++) {
      const useBrand = i % 2 === 0;
      const mat = new THREE.MeshStandardMaterial({ color: (useBrand ? BRAND : ACCENT).getHex(), metalness: 0.4, roughness: 0.25, flatShading: true, transparent: true, opacity: 0.92 });
      const m = new THREE.Mesh(crystalGeo, mat);
      const ang = (i / 10) * Math.PI * 2;
      const rad = 6 + Math.random() * 2.5;
      m.position.set(Math.cos(ang) * rad, 2 + Math.random() * 4, Math.sin(ang) * rad);
      m.scale.setScalar(0.6 + Math.random());
      m.userData = { baseY: m.position.y, sp: 0.3 + Math.random() * 0.6, phase: Math.random() * 6.28, rx: (Math.random() - 0.5) * 0.03, ry: (Math.random() - 0.5) * 0.03 };
      crystals.push(m); scene.add(m);
    }

    // ---- starfield ----
    const starCount = 400;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 16 + Math.random() * 20;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      starPos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      starPos[i * 3 + 1] = Math.abs(r * Math.cos(ph)) * 0.7 + 1;
      starPos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: isDark ? 0xffffff : 0xb8862f, size: 0.07, transparent: true, opacity: 0.5 }));
    scene.add(stars);

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
      for (const m of crystals) {
        const u = m.userData;
        m.position.y = u.baseY + Math.sin(t * u.sp + u.phase) * 0.5 * speed;
        m.rotation.x += u.rx * speed; m.rotation.y += u.ry * speed;
      }
      stars.rotation.y = t * 0.015 * speed;
      ring.rotation.z = t * 0.04 * speed;
      keyLight.position.set(Math.cos(t * 0.6) * 8, 6 + Math.sin(t * 0.5) * 2, Math.sin(t * 0.6) * 8);
      fillLight.position.set(Math.cos(t * 0.6 + Math.PI) * 8, 3, Math.sin(t * 0.6 + Math.PI) * 8);
      controls.update();
      renderer.render(scene, camera);
    }
    tick();

    return () => {
      cancelAnimationFrame(raf);
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
