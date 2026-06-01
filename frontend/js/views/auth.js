// ============================================================
// Auth view — login / register / email-code / reset password
// ============================================================
import { h, toast } from '../ui.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { navigate } from '../router.js';
import { renderGoogleButton } from '../components.js';

export function renderAuth(_params, query) {
  if (api.isAuthed()) { navigate('/'); return; }
  const app = document.getElementById('app');
  app.innerHTML = '';

  let mode = query.mode === 'register' ? 'register' : 'login';

  const panel = h('div', { class: 'auth-panel' });
  const wrap = h('div', { class: 'auth-wrap' }, [authHero(), panel]);
  app.appendChild(wrap);

  function render() {
    panel.innerHTML = '';
    const card = h('div', { class: 'auth-card' });

    card.appendChild(h('div', { class: 'logo', style: { marginBottom: '24px', fontSize: '26px' } }, [
      h('span', { class: 'dot', html: '◈' }),
      h('span', {}, [h('b', { text: 'Nest' }), h('span', { text: 'ora' })]),
    ]));

    const tabs = h('div', { class: 'auth-tabs' }, [
      h('button', { class: mode === 'login' ? 'active' : '', text: 'Вход', onClick: () => { mode = 'login'; render(); } }),
      h('button', { class: mode === 'register' ? 'active' : '', text: 'Регистрация', onClick: () => { mode = 'register'; render(); } }),
    ]);
    card.appendChild(tabs);

    if (mode === 'login') card.appendChild(loginForm(render));
    else card.appendChild(registerForm());

    panel.appendChild(card);

    const gbtn = document.getElementById('google-btn');
    if (gbtn) renderGoogleButton(gbtn, currentRole(), onAuthed);
  }

  let currentRoleVal = 'buyer';
  function currentRole() { return currentRoleVal; }

  function loginForm() {
    const email = h('input', { class: 'input', type: 'email', placeholder: 'you@example.com', required: true, autocomplete: 'email' });
    const pass = h('input', { class: 'input', type: 'password', placeholder: '••••••••', required: true, autocomplete: 'current-password' });
    const submit = h('button', { class: 'btn btn-primary btn-block btn-lg', type: 'submit', text: 'Войти' });

    const form = h('form', {
      onSubmit: async (e) => {
        e.preventDefault();
        submit.disabled = true; submit.innerHTML = '';
        submit.appendChild(h('div', { class: 'spinner-sm' }));
        try {
          const tokens = await api.login({ email: email.value.trim(), password: pass.value });
          api.tokens.set(tokens);
          onAuthed();
        } catch (err) {
          toast(err.message, 'err');
          submit.disabled = false; submit.textContent = 'Войти';
        }
      },
    }, [
      h('h1', { style: { fontSize: '26px', marginBottom: '6px' }, text: 'С возвращением' }),
      h('p', { class: 'muted', style: { marginBottom: '22px' }, text: 'Войдите, чтобы продолжить поиск жилья' }),
      h('div', { class: 'field' }, [h('label', { text: 'Email' }), email]),
      h('div', { class: 'field' }, [h('label', { text: 'Пароль' }), pass]),
      h('div', { class: 'row-between', style: { marginBottom: '8px' } }, [
        h('span', {}),
        h('a', { href: '#', class: 'muted', style: { fontSize: '13px', fontWeight: '600' }, text: 'Забыли пароль?',
          onClick: (e) => { e.preventDefault(); resetFlow(); } }),
      ]),
      submit,
      h('div', { style: { marginTop: '12px', textAlign: 'center' } }, [
        h('a', { href: '#', class: 'muted', style: { fontSize: '13.5px', fontWeight: '600' }, text: '✉️ Войти по коду из письма',
          onClick: (e) => { e.preventDefault(); codeLoginFlow(); } }),
      ]),
      h('div', { class: 'divider', text: 'или' }),
      h('div', { id: 'google-btn', style: { display: 'flex', justifyContent: 'center' } }),
    ]);
    return form;
  }

  function registerForm() {
    const name = h('input', { class: 'input', type: 'text', placeholder: 'Иван Петров', autocomplete: 'name' });
    const email = h('input', { class: 'input', type: 'email', placeholder: 'you@example.com', required: true, autocomplete: 'email' });
    const pass = h('input', { class: 'input', type: 'password', placeholder: 'Минимум 6 символов', required: true, minlength: 6, autocomplete: 'new-password' });
    const company = h('input', { class: 'input', type: 'text', placeholder: 'Название (необязательно)' });
    const companyField = h('div', { class: 'field', style: { display: 'none' } }, [h('label', { text: 'Компания / агентство' }), company]);

    const rolePick = h('div', { class: 'role-pick' }, [
      roleOption('buyer', '🔑', 'Покупатель', 'Ищу жильё', true),
      roleOption('seller', '🏢', 'Продавец', 'Размещаю объекты', false),
    ]);
    rolePick.addEventListener('change', () => {
      currentRoleVal = rolePick.querySelector('input:checked').value;
      companyField.style.display = currentRoleVal === 'seller' ? 'block' : 'none';
      const gbtn = document.getElementById('google-btn');
      if (gbtn) { gbtn.innerHTML = ''; renderGoogleButton(gbtn, currentRoleVal, onAuthed); }
    });

    const submit = h('button', { class: 'btn btn-primary btn-block btn-lg', type: 'submit', text: 'Создать аккаунт' });

    const form = h('form', {
      onSubmit: async (e) => {
        e.preventDefault();
        submit.disabled = true; submit.innerHTML = ''; submit.appendChild(h('div', { class: 'spinner-sm' }));
        try {
          const tokens = await api.register({
            email: email.value.trim(), password: pass.value,
            full_name: name.value.trim() || null, role: currentRoleVal,
            company_name: currentRoleVal === 'seller' ? (company.value.trim() || null) : null,
          });
          api.tokens.set(tokens);
          toast('Аккаунт создан! Код подтверждения отправлен на почту.', 'ok');
          onAuthed();
        } catch (err) {
          toast(err.message, 'err');
          submit.disabled = false; submit.textContent = 'Создать аккаунт';
        }
      },
    }, [
      h('h1', { style: { fontSize: '26px', marginBottom: '6px' }, text: 'Создайте аккаунт' }),
      h('p', { class: 'muted', style: { marginBottom: '20px' }, text: 'Продавцы публикуют объекты сразу, без модерации' }),
      h('div', { class: 'field' }, [h('label', { text: 'Я хочу' }), rolePick]),
      h('div', { class: 'field' }, [h('label', { text: 'Имя' }), name]),
      h('div', { class: 'field' }, [h('label', { text: 'Email' }), email]),
      h('div', { class: 'field' }, [h('label', { text: 'Пароль' }), pass]),
      companyField,
      submit,
      h('div', { class: 'divider', text: 'или' }),
      h('div', { id: 'google-btn', style: { display: 'flex', justifyContent: 'center' } }),
    ]);
    return form;
  }

  function roleOption(value, icon, title, sub, checked) {
    return h('label', {}, [
      h('input', { type: 'radio', name: 'role', value, checked }),
      h('div', { class: 'rp' }, [
        h('span', { text: icon }),
        h('span', {}, [document.createTextNode(title), h('small', { text: sub })]),
      ]),
    ]);
  }

  function onAuthed() {
    store.loadUser().then(() => { navigate('/'); location.reload(); });
  }

  // --- Email code login flow ---
  function codeLoginFlow() {
    import('../ui.js').then(({ modal }) => {
      const email = h('input', { class: 'input', type: 'email', placeholder: 'you@example.com' });
      const code = h('input', { class: 'input', type: 'text', placeholder: 'Код из письма', maxlength: 8, style: { display: 'none' } });
      const info = h('p', { class: 'hint' });
      let sent = false;
      const action = h('button', { class: 'btn btn-primary btn-block', text: 'Отправить код' });
      action.addEventListener('click', async () => {
        try {
          if (!sent) {
            const r = await api.sendCode({ email: email.value.trim(), purpose: 'login' });
            sent = true; code.style.display = 'block'; action.textContent = 'Войти';
            info.textContent = r.dev_code ? `DEV-код: ${r.dev_code}` : 'Код отправлен на почту.';
            toast('Код отправлен', 'ok');
          } else {
            const tokens = await api.loginCode({ email: email.value.trim(), code: code.value.trim(), purpose: 'login' });
            api.tokens.set(tokens); m.close(); onAuthed();
          }
        } catch (e) { toast(e.message, 'err'); }
      });
      const m = modal({ title: 'Вход по коду', body: h('div', {}, [
        h('div', { class: 'field' }, [h('label', { text: 'Email' }), email]),
        h('div', { class: 'field' }, [code]), info, action,
      ]) });
    });
  }

  // --- Reset password flow ---
  function resetFlow() {
    import('../ui.js').then(({ modal }) => {
      const email = h('input', { class: 'input', type: 'email', placeholder: 'you@example.com' });
      const code = h('input', { class: 'input', type: 'text', placeholder: 'Код из письма', style: { display: 'none' } });
      const npass = h('input', { class: 'input', type: 'password', placeholder: 'Новый пароль', style: { display: 'none' } });
      const info = h('p', { class: 'hint' });
      let sent = false;
      const action = h('button', { class: 'btn btn-primary btn-block', text: 'Отправить код' });
      action.addEventListener('click', async () => {
        try {
          if (!sent) {
            const r = await api.sendCode({ email: email.value.trim(), purpose: 'reset' });
            sent = true; code.style.display = 'block'; npass.style.display = 'block'; action.textContent = 'Сбросить пароль';
            info.textContent = r.dev_code ? `DEV-код: ${r.dev_code}` : 'Код отправлен на почту.';
          } else {
            await api.resetPassword({ email: email.value.trim(), code: code.value.trim(), new_password: npass.value });
            toast('Пароль изменён. Войдите заново.', 'ok'); m.close();
          }
        } catch (e) { toast(e.message, 'err'); }
      });
      const m = modal({ title: 'Сброс пароля', body: h('div', {}, [
        h('div', { class: 'field' }, [h('label', { text: 'Email' }), email]),
        h('div', { class: 'field' }, [code]),
        h('div', { class: 'field' }, [npass]), info, action,
      ]) });
    });
  }

  render();
}

function authHero() {
  return h('div', { class: 'auth-hero' }, [
    h('div', { class: 'logo', style: { color: '#fff', fontSize: '24px' } }, [
      h('span', { class: 'dot', html: '◈' }),
      h('span', { style: { color: '#fff' }, text: 'Nestora' }),
    ]),
    h('div', {}, [
      h('h1', { text: 'Не просто список квартир — решение, где жить' }),
      h('p', { text: 'Ходите по квартире в 360°, спрашивайте ИИ прямо про зону на панораме, бронируйте онлайн и доверяйте честным отзывам.' }),
    ]),
    h('div', { class: 'feat' }, [
      heroFeat('🌐', '360°-туры с навигацией между комнатами'),
      heroFeat('🔍', 'Spatial Q&A — вопросы про конкретную зону'),
      heroFeat('🤖', 'ИИ-агент сам ищет и сравнивает объекты'),
      heroFeat('💳', 'Бронь и оплата онлайн за пару кликов'),
    ]),
  ]);
}
function heroFeat(icon, text) {
  return h('div', {}, [h('div', { class: 'ic', text: icon }), h('span', { text })]);
}
