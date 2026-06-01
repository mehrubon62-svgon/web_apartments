import { useEffect } from 'react';
import { Icon } from '../lib/icons.jsx';
import { initials, mediaUrl } from '../lib/format.js';

export function Spinner({ big }) {
  return <div className="loading-row"><div className="boot-spinner" style={big ? {} : { width: 28, height: 28 }} /></div>;
}

export function SkeletonGrid({ n = 8 }) {
  return <div className="grid grid-props">{Array.from({ length: n }).map((_, i) => <div key={i} className="skel skel-card" />)}</div>;
}

export function Empty({ icon = 'inbox', title, sub, action }) {
  return (
    <div className="empty">
      <div className="emoji"><Icon name={icon} size={52} /></div>
      <h3>{title}</h3>
      {sub && <p>{sub}</p>}
      {action}
    </div>
  );
}

export function Avatar({ user, size = 40 }) {
  const url = user?.avatar_url ? mediaUrl(user.avatar_url) : null;
  if (url) return <img className="avatar" src={url} style={{ width: size, height: size }} alt="" />;
  return (
    <div className="avatar" style={{ width: size, height: size, display: 'grid', placeContent: 'center', fontWeight: 800, color: 'var(--brand)', fontSize: size * 0.38 }}>
      {initials(user?.full_name, user?.email)}
    </div>
  );
}

export function Stars({ rating, size = 15, interactive, onPick }) {
  return (
    <span className="star-row">
      {[1, 2, 3, 4, 5].map((i) => (
        interactive
          ? <button key={i} type="button" className={`star-btn ${i <= rating ? 'on' : ''}`} onClick={() => onPick(i)}>
              <Icon name={i <= rating ? 'star' : 'star-outline'} size={size} />
            </button>
          : <Icon key={i} name={i <= rating ? 'star' : 'star-outline'} size={size} />
      ))}
    </span>
  );
}

export function Modal({ title, onClose, children, footer, large }) {
  useEffect(() => {
    const onEsc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);
  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${large ? 'modal-lg' : ''}`}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose}><Icon name="close" /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
