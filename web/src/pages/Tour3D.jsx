import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';
import { Icon } from '../lib/icons.jsx';

/* ============================================================
   3D tour page — embeds the rebuilt WebGL (Three.js) viewer.

   The viewer is served as a standalone page at /tour3d.html?base=<folder>.
   We fetch the tour info (api.get3dTour) to obtain the public base folder and
   the viewer_url, then embed it in an iframe wrapped in Nestora chrome. A
   deep-linked ?room=<id> is forwarded so a shared link opens at that sweep.
   ============================================================ */
export function Tour3DPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [search] = useSearchParams();
  const { lang } = useI18n();
  const L = (ru, en) => (lang === 'ru' ? ru : en);

  const [status, setStatus] = useState('loading');   // loading | ready | error
  const [title, setTitle] = useState('');
  const [src, setSrc] = useState('');
  const [frameReady, setFrameReady] = useState(false);

  useEffect(() => {
    let alive = true;
    api.get3dTour(id)
      .then((d) => {
        if (!alive) return;
        // Prefer the backend-provided viewer_url (/tour3d.html?base=<base>).
        let url = d.viewer_url || (d.base ? `/tour3d.html?base=${encodeURIComponent(d.base)}` : '');
        const room = search.get('room');
        if (url && room) url += (url.includes('?') ? '&' : '?') + `room=${encodeURIComponent(room)}`;
        if (!url) { setStatus('error'); return; }
        setSrc(url);
        setStatus('ready');
      })
      .catch(() => { if (alive) setStatus('error'); });
    api.getProperty(id).then((p) => { if (alive && p) setTitle(p.title || ''); }).catch(() => {});
    return () => { alive = false; };
  }, [id, search]);

  // Go BACK in history (pop the 3D-tour entry) instead of pushing the property
  // URL again — otherwise history becomes …→property→3D→property and pressing
  // Back on the property page bounces you straight back into 3D.
  const goBack = () => {
    if (window.history.length > 1) nav(-1);
    else nav(`/properties/${id}`, { replace: true });
  };

  return (
    <div className="t3d-stage t3d-branded">
      <div className="t3d-topbar">
        <button className="t3d-back" onClick={goBack}>
          <Icon name="arrow-left" size={16} /> {L('К объекту', 'Back')}
        </button>
        <div className="t3d-titlewrap">
          <span className="t3d-eyebrow">{L('3D-тур', '3D tour')}</span>
          {title && <span className="t3d-title">{title}</span>}
        </div>
        <div className="t3d-topbar-spacer" />
      </div>

      <div className="t3d-frame">
        {status === 'loading' && (
          <div className="t3d-overlay-center"><div className="boot-spinner" /><div style={{ marginTop: 14 }}>{L('Загрузка тура…', 'Loading tour…')}</div></div>
        )}
        {status === 'error' && (
          <div className="t3d-overlay-center">
            <Icon name="alert" size={48} />
            <h3 style={{ margin: '12px 0 6px' }}>{L('Тур недоступен', 'Tour unavailable')}</h3>
            <button className="btn btn-primary mt-16" onClick={() => nav(`/properties/${id}`)}>{L('К объекту', 'To listing')}</button>
          </div>
        )}
        {status === 'ready' && (
          <>
            {!frameReady && (
              <div className="t3d-overlay-center"><div className="boot-spinner" /><div style={{ marginTop: 14 }}>{L('Открываем 3D…', 'Opening 3D…')}</div></div>
            )}
            <iframe
              title="3D Tour"
              className={`t3d-iframe ${frameReady ? 'in' : ''}`}
              src={src}
              onLoad={() => setFrameReady(true)}
              allow="xr-spatial-tracking; gyroscope; accelerometer; fullscreen; vr"
              allowFullScreen
            />
          </>
        )}
      </div>
    </div>
  );
}
