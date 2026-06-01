import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApp } from '../lib/store.jsx';
import { useToast } from '../lib/toast.jsx';
import { Icon } from '../lib/icons.jsx';
import { Spinner, Modal } from '../components/Common.jsx';

export function TourPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { user } = useApp();
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
  function onMouseUp(e) {
    if (!drag.current) return;
    const { x0, y0, r } = drag.current; drag.current = null;
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const left = Math.min(x, x0), top = Math.min(y, y0), w = Math.abs(x - x0), h = Math.abs(y - y0);
    setRect(null); setZoneMode(false);
    if (w < 24 || h < 24) return;
    if (!user) { toast('Войдите, чтобы задавать вопросы', 'info'); nav('/auth'); return; }
    const coords = { x: +(left / r.width).toFixed(4), y: +(top / r.height).toFixed(4), w: +(w / r.width).toFixed(4), h: +(h / r.height).toFixed(4) };
    coords.w = Math.min(coords.w, 1 - coords.x) || 0.01; coords.h = Math.min(coords.h, 1 - coords.y) || 0.01;
    let imgB64 = null;
    try { const c = panoRef.current.querySelector('canvas'); if (c) imgB64 = c.toDataURL('image/jpeg', 0.7).split(',')[1]; } catch {}
    const room = viewerRef.current?.getScene ? viewerRef.current.getScene() : null;
    setSpatial({ coords, room, imgB64 });
  }

  async function share() {
    try { const room = viewerRef.current?.getScene ? viewerRef.current.getScene() : ''; const r = await api.shareRoom(id, room || ''); await navigator.clipboard.writeText(r.url); toast('Ссылка скопирована', 'ok'); }
    catch { toast('Не удалось поделиться', 'err'); }
  }

  const rooms = (tour && tour.rooms) || [];
  return (
    <div className="tour-stage">
      <div id="panorama" ref={panoRef} className={zoneMode ? 'zone-selecting' : ''} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} />
      {tour === undefined && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center' }}><Spinner big /></div>}
      {rect && <div className="zone-rect" style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }} />}
      <div className="tour-toolbar">
        <button onClick={() => nav(`/properties/${id}`)}><Icon name="arrow-left" /> Объект</button>
        <button className={zoneMode ? 'active' : ''} onClick={() => setZoneMode(!zoneMode)}><Icon name="search" /> {zoneMode ? 'Отменить' : 'Спросить про зону'}</button>
        <button onClick={share}><Icon name="link" /> Поделиться</button>
      </div>
      {rooms.length > 1 && (
        <div className="tour-rooms">
          {rooms.map((r) => <button key={r.id} onClick={() => viewerRef.current && viewerRef.current.loadScene(r.id)}>{r.name || r.id}</button>)}
        </div>
      )}
      {spatial && <SpatialModal propertyId={id} info={spatial} onClose={() => setSpatial(null)} />}
    </div>
  );
}

function SpatialModal({ propertyId, info, onClose }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState(null);
  const [pending, setPending] = useState(false);

  async function ask() {
    if (!q.trim()) return toast('Введите вопрос', 'err');
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
      if (tries > 30) done({ status: 'error', answer: 'Превышено время ожидания.' });
    }
    function done(qa) { clearInterval(timer); window.removeEventListener('nestora:rt', onRt); setPending(false); setAnswer(qa.answer || 'Не удалось получить ответ.'); }
  }

  return (
    <Modal title="Spatial Q&A" onClose={onClose} footer={!answer && !pending ? <button className="btn btn-primary" onClick={ask} disabled={busy}>{busy ? <span className="spinner-sm" /> : 'Спросить ИИ'}</button> : null}>
      <p className="muted mb-8">Вопрос про выделенную зону. Ответит ИИ (vision), это займёт несколько секунд.</p>
      {!answer && <div className="field"><label>Ваш вопрос</label><textarea className="textarea" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Например: из какого материала эта стена?" /></div>}
      {pending && <div className="card card-pad" style={{ background: 'var(--surface-2)' }}><span className="typing"><span /><span /><span /></span> <span className="muted">ИИ анализирует зону...</span></div>}
      {answer && <div className="card card-pad" style={{ background: 'var(--accent-soft)' }}><div style={{ fontWeight: 700, marginBottom: 6 }}><Icon name="bot" /> Ответ ИИ</div><p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{answer}</p></div>}
    </Modal>
  );
}
