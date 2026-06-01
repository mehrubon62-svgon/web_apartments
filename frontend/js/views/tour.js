// ============================================================
// 360° Tour view — Pannellum + Spatial Q&A zone selection
// ============================================================
import { h, esc, toast, modal, loadingBlock } from '../ui.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { navigate } from '../router.js';
import { mountContent } from '../components.js';

let viewer = null;
let spatialUnsub = null;

export async function renderTour(params, query) {
  const id = Number(params.id);
  const stage = h('div', { class: 'tour-stage' }, loadingBlock());
  const content = h('div', {}, stage);
  mountContent(content);

  let config, tour, prop;
  try {
    [config, tour, prop] = await Promise.all([
      api.pannellum(id),
      api.getTour(id).catch(() => null),
      api.getProperty(id).catch(() => null),
    ]);
  } catch (e) {
    stage.innerHTML = '';
    stage.appendChild(h('div', { style: { display: 'grid', placeContent: 'center', height: '100%', color: '#fff', textAlign: 'center' } }, [
      h('div', { style: { fontSize: '50px' }, text: '🌐' }),
      h('h3', { style: { margin: '12px 0' }, text: 'Тур недоступен' }),
      h('p', { style: { opacity: 0.7 }, text: e.message }),
      h('button', { class: 'btn btn-primary mt-16', text: '← К объекту', onClick: () => navigate(`/properties/${id}`) }),
    ]));
    return cleanup;
  }

  stage.innerHTML = '';
  const pano = h('div', { id: 'panorama' });
  stage.appendChild(pano);

  // Toolbar
  let zoneMode = false;
  const askBtn = h('button', { html: '🔍 Спросить про зону', title: 'Spatial Q&A' });
  const toolbar = h('div', { class: 'tour-toolbar' }, [
    h('button', { html: '← Объект', onClick: () => navigate(`/properties/${id}`) }),
    askBtn,
    h('button', { html: '🔗 Поделиться', onClick: () => shareTour(id) }),
  ]);
  stage.appendChild(toolbar);

  // Room nav
  const rooms = (tour && tour.rooms) || [];
  const roomBar = h('div', { class: 'tour-rooms' });
  rooms.forEach((r) => {
    const b = h('button', { text: r.name || r.id, dataset: { room: r.id }, onClick: () => { if (viewer) viewer.loadScene(r.id); } });
    roomBar.appendChild(b);
  });
  if (rooms.length > 1) stage.appendChild(roomBar);

  // Init Pannellum
  if (!window.pannellum) {
    toast('Не удалось загрузить просмотрщик 360°', 'err');
    return cleanup;
  }
  viewer = window.pannellum.viewer('panorama', config);

  const startRoom = query.room || (tour && tour.first_room_id);
  if (startRoom) { try { viewer.loadScene(startRoom); } catch {} }

  viewer.on('scenechange', (sceneId) => {
    roomBar.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.room === sceneId));
  });
  // highlight initial
  setTimeout(() => {
    const cur = viewer.getScene && viewer.getScene();
    roomBar.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.room === cur));
  }, 300);

  // ---- Spatial Q&A zone selection ----
  askBtn.addEventListener('click', () => {
    zoneMode = !zoneMode;
    askBtn.classList.toggle('active', zoneMode);
    pano.classList.toggle('zone-selecting', zoneMode);
    askBtn.innerHTML = zoneMode ? '✕ Отменить выбор' : '🔍 Спросить про зону';
    if (zoneMode) toast('Выделите прямоугольную зону на панораме', 'info');
  });

  let drag = null;
  let rectEl = null;
  pano.addEventListener('mousedown', (e) => {
    if (!zoneMode) return;
    const rect = pano.getBoundingClientRect();
    drag = { x0: e.clientX - rect.left, y0: e.clientY - rect.top, rect };
    rectEl = h('div', { class: 'zone-rect' });
    stage.appendChild(rectEl);
  });
  window.addEventListener('mousemove', onMove);
  function onMove(e) {
    if (!drag || !rectEl) return;
    const x = e.clientX - drag.rect.left, y = e.clientY - drag.rect.top;
    const left = Math.min(x, drag.x0), top = Math.min(y, drag.y0);
    const w = Math.abs(x - drag.x0), ht = Math.abs(y - drag.y0);
    Object.assign(rectEl.style, { left: left + 'px', top: top + 'px', width: w + 'px', height: ht + 'px' });
  }
  window.addEventListener('mouseup', onUp);
  function onUp(e) {
    if (!drag || !rectEl) { drag = null; return; }
    const r = drag.rect;
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const left = Math.min(x, drag.x0), top = Math.min(y, drag.y0);
    const w = Math.abs(x - drag.x0), ht = Math.abs(y - drag.y0);
    const d = drag; drag = null;
    if (w < 24 || ht < 24) { rectEl.remove(); rectEl = null; return; }

    const coords = {
      x: +(left / r.width).toFixed(4), y: +(top / r.height).toFixed(4),
      w: +(w / r.width).toFixed(4), h: +(ht / r.height).toFixed(4),
    };
    // clamp
    coords.w = Math.min(coords.w, 1 - coords.x) || 0.01;
    coords.h = Math.min(coords.h, 1 - coords.y) || 0.01;

    const curScene = viewer.getScene ? viewer.getScene() : null;
    captureZone(pano).then((imgB64) => {
      openSpatialModal(id, curScene, coords, imgB64);
    });

    rectEl.remove(); rectEl = null;
    zoneMode = false; askBtn.classList.remove('active'); pano.classList.remove('zone-selecting');
    askBtn.innerHTML = '🔍 Спросить про зону';
  }

  cleanup._extra = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };

  return cleanup;
}

async function captureZone(pano) {
  // Try to grab the WebGL canvas as a screenshot. Best-effort.
  try {
    const canvas = pano.querySelector('canvas');
    if (!canvas) return null;
    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
    return dataUrl.split(',')[1] || null;
  } catch {
    return null;
  }
}

function openSpatialModal(propertyId, roomId, coords, imgB64) {
  if (!store.user) { toast('Войдите, чтобы задавать вопросы', 'info'); navigate('/auth'); return; }
  const q = h('textarea', { class: 'textarea', placeholder: 'Например: из какого материала эта стена? Какие примерные размеры окна?' });
  const send = h('button', { class: 'btn btn-primary', text: 'Спросить ИИ' });
  const answerBox = h('div', {});

  const m = modal({
    title: '🔍 Spatial Q&A',
    body: h('div', {}, [
      h('p', { class: 'muted mb-8', text: 'Вопрос про выделенную зону панорамы. Ответит ИИ (vision), это займёт несколько секунд.' }),
      h('div', { class: 'field' }, [h('label', { text: 'Ваш вопрос' }), q]),
      answerBox,
    ]),
    footer: [send],
  });

  send.addEventListener('click', async () => {
    if (q.value.trim().length < 1) return toast('Введите вопрос', 'err');
    send.disabled = true; send.innerHTML = ''; send.appendChild(h('div', { class: 'spinner-sm' }));
    try {
      const qa = await api.askSpatial({
        property_id: propertyId, room_id: roomId, zone_coords: coords,
        question: q.value.trim(), image_b64: imgB64 || null,
      });
      answerBox.innerHTML = '';
      answerBox.appendChild(h('div', { class: 'card card-pad', style: { background: 'var(--surface-2)' } }, [
        h('div', { class: 'typing', id: 'sp-typing' }, [h('span'), h('span'), h('span')]),
        h('span', { class: 'muted', style: { marginLeft: '8px' }, text: 'ИИ анализирует зону...' }),
      ]));
      pollSpatial(qa.id, answerBox);
      send.style.display = 'none';
    } catch (e) {
      toast(e.message, 'err');
      send.disabled = false; send.textContent = 'Спросить ИИ';
    }
  });
}

async function pollSpatial(qaId, box) {
  // Listen on realtime first, fall back to polling.
  let done = false;
  const finish = (qa) => {
    if (done) return; done = true;
    if (spatialUnsub) { spatialUnsub(); spatialUnsub = null; }
    box.innerHTML = '';
    if (qa.status === 'done' && qa.answer) {
      box.appendChild(h('div', { class: 'card card-pad', style: { background: 'var(--accent-soft)' } }, [
        h('div', { style: { fontWeight: '700', marginBottom: '6px' }, html: '🤖 Ответ ИИ' }),
        h('p', { style: { margin: 0, whiteSpace: 'pre-wrap', lineHeight: '1.6' }, text: qa.answer }),
      ]));
    } else {
      box.appendChild(h('div', { class: 'card card-pad muted', text: qa.answer || 'Не удалось получить ответ. Проверьте, что ИИ настроен.' }));
    }
  };

  spatialUnsub = store.on('spatial:done', (data) => {
    if (data && Number(data.id) === Number(qaId)) {
      api.spatialOne(qaId).then(finish).catch(() => {});
    }
  });

  let tries = 0;
  const timer = setInterval(async () => {
    tries++;
    try {
      const qa = await api.spatialOne(qaId);
      if (qa.status !== 'pending') { clearInterval(timer); finish(qa); }
    } catch {}
    if (tries > 30) { clearInterval(timer); if (!done) finish({ status: 'error', answer: 'Превышено время ожидания.' }); }
  }, 2000);
}

async function shareTour(id) {
  try {
    const scene = viewer && viewer.getScene ? viewer.getScene() : null;
    const r = await api.shareRoom(id, scene || '');
    await navigator.clipboard.writeText(r.url);
    toast('Ссылка скопирована', 'ok');
  } catch (e) {
    toast('Не удалось поделиться', 'err');
  }
}

function cleanup() {
  if (cleanup._extra) { try { cleanup._extra(); } catch {} cleanup._extra = null; }
  if (spatialUnsub) { spatialUnsub(); spatialUnsub = null; }
  if (viewer) { try { viewer.destroy(); } catch {} viewer = null; }
}
