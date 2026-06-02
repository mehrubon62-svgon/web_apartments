import { useRef, useEffect, useState, useCallback, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../lib/icons.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { api } from '../lib/api.js';

const Hero3D = lazy(() => import('../components/Hero3D.jsx').then((m) => ({ default: m.Hero3D })));

const REDUCED = typeof window !== 'undefined' &&
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Particle constellation ---------- */
function Constellation() {
  const ref = useRef(null);
  useEffect(() => {
    if (REDUCED) return;
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    let w = 0, h = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    let particles = [];
    let raf = null;
    const mouse = { x: -9999, y: -9999 };
    const brand = getComputedStyle(document.documentElement).getPropertyValue('--brand').trim() || '#c2502e';
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#1f5c4d';

    function resize() {
      const rect = canvas.parentElement.getBoundingClientRect();
      w = rect.width; h = rect.height;
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(Math.floor((w * h) / 12000), 120);
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4,
        r: Math.random() * 1.8 + 1, c: Math.random() > 0.5 ? brand : accent,
      }));
    }
    function step() {
      ctx.clearRect(0, 0, w, h);
      for (const p of particles) {
        const dx = p.x - mouse.x, dy = p.y - mouse.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 130 && dist > 0) { const f = (130 - dist) / 130; p.vx += (dx / dist) * f * 0.6; p.vy += (dy / dist) * f * 0.6; }
        p.x += p.vx; p.y += p.vy; p.vx *= 0.98; p.vy *= 0.98;
        if (Math.abs(p.vx) < 0.05) p.vx += (Math.random() - 0.5) * 0.1;
        if (Math.abs(p.vy) < 0.05) p.vy += (Math.random() - 0.5) * 0.1;
        if (p.x < -20) p.x = w + 20; if (p.x > w + 20) p.x = -20;
        if (p.y < -20) p.y = h + 20; if (p.y > h + 20) p.y = -20;
        ctx.beginPath(); ctx.fillStyle = p.c; ctx.globalAlpha = 0.7; ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i], b = particles[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < 120) { ctx.beginPath(); ctx.strokeStyle = a.c; ctx.globalAlpha = (1 - d / 120) * 0.28; ctx.lineWidth = 1; ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
        }
        const dm = Math.hypot(particles[i].x - mouse.x, particles[i].y - mouse.y);
        if (dm < 160) { ctx.beginPath(); ctx.strokeStyle = brand; ctx.globalAlpha = (1 - dm / 160) * 0.5; ctx.lineWidth = 1; ctx.moveTo(particles[i].x, particles[i].y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke(); }
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(step);
    }
    const onMove = (e) => { const rect = canvas.getBoundingClientRect(); mouse.x = e.clientX - rect.left; mouse.y = e.clientY - rect.top; };
    const onLeave = () => { mouse.x = -9999; mouse.y = -9999; };
    resize(); step();
    window.addEventListener('resize', resize);
    const parent = canvas.parentElement;
    parent.addEventListener('mousemove', onMove);
    parent.addEventListener('mouseleave', onLeave);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); parent.removeEventListener('mousemove', onMove); parent.removeEventListener('mouseleave', onLeave); };
  }, []);
  return <canvas ref={ref} className="about-constellation" aria-hidden="true" />;
}

/* ---------- Magnetic dot grid that parts under the cursor ---------- */
function DotGrid() {
  const ref = useRef(null);
  useEffect(() => {
    if (REDUCED) return;
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    let w = 0, h = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    let dots = [];
    let raf = null;
    const mouse = { x: -9999, y: -9999 };
    const ink = getComputedStyle(document.documentElement).getPropertyValue('--line-strong').trim() || '#c4b8a0';
    const brand = getComputedStyle(document.documentElement).getPropertyValue('--brand').trim() || '#c2502e';
    const GAP = 34, RADIUS = 120;

    function build() {
      const rect = canvas.parentElement.getBoundingClientRect();
      w = rect.width; h = rect.height;
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dots = [];
      for (let y = GAP; y < h; y += GAP)
        for (let x = GAP; x < w; x += GAP)
          dots.push({ ox: x, oy: y, x, y });
    }
    function step() {
      ctx.clearRect(0, 0, w, h);
      for (const d of dots) {
        const dx = d.ox - mouse.x, dy = d.oy - mouse.y;
        const dist = Math.hypot(dx, dy);
        let tx = d.ox, ty = d.oy, near = 0;
        if (dist < RADIUS && dist > 0) {
          near = (RADIUS - dist) / RADIUS;
          const push = near * 18;
          tx = d.ox + (dx / dist) * push;
          ty = d.oy + (dy / dist) * push;
        }
        d.x += (tx - d.x) * 0.15; d.y += (ty - d.y) * 0.15;
        ctx.beginPath();
        ctx.fillStyle = near > 0.15 ? brand : ink;
        ctx.globalAlpha = 0.25 + near * 0.6;
        ctx.arc(d.x, d.y, 1.3 + near * 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(step);
    }
    const onMove = (e) => { const r = canvas.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; };
    const onLeave = () => { mouse.x = -9999; mouse.y = -9999; };
    build(); step();
    window.addEventListener('resize', build);
    const parent = canvas.parentElement;
    parent.addEventListener('mousemove', onMove);
    parent.addEventListener('mouseleave', onLeave);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', build); parent.removeEventListener('mousemove', onMove); parent.removeEventListener('mouseleave', onLeave); };
  }, []);
  return <canvas ref={ref} className="about-dotgrid" aria-hidden="true" />;
}

/* ---------- Custom trailing cursor ---------- */
function CursorFX() {
  const dot = useRef(null);
  const ring = useRef(null);
  useEffect(() => {
    if (REDUCED || window.matchMedia('(pointer: coarse)').matches) return;
    let mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my, raf = null;
    const onMove = (e) => {
      mx = e.clientX; my = e.clientY;
      if (dot.current) dot.current.style.transform = `translate(${mx}px, ${my}px)`;
      const interactive = e.target.closest && e.target.closest('a, button, .tilt-card, .about-stat, .about-timeline-card');
      if (ring.current) ring.current.classList.toggle('hover', !!interactive);
    };
    const loop = () => { rx += (mx - rx) * 0.18; ry += (my - ry) * 0.18; if (ring.current) ring.current.style.transform = `translate(${rx}px, ${ry}px)`; raf = requestAnimationFrame(loop); };
    document.body.classList.add('about-cursor-on');
    window.addEventListener('mousemove', onMove); loop();
    return () => { document.body.classList.remove('about-cursor-on'); window.removeEventListener('mousemove', onMove); cancelAnimationFrame(raf); };
  }, []);
  return (<><div ref={ring} className="cursor-ring" aria-hidden="true" /><div ref={dot} className="cursor-dot" aria-hidden="true" /></>);
}

/* ---------- Scroll progress ---------- */
function ScrollProgress() {
  const ref = useRef(null);
  useEffect(() => {
    const onScroll = () => { const h = document.documentElement; const max = h.scrollHeight - h.clientHeight; const p = max > 0 ? (h.scrollTop || document.body.scrollTop) / max : 0; if (ref.current) ref.current.style.transform = `scaleX(${p})`; };
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return <div ref={ref} className="scroll-progress" aria-hidden="true" />;
}

/* ---------- Split-text ---------- */
function SplitText({ text, className = '' }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => { const el = ref.current; if (!el) return; const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } }, { threshold: 0.3 }); io.observe(el); return () => io.disconnect(); }, []);
  const words = text.split(' '); let idx = 0;
  return (
    <span ref={ref} className={`split ${shown ? 'in' : ''} ${className}`} aria-label={text}>
      {words.map((word, wi) => (
        <span key={wi} className="split-word">
          {[...word].map((ch) => { const d = idx++; return <span key={d} className="split-char" style={{ transitionDelay: `${d * 28}ms` }}>{ch}</span>; })}
          {wi < words.length - 1 && <span className="split-char">&nbsp;</span>}
        </span>
      ))}
    </span>
  );
}

/* ---------- Reveal ---------- */
function Reveal({ children, className = '', delay = 0, as: Tag = 'div' }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => { const el = ref.current; if (!el) return; const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } }, { threshold: 0.15 }); io.observe(el); return () => io.disconnect(); }, []);
  return <Tag ref={ref} className={`reveal ${shown ? 'in' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }}>{children}</Tag>;
}

/* ---------- Count-up (supports live target updates) ---------- */
function CountUp({ to, suffix = '', duration = 1700 }) {
  const ref = useRef(null);
  const [val, setVal] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    let raf;
    const run = () => {
      const start = performance.now();
      const from = 0;
      const tick = (now) => { const p = Math.min((now - start) / duration, 1); const eased = 1 - Math.pow(1 - p, 3); setVal(from + (to - from) * eased); if (p < 1) raf = requestAnimationFrame(tick); };
      raf = requestAnimationFrame(tick);
    };
    if (started.current) { run(); return () => cancelAnimationFrame(raf); }
    const io = new IntersectionObserver(([e]) => { if (!e.isIntersecting) return; io.disconnect(); started.current = true; run(); }, { threshold: 0.5 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [to, duration]);
  const display = to % 1 === 0 ? Math.round(val) : val.toFixed(1);
  return <span ref={ref}>{display.toLocaleString('en-US')}{suffix}</span>;
}

/* ---------- 3D tilt card ---------- */
function TiltCard({ children, className = '' }) {
  const ref = useRef(null);
  const onEnter = useCallback(() => {
    const el = ref.current; if (!el) return;
    el.style.transition = 'transform .12s ease-out';
  }, []);
  const onMove = useCallback((e) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(900px) rotateY(${px * 16}deg) rotateX(${-py * 16}deg) translateY(-6px) scale(1.02)`;
    el.style.setProperty('--mx', `${(px + 0.5) * 100}%`); el.style.setProperty('--my', `${(py + 0.5) * 100}%`);
  }, []);
  const onLeave = useCallback(() => {
    const el = ref.current; if (!el) return;
    // longer, eased return so the card settles smoothly instead of snapping back
    el.style.transition = 'transform .6s cubic-bezier(.22,.61,.36,1)';
    el.style.transform = '';
  }, []);
  return <div ref={ref} className={`tilt-card ${className}`} onMouseEnter={onEnter} onMouseMove={onMove} onMouseLeave={onLeave}>{children}</div>;
}

/* ---------- Magnetic button ---------- */
function MagneticButton({ to, children, ghost }) {
  const ref = useRef(null);
  const onMove = (e) => { const el = ref.current; const r = el.getBoundingClientRect(); el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.35}px, ${(e.clientY - r.top - r.height / 2) * 0.5}px)`; };
  const onLeave = () => { ref.current.style.transform = ''; };
  return (<Link ref={ref} to={to} className={`btn ${ghost ? 'btn-ghost' : 'btn-primary'} btn-lg magnetic`} onMouseMove={onMove} onMouseLeave={onLeave}>{children}</Link>);
}

export function AboutPage() {
  const { lang } = useI18n();
  const [liveCount, setLiveCount] = useState(null);

  // Live data: real active-listings count from the API.
  useEffect(() => {
    api.listProperties({ limit: 1 }).then((d) => { if (d && typeof d.total === 'number') setLiveCount(d.total); }).catch(() => {});
  }, []);

  const features = [
    { icon: 'globe', t: 'Иммерсивные 360°-туры', d: 'Прогуляйтесь по квартире как в реальности — переходы между комнатами как в Street View.' },
    { icon: 'sparkles', t: 'Spatial Q&A', d: 'Спросите ИИ прямо про зону на панораме: что за материал, куда выходят окна.' },
    { icon: 'bot', t: 'ИИ-агент с инструментами', d: 'Ищет, сравнивает, добавляет в избранное и следит за ценой — настоящими действиями.' },
    { icon: 'shield', t: 'Честная AI-оценка', d: 'Каждый объект сверяется с рынком: выгодно, справедливо или подозрительно.' },
    { icon: 'map', t: 'Умная карта', d: 'Кластеры объектов, метро, школы и магазины рядом — всё на одной карте.' },
    { icon: 'scale', t: 'Сравнение и подбор', d: 'Подбор под ваш вкус на основе истории, избранного и понятных аргументов.' },
  ];
  const values = [
    { icon: 'eye', t: 'Прозрачность', d: 'Никаких скрытых комиссий и приукрашенных фото — только честный контекст.' },
    { icon: 'bulb', t: 'Технологии для людей', d: 'ИИ помогает решать, а не заменяет ваш выбор.' },
    { icon: 'heart', t: 'Забота о доме', d: 'Мы помогаем найти место, в которое хочется возвращаться.' },
  ];
  const timeline = [
    { year: '2023', t: 'Идея', ru: 'Идея', en: 'The idea', dru: 'Мы устали от плоских списков квартир и размытых фото. Решили показать жильё так, как оно есть.', den: 'Tired of flat listings and blurry photos, we set out to show homes as they really are.' },
    { year: '2024', t: '360° туры', ru: '360° туры', en: '360° tours', dru: 'Запустили иммерсивные туры с переходами между комнатами и спатиальные вопросы к ИИ.', den: 'Launched immersive tours with room navigation and spatial AI questions.' },
    { year: '2025', t: 'ИИ-агент', ru: 'ИИ-агент', en: 'AI agent', dru: 'Агент научился искать, сравнивать, бронировать и оценивать честность цены.', den: 'The agent learned to search, compare, book and judge price fairness.' },
    { year: '2026', t: 'Маркетплейс', ru: 'Маркетплейс', en: 'Marketplace', dru: 'Полноценные сделки онлайн: заявки, диалоги, оплата и трекеры цен в одном месте.', den: 'Full online deals: requests, chats, payments and price trackers in one place.' },
    { year: 'Next', t: 'Дальше', ru: 'Дальше', en: 'What\u2019s next', dru: 'Голосовой агент, тепловые карты цен и подбор ипотеки под объект.', den: 'Voice agent, price heatmaps and per-listing mortgage matching.' },
  ];
  const marquee = lang === 'ru'
    ? ['360° туры', 'ИИ-агент', 'Честные сделки', 'Spatial Q&A', 'Умная карта', 'Подбор с ИИ', 'Онлайн-оплата', 'Без комиссий']
    : ['360° tours', 'AI agent', 'Fair deals', 'Spatial Q&A', 'Smart map', 'AI matching', 'Online payment', 'No fees'];

  return (
    <div className="about-page">
      <ScrollProgress />
      <CursorFX />

      {/* ===== HERO ===== */}
      <section className="about-hero">
        <div className="about-hero-bg" aria-hidden="true"><Constellation /></div>
        <div className="container about-hero-layout">
          <div className="about-hero-inner">
            <div className="about-eyebrow reveal-now">
              <span className="pulse-dot" /> {lang === 'ru' ? 'О Nestora' : 'About Nestora'}
            </div>
            <h1 className="about-hero-title">
              <SplitText text={lang === 'ru' ? 'Недвижимость' : 'Real estate'} />
              <br /><em><SplitText text={lang === 'ru' ? 'видно насквозь' : 'you see through'} /></em>
            </h1>
            <Reveal delay={500}>
              <p className="about-hero-sub">
                {lang === 'ru'
                  ? 'Nestora — иммерсивный AI-маркетплейс недвижимости. 360°-туры, пространственные ответы ИИ и честные сделки в одном месте.'
                  : 'Nestora is an immersive AI real estate marketplace. 360° tours, spatial AI answers and fair deals in one place.'}
              </p>
            </Reveal>
            <Reveal delay={640} className="about-hero-cta">
              <MagneticButton to="/">{lang === 'ru' ? 'Открыть каталог' : 'Explore catalog'}</MagneticButton>
              <MagneticButton to="/map" ghost>{lang === 'ru' ? 'Смотреть карту' : 'View the map'}</MagneticButton>
            </Reveal>
          </div>

          <div className="about-hero-stage">
            <Suspense fallback={<div className="hero3d-loading" />}><Hero3D /></Suspense>
            <div className="about-hero-hint">
              <Icon name="repeat" size={15} />
              {lang === 'ru' ? 'Зажмите и вращайте дом' : 'Drag to rotate the house'}
            </div>
          </div>
        </div>
        <div className="about-scroll-hint" aria-hidden="true"><span /></div>
      </section>

      {/* ===== MARQUEE (never pauses) ===== */}
      <div className="about-marquee" aria-hidden="true">
        <div className="about-marquee-track">
          {[...marquee, ...marquee].map((m, i) => (
            <span key={i} className="about-marquee-item"><Icon name="sparkles" size={16} /> {m}</span>
          ))}
        </div>
      </div>

      {/* ===== STATS (live) ===== */}
      <section className="container about-stats-wrap">
        <div className="about-stats">
          <Reveal className="about-stat" delay={0}>
            <div className="about-stat-num"><CountUp to={liveCount ?? 55} suffix="+" /></div>
            <div className="about-stat-label">{lang === 'ru' ? 'Активных объектов' : 'Active listings'}{liveCount != null && <span className="about-live-dot" title="live" />}</div>
          </Reveal>
          {[
            { to: 360, suffix: '°', ru: 'Виртуальные туры', en: 'Virtual tours' },
            { to: 13, suffix: '', ru: 'Инструментов ИИ', en: 'AI agent tools' },
            { to: 100, suffix: '%', ru: 'Сделок онлайн', en: 'Deals online' },
          ].map((s, i) => (
            <Reveal key={i} className="about-stat" delay={(i + 1) * 90}>
              <div className="about-stat-num"><CountUp to={s.to} suffix={s.suffix} /></div>
              <div className="about-stat-label">{lang === 'ru' ? s.ru : s.en}</div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ===== MISSION (with magnetic dot grid behind) ===== */}
      <section className="about-mission-wrap">
        <DotGrid />
        <div className="container about-mission">
          <Reveal>
            <p className="about-mission-text">
              {lang === 'ru'
                ? <>Мы строим не очередной список квартир, а <mark>способ решить, где жить</mark>. Ходите по дому в 360°, спрашивайте ИИ про каждую зону и доверяйте честным оценкам цены.</>
                : <>We are not building yet another listing feed — we are building <mark>a way to decide where to live</mark>. Walk a home in 360°, ask the AI about every zone, and trust honest price reviews.</>}
            </p>
          </Reveal>
        </div>
      </section>

      {/* ===== FEATURES ===== */}
      <section className="container about-section">
        <Reveal><h2 className="about-h2">{lang === 'ru' ? 'Что внутри' : "What's inside"}</h2></Reveal>
        <div className="about-features about-3d-stage">
          {features.map((f, i) => (
            <Reveal key={i} delay={i * 70}>
              <TiltCard className="about-feature">
                <span className="about-feature-ic" data-depth><Icon name={f.icon} size={24} /></span>
                <h3 data-depth>{lang === 'ru' ? f.t : EN_FEAT[f.t]?.t || f.t}</h3>
                <p>{lang === 'ru' ? f.d : EN_FEAT[f.t]?.d || f.d}</p>
                <span className="about-feature-shine" aria-hidden="true" />
              </TiltCard>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ===== TIMELINE (horizontal scroll) ===== */}
      <section className="about-section about-timeline-section">
        <div className="container"><Reveal><h2 className="about-h2">{lang === 'ru' ? 'Наш путь' : 'Our journey'}</h2></Reveal></div>
        <div className="about-timeline-scroll">
          <div className="about-timeline-track">
            {timeline.map((s, i) => (
              <div key={i} className="about-timeline-card">
                <div className="about-timeline-year">{s.year}</div>
                <div className="about-timeline-line" aria-hidden="true"><span /></div>
                <h3>{lang === 'ru' ? s.ru : s.en}</h3>
                <p>{lang === 'ru' ? s.dru : s.den}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="container about-timeline-hint muted">
          <Icon name="arrow-right" size={15} /> {lang === 'ru' ? 'Прокрутите вбок' : 'Scroll sideways'}
        </div>
      </section>

      {/* ===== VALUES ===== */}
      <section className="container about-section">
        <Reveal><h2 className="about-h2">{lang === 'ru' ? 'Наши принципы' : 'Our principles'}</h2></Reveal>
        <div className="about-values">
          {values.map((v, i) => (
            <Reveal key={i} className="about-value" delay={i * 90}>
              <span className="about-value-ic"><Icon name={v.icon} size={20} /></span>
              <div>
                <h3>{lang === 'ru' ? v.t : EN_VAL[v.t]?.t || v.t}</h3>
                <p>{lang === 'ru' ? v.d : EN_VAL[v.t]?.d || v.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ===== FINAL CTA ===== */}
      <section className="container about-cta-section">
        <Reveal>
          <div className="about-cta-card">
            <div className="about-cta-grid" aria-hidden="true" />
            <h2>{lang === 'ru' ? 'Готовы найти свой дом?' : 'Ready to find your home?'}</h2>
            <p>{lang === 'ru' ? 'Откройте каталог или попросите ИИ-агента подобрать варианты под вас.' : 'Open the catalog or ask the AI agent to pick options for you.'}</p>
            <div className="about-cta-row">
              <MagneticButton to="/">{lang === 'ru' ? 'Перейти в каталог' : 'Go to catalog'}</MagneticButton>
              <MagneticButton to="/recommendations" ghost>{lang === 'ru' ? 'Подбор с ИИ' : 'AI recommendations'}</MagneticButton>
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}

const EN_FEAT = {
  'Иммерсивные 360°-туры': { t: 'Immersive 360° tours', d: 'Walk a home as if you were there — room-to-room transitions like Street View.' },
  'Spatial Q&A': { t: 'Spatial Q&A', d: 'Ask the AI about a zone on the panorama: what material, where the windows face.' },
  'ИИ-агент с инструментами': { t: 'AI agent with tools', d: 'Searches, compares, saves to favorites and tracks prices — with real actions.' },
  'Честная AI-оценка': { t: 'Honest AI review', d: 'Every listing is checked against the market: great deal, fair or suspicious.' },
  'Умная карта': { t: 'Smart map', d: 'Property clusters, metro, schools and shops nearby — all on one map.' },
  'Сравнение и подбор': { t: 'Compare & match', d: 'Recommendations tuned to your taste from history, favorites and clear reasons.' },
};
const EN_VAL = {
  'Прозрачность': { t: 'Transparency', d: 'No hidden fees or dressed-up photos — just honest context.' },
  'Технологии для людей': { t: 'Tech for people', d: 'AI helps you decide, it does not replace your choice.' },
  'Забота о доме': { t: 'Care for home', d: 'We help you find a place worth coming back to.' },
};
