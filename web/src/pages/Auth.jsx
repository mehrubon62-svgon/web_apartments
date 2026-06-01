import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApp } from '../lib/store.jsx';
import { useToast } from '../lib/toast.jsx';
import { Icon } from '../lib/icons.jsx';
import { Modal } from '../components/Common.jsx';

export function AuthPage() {
  const nav = useNavigate();
  const toast = useToast();
  const { loadUser } = useApp();
  const [sp] = useSearchParams();
  const [mode, setMode] = useState(sp.get('mode') === 'register' ? 'register' : 'login');
  const [role, setRole] = useState('buyer');
  const gbtnRef = useRef(null);

  useEffect(() => { if (api.isAuthed()) nav('/'); }, []);

  async function onAuthed() { await loadUser(); nav('/'); }

  // Google button
  useEffect(() => {
    const cid = api.config.googleClientId;
    if (!cid || !gbtnRef.current) return;
    const cb = (resp) => api.google({ id_token: resp.credential, role })
      .then((tk) => { api.tokens.set(tk); onAuthed(); })
      .catch((e) => toast(e.message, 'err'));
    function init() {
      if (!window.google?.accounts) return false;
      window.google.accounts.id.initialize({ client_id: cid, callback: cb });
      gbtnRef.current.innerHTML = '';
      window.google.accounts.id.renderButton(gbtnRef.current, { theme: 'outline', size: 'large', width: 360, text: 'continue_with' });
      return true;
    }
    if (!init()) {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.defer = true; s.onload = init;
      document.head.appendChild(s);
    }
  }, [role, mode]);

  return (
    <div className="auth-wrap">
      <AuthHero />
      <div className="auth-panel">
        <div className="auth-card">
          <a className="logo" href="#/" style={{ marginBottom: 24, fontSize: 26 }}>
            <span className="dot"><Icon name="logo" size={26} /></span>
            <span className="wm"><b>Nest</b><i>o</i><b>ra</b></span>
          </a>
          <div className="auth-tabs">
            <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Вход</button>
            <button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Регистрация</button>
          </div>
          {mode === 'login'
            ? <LoginForm onAuthed={onAuthed} gbtnRef={gbtnRef} />
            : <RegisterForm role={role} setRole={setRole} onAuthed={onAuthed} gbtnRef={gbtnRef} />}
        </div>
      </div>
    </div>
  );
}

function LoginForm({ onAuthed, gbtnRef }) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [codeModal, setCodeModal] = useState(false);
  const [resetModal, setResetModal] = useState(false);

  async function submit(e) {
    e.preventDefault(); setBusy(true);
    try { const tk = await api.login({ email: email.trim(), password }); api.tokens.set(tk); onAuthed(); }
    catch (err) { toast(err.message, 'err'); setBusy(false); }
  }

  return (
    <form onSubmit={submit}>
      <h1 style={{ fontSize: 26, marginBottom: 6 }}>С возвращением</h1>
      <p className="muted" style={{ marginBottom: 22 }}>Войдите, чтобы продолжить поиск жилья</p>
      <div className="field"><label>Email</label><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
      <div className="field"><label>Пароль</label><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
      <div className="row-between" style={{ marginBottom: 8 }}>
        <span />
        <a href="#" className="muted" style={{ fontSize: 13, fontWeight: 600 }} onClick={(e) => { e.preventDefault(); setResetModal(true); }}>Забыли пароль?</a>
      </div>
      <button className="btn btn-primary btn-block btn-lg" disabled={busy}>{busy ? <span className="spinner-sm" /> : 'Войти'}</button>
      <div style={{ marginTop: 12, textAlign: 'center' }}>
        <a href="#" className="muted" style={{ fontSize: 13.5, fontWeight: 600 }} onClick={(e) => { e.preventDefault(); setCodeModal(true); }}>
          <Icon name="mail" /> Войти по коду из письма
        </a>
      </div>
      <div className="divider">или</div>
      <div ref={gbtnRef} style={{ display: 'flex', justifyContent: 'center' }} />
      {codeModal && <CodeLoginModal onClose={() => setCodeModal(false)} onAuthed={onAuthed} />}
      {resetModal && <ResetModal onClose={() => setResetModal(false)} />}
    </form>
  );
}

function RegisterForm({ role, setRole, onAuthed, gbtnRef }) {
  const toast = useToast();
  const [f, setF] = useState({ full_name: '', email: '', password: '', company_name: '' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  async function submit(e) {
    e.preventDefault(); setBusy(true);
    try {
      const tk = await api.register({
        email: f.email.trim(), password: f.password, full_name: f.full_name.trim() || null,
        role, company_name: role === 'seller' ? (f.company_name.trim() || null) : null,
      });
      api.tokens.set(tk); toast('Аккаунт создан! Код отправлен на почту.', 'ok'); onAuthed();
    } catch (err) { toast(err.message, 'err'); setBusy(false); }
  }

  return (
    <form onSubmit={submit}>
      <h1 style={{ fontSize: 26, marginBottom: 6 }}>Создайте аккаунт</h1>
      <p className="muted" style={{ marginBottom: 20 }}>Продавцы публикуют объекты сразу, без модерации</p>
      <div className="field">
        <label>Я хочу</label>
        <div className="role-pick">
          <label><input type="radio" name="role" checked={role === 'buyer'} onChange={() => setRole('buyer')} /><div className="rp"><Icon name="key" /><span>Покупатель<small>Ищу жильё</small></span></div></label>
          <label><input type="radio" name="role" checked={role === 'seller'} onChange={() => setRole('seller')} /><div className="rp"><Icon name="building" /><span>Продавец<small>Размещаю объекты</small></span></div></label>
        </div>
      </div>
      <div className="field"><label>Имя</label><input className="input" value={f.full_name} onChange={(e) => set('full_name', e.target.value)} /></div>
      <div className="field"><label>Email</label><input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} required /></div>
      <div className="field"><label>Пароль</label><input className="input" type="password" value={f.password} onChange={(e) => set('password', e.target.value)} required minLength={6} placeholder="Минимум 6 символов" /></div>
      {role === 'seller' && <div className="field"><label>Компания / агентство</label><input className="input" value={f.company_name} onChange={(e) => set('company_name', e.target.value)} /></div>}
      <button className="btn btn-primary btn-block btn-lg" disabled={busy}>{busy ? <span className="spinner-sm" /> : 'Создать аккаунт'}</button>
      <div className="divider">или</div>
      <div ref={gbtnRef} style={{ display: 'flex', justifyContent: 'center' }} />
    </form>
  );
}

function CodeLoginModal({ onClose, onAuthed }) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [info, setInfo] = useState('');
  async function act() {
    try {
      if (!sent) { const r = await api.sendCode({ email: email.trim(), purpose: 'login' }); setSent(true); setInfo(r.dev_code ? `DEV-код: ${r.dev_code}` : 'Код отправлен на почту.'); toast('Код отправлен', 'ok'); }
      else { const tk = await api.loginCode({ email: email.trim(), code: code.trim(), purpose: 'login' }); api.tokens.set(tk); onClose(); onAuthed(); }
    } catch (e) { toast(e.message, 'err'); }
  }
  return (
    <Modal title="Вход по коду" onClose={onClose}>
      <div className="field"><label>Email</label><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      {sent && <div className="field"><label>Код из письма</label><input className="input" value={code} onChange={(e) => setCode(e.target.value)} /></div>}
      {info && <p className="hint">{info}</p>}
      <button className="btn btn-primary btn-block" onClick={act}>{sent ? 'Войти' : 'Отправить код'}</button>
    </Modal>
  );
}

function ResetModal({ onClose }) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [npass, setNpass] = useState('');
  const [sent, setSent] = useState(false);
  const [info, setInfo] = useState('');
  async function act() {
    try {
      if (!sent) { const r = await api.sendCode({ email: email.trim(), purpose: 'reset' }); setSent(true); setInfo(r.dev_code ? `DEV-код: ${r.dev_code}` : 'Код отправлен на почту.'); }
      else { await api.resetPassword({ email: email.trim(), code: code.trim(), new_password: npass }); toast('Пароль изменён. Войдите заново.', 'ok'); onClose(); }
    } catch (e) { toast(e.message, 'err'); }
  }
  return (
    <Modal title="Сброс пароля" onClose={onClose}>
      <div className="field"><label>Email</label><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      {sent && <>
        <div className="field"><label>Код из письма</label><input className="input" value={code} onChange={(e) => setCode(e.target.value)} /></div>
        <div className="field"><label>Новый пароль</label><input className="input" type="password" value={npass} onChange={(e) => setNpass(e.target.value)} /></div>
      </>}
      {info && <p className="hint">{info}</p>}
      <button className="btn btn-primary btn-block" onClick={act}>{sent ? 'Сбросить пароль' : 'Отправить код'}</button>
    </Modal>
  );
}

function AuthHero() {
  const feats = [
    ['globe', '360°-туры с навигацией между комнатами'],
    ['search', 'Spatial Q&A — вопросы про конкретную зону'],
    ['bot', 'ИИ-агент сам ищет и сравнивает объекты'],
    ['card', 'Бронь и оплата онлайн за пару кликов'],
  ];
  return (
    <div className="auth-hero">
      <a className="logo" href="#/" style={{ color: '#f3ece0', fontSize: 24 }}>
        <span className="dot" style={{ color: '#f3ece0' }}><Icon name="logo" size={24} /></span>
        <span style={{ color: '#f3ece0' }}>Nestora</span>
      </a>
      <div>
        <h1>Не просто список квартир — решение, где жить</h1>
        <p>Ходите по квартире в 360°, спрашивайте ИИ прямо про зону на панораме, бронируйте онлайн и доверяйте честным отзывам.</p>
      </div>
      <div className="feat">
        {feats.map(([ic, txt]) => <div key={txt}><div className="ic"><Icon name={ic} /></div><span>{txt}</span></div>)}
      </div>
    </div>
  );
}
