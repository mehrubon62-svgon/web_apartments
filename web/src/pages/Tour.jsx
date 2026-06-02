import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApp } from '../lib/store.jsx';
import { useToast } from '../lib/toast.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { Icon } from '../lib/icons.jsx';
import { Spinner, Modal } from '../components/Common.jsx';

export function TourPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { user } = useApp();
  const { lang } = useI18n();
  const [sp] = useSearchParams();
  const panoRef = useRef(null);
  const viewerRef = useRef(null);
  const [tour, setTour] = useState(undefined);
  const [err, setErr] = useState(null);
  const [zoneMode, setZoneMode] = useState(false);
  const [spatial, setSpatial] = useState(null);
  const drag = useRef(null);
  const [rect, setRect] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.pannellum(id), api.getTour(id).catch(() => null)])
      .then(([config, t]) => {
        if (cancelled) return;
        setTour(t);
        if (window.pannellum && panoRef.current) {
          viewerRef.current = window.pannellum.viewer(panoRef.current, config);
          const start = sp.get('room') || (t && t.first_room_id);
          if (start) { try { viewerRef.current.loadScene(start); } catch {} }
        }
      })
      .catch((e) => setErr(e.message));
    return () => { cancelled = true; if (viewerRef.current) { try { viewerRef.current.destroy(); } catch {} } };
  }, [id]);

  if (err) return (
    <div className="tour-stage">
      <div style={{ display: 'grid', placeContent: 'center', height: '100%', color: '#fff', textAlign: 'center' }}>
        <div><Icon name="globe" size={50} /></div>
        <h3 style={{ margin: '12px 0' }}>Тур недоступен</h3>
        <p style={{ opacity: 0.7 }}>{err}</p>
        <button className="btn btn-primary mt-16" onClick={() => nav(`/properties/${id}`)}>К объекту</button>
      </div>
    </div>
  );

  function onMouseDown(e) {
    if (!zoneMode) return;
    const r = panoRef.current.getBoundingClientRect();
    drag.current = { x0: e.clientX - r.left, y0: e.clientY - r.top, r };
  }
  function onMouseMove(e) {
    if (!drag.current) return;
    const { x0, y0, r } = drag.current;
    const x = e.clientX - r.left, y = e.clientY - r.top;
    setRect({ left: Math.min(x, x0), top: Math.min(y, y0), width: Math.abs(x - x0), height: Math.abs(y - y0) });
  }
  // Crop the zone from the ORIGINAL equirectangular panorama image (not the
  // WebGL canvas, which captures as black). We map the on-screen selection to
  // yaw/pitch using the live camera, then to pixels on the source image. This
  // gives the AI real pixels of exactly the outlined zone.
  function currentRoom() {
    const id = viewerRef.current?.getScene ? viewerRef.current.getScene() : null;
    const list = (tour && tour.rooms) || [];
    return list.find((r) => r.id === id) || list[0] || null;
  }
  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }
  async function cropZone(left, top, w, h, r) {
    const room = currentRoom();
    const v = viewerRef.current;
    if (!room || !room.media_url || !v) return null;
    try {
      const yaw0 = v.getYaw(), pitch0 = v.getPitch(), hfov = v.getHfov();
      const W = r.width, H = r.height;
      const vfov = hfov * H / W;                       // approx vertical FOV
      // selection edges -> yaw/pitch (degrees)
      const yawL = yaw0 + (left - W / 2) / W * hfov;
      const yawR = yaw0 + (left + w - W / 2) / W * hfov;
      const pitchT = pitch0 - (top - H / 2) / H * vfov;
      const pitchB = pitch0 - (top + h - H / 2) / H * vfov;
      const img = await loadImage(room.media_url);
      const IW = img.naturalWidth, IH = img.naturalHeight;
      const wrap = (deg) => ((deg + 180) % 360 + 360) % 360;   // -> [0,360)
      let uL = wrap(yawL) / 360 * IW;
      let uR = wrap(yawR) / 360 * IW;
      const vT = Math.max(0, Math.min(IH, (90 - pitchT) / 180 * IH));
      const vB = Math.max(0, Math.min(IH, (90 - pitchB) / 180 * IH));
      const sy = Math.min(vT, vB), sh = Math.max(8, Math.abs(vB - vT));
      const tmp = document.createElement('canvas');
      const ch = Math.min(420, Math.max(80, Math.round(sh)));
      // handle horizontal wraparound of the equirectangular seam
      if (uR < uL) uR += IW;
      const sw = Math.max(8, Math.round(uR - uL));
      const cw = Math.min(640, Math.max(80, sw));
      tmp.width = cw; tmp.height = ch;
      const ctx = tmp.getContext('2d');
      if (uL + sw <= IW) {
        ctx.drawImage(img, uL, sy, sw, sh, 0, 0, cw, ch);
      } else {
        // spans the seam: draw in two parts
        const first = IW - uL;
        const ratio = first / sw;
        ctx.drawImage(img, uL, sy, first, sh, 0, 0, cw * ratio, ch);
        ctx.drawImage(img, 0, sy, sw - first, sh, cw * ratio, 0, cw * (1 - ratio), ch);
      }
      return tmp.toDataURL('image/jpeg', 0.85).split(',')[1];
    } catch {
      return null;
    }
  }
  async function onMouseUp(e) {
    if (!drag.current) return;
    const { x0, y0, r } = drag.current; drag.current = null;
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const left = Math.min(x, x0), top = Math.min(y, y0), w = Math.abs(x - x0), h = Math.abs(y - y0);
    setRect(null); setZoneMode(false);
    if (w < 24 || h < 24) return;
    if (!user) { toast('Войдите, чтобы задавать вопросы', 'info'); nav('/auth'); return; }
    const coords = { x: +(left / r.width).toFixed(4), y: +(top / r.height).toFixed(4), w: +(w / r.width).toFixed(4), h: +(h / r.height).toFixed(4) };
    coords.w = Math.min(coords.w, 1 - coords.x) || 0.01; coords.h = Math.min(coords.h, 1 - coords.y) || 0.01;
    const room = viewerRef.current?.getScene ? viewerRef.current.getScene() : null;
    // open modal immediately, attach the cropped image when ready
    setSpatial({ coords, room, imgB64: null, cropping: true });
    const imgB64 = await cropZone(left, top, w, h, r);
    setSpatial((s) => (s ? { ...s, imgB64, cropping: false } : s));
  }

  async function share() {
    try { const room = viewerRef.current?.getScene ? viewerRef.current.getScene() : ''; const r = await api.shareRoom(id, room || ''); await navigator.clipboard.writeText(r.url); toast('Ссылка скопирована', 'ok'); }
    catch { toast('Не удалось поделиться', 'err'); }
  }

  const rooms = (tour && tour.rooms) || [];
  return (
    <div className="tour-stage">
      <div id="panorama" ref={panoRef} />
      {/* Capture overlay sits ABOVE the panorama in zone mode so drags select a
          rectangle instead of rotating the view. */}
      {zoneMode && (
        <div className="zone-capture" onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>
          <div className="zone-hint">{rect ? '' : (lang === 'ru' ? 'Выделите зону — потяните рамку' : 'Drag to outline a zone')}</div>
          {rect && <div className="zone-rect" style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }} />}
        </div>
      )}
      {tour === undefined && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center' }}><Spinner big /></div>}
      <div className="tour-toolbar">
        <button onClick={() => nav(`/properties/${id}`)}><Icon name="arrow-left" /> {lang === 'ru' ? 'Объект' : 'Listing'}</button>
        <button className={zoneMode ? 'active' : ''} onClick={() => { setRect(null); setZoneMode(!zoneMode); }}><Icon name="search" /> {zoneMode ? (lang === 'ru' ? 'Отменить' : 'Cancel') : (lang === 'ru' ? 'Спросить про зону' : 'Ask about a zone')}</button>
        <button onClick={share}><Icon name="link" /> {lang === 'ru' ? 'Поделиться' : 'Share'}</button>
      </div>
      {rooms.length > 1 && (
        <div className="tour-rooms">
          {rooms.map((r) => <button key={r.id} onClick={() => viewerRef.current && viewerRef.current.loadScene(r.id)}>{r.name || r.id}</button>)}
        </div>
      )}
      {spatial && <SpatialModal propertyId={id} info={spatial} lang={lang} onClose={() => setSpatial(null)} />}
    </div>
  );
}

function SpatialModal({ propertyId, info, lang = 'ru', onClose }) {
  const toast = useToast();
  const L = (ru, en) => (lang === 'ru' ? ru : en);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState(null);
  const [pending, setPending] = useState(false);

  async function ask() {
    if (!q.trim()) return toast(L('Введите вопрос', 'Enter a question'), 'err');
    if (info.cropping) return toast(L('Подождите, готовлю фрагмент…', 'Preparing the crop…'), 'info');
    setBusy(true); setPending(true);
    try {
      const qa = await api.askSpatial({ property_id: Number(propertyId), room_id: info.room, zone_coords: info.coords, question: q.trim(), image_b64: info.imgB64 || null });
      poll(qa.id);
    } catch (e) { toast(e.message, 'err'); setBusy(false); setPending(false); }
  }
  function poll(qaId) {
    let tries = 0;
    const onRt = (e) => { if (e.detail?.event === 'spatial_qa:done' && Number(e.detail.data?.id) === qaId) check(); };
    window.addEventListener('nestora:rt', onRt);
    const timer = setInterval(check, 2000);
    async function check() {
      tries++;
      try { const qa = await api.spatialOne(qaId); if (qa.status !== 'pending') { done(qa); } } catch {}
      if (tries > 30) done({ status: 'error', answer: L('Превышено время ожидания.', 'Request timed out.') });
    }
    function done(qa) { clearInterval(timer); window.removeEventListener('nestora:rt', onRt); setPending(false); setAnswer(qa.answer || L('Не удалось получить ответ.', 'Could not get an answer.')); }
  }

  const suggestions = lang === 'ru'
    ? ['Из какого материала это сделано?', 'В каком это состоянии?', 'Сколько примерно стоит заменить?', 'Это качественная отделка?']
    : ['What material is this?', 'What condition is it in?', 'Roughly how much to replace?', 'Is this a quality finish?'];

  return (
    <Modal title="Spatial Q&A" onClose={onClose} footer={!answer && !pending ? <button className="btn btn-primary" onClick={ask} disabled={busy}>{busy ? <span className="spinner-sm" /> : L('Спросить ИИ', 'Ask AI')}</button> : null}>
      <div className="row" style={{ gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
        {info.imgB64
          ? <img className="zone-thumb" src={`data:image/jpeg;base64,${info.imgB64}`} alt="zone" />
          : <div className="zone-thumb zone-thumb-ph">{info.cropping ? <span className="spinner-sm" style={{ borderColor: 'var(--line)', borderTopColor: 'var(--brand)' }} /> : <Icon name="image" />}</div>}
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>{L('Вопрос про выделенную зону. ИИ (vision) посмотрит именно на этот фрагмент.', 'A question about the outlined zone. The AI (vision) will look at exactly this crop.')}</p>
      </div>
      {!answer && <div className="field"><label>{L('Ваш вопрос', 'Your question')}</label><textarea className="textarea" value={q} onChange={(e) => setQ(e.target.value)} placeholder={L('Например: из какого материала эта стена?', 'E.g.: what material is this wall?')} /></div>}
      {!answer && !pending && (
        <div className="row wrap" style={{ gap: 6, marginBottom: 4 }}>
          {suggestions.map((s) => <button key={s} className="chip" onClick={() => setQ(s)}>{s}</button>)}
        </div>
      )}
      {pending && <div className="card card-pad" style={{ background: 'var(--surface-2)' }}><span className="typing"><span /><span /><span /></span> <span className="muted">{L('ИИ анализирует зону...', 'AI is analyzing the zone...')}</span></div>}
      {answer && <div className="card card-pad" style={{ background: 'var(--accent-soft)' }}><div style={{ fontWeight: 700, marginBottom: 6 }}><Icon name="bot" /> {L('Ответ ИИ', 'AI answer')}</div><p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{answer}</p></div>}
    </Modal>
  );
}
