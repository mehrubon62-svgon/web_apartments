import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api.js';
import { useApp } from '../lib/store.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { useToast } from '../lib/toast.jsx';
import { Icon } from '../lib/icons.jsx';

const TOOL_LABELS = {
  search_properties: 'search', open_tour: 'tour', show_on_map: 'map', compare_properties: 'compare',
  get_favorites: 'favorites', add_to_favorites: 'add favorite', get_viewing_history: 'history',
  delete_viewing_history: 'clear history', set_price_tracker: 'tracker', get_recommendations: 'recs',
};

const SUGGEST = {
  ru: ['Найди квартиру в аренду до $300 за ночь', 'Покажи дома на продажу до $800k', 'Что у меня в избранном?', 'Посоветуй по ипотеке'],
  en: ['Find a rental under $300 a night', 'Show houses for sale under $800k', "What's in my favorites?", 'Advise on a mortgage'],
};

function greeting(lang) {
  return lang === 'ru'
    ? 'Привет! Я ИИ-агент Nestora. Найду объекты, сравню их, добавлю в избранное или дам совет. С чего начнём?'
    : "Hi! I'm the Nestora AI agent. I can find listings, compare them, manage favorites or give advice. Where do we start?";
}

const CID_KEY = 'nestora_agent_cid';

export function AgentWidget() {
  const { user } = useApp();
  const { lang } = useI18n();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const convoId = useRef(localStorage.getItem(CID_KEY) ? Number(localStorage.getItem(CID_KEY)) : null);
  const bodyRef = useRef(null);

  // Load stored conversation history when opened the first time.
  useEffect(() => {
    if (!open || messages.length) return;
    (async () => {
      if (convoId.current) {
        try {
          const all = await api.agentConversations();
          const convo = all.find((c) => c.id === convoId.current);
          if (convo && convo.messages?.length) {
            setMessages(convo.messages
              .filter((m) => m.role === 'user' || (m.role === 'assistant' && m.content))
              .map((m) => ({ role: m.role === 'user' ? 'user' : 'bot', text: typeof m.content === 'string' ? m.content : '' }))
              .filter((m) => m.text));
            return;
          }
        } catch {}
      }
      setMessages([{ role: 'bot', text: greeting(lang) }]);
    })();
  }, [open]);

  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight; }, [messages, busy, open]);

  async function send(text) {
    const msg = (text ?? input).trim();
    if (!msg || busy) return;
    if (!api.config.aiEnabled) { setMessages((m) => [...m, { role: 'bot', text: lang === 'ru' ? 'ИИ не настроен на сервере.' : 'AI is not configured on the server.' }]); return; }
    setInput(''); setMessages((m) => [...m, { role: 'user', text: msg }]); setBusy(true);
    try {
      const res = await api.agentChat({ message: msg, conversation_id: convoId.current, lang });
      convoId.current = res.conversation_id;
      localStorage.setItem(CID_KEY, String(res.conversation_id));
      setMessages((m) => [...m, { role: 'bot', text: res.reply || '…', tools: res.tool_calls }]);
    } catch (e) { setMessages((m) => [...m, { role: 'bot', text: '⚠️ ' + e.message }]); }
    finally { setBusy(false); }
  }

  async function clearHistory() {
    if (convoId.current) { try { await api.deleteAgentConversation(convoId.current); } catch {} }
    convoId.current = null;
    localStorage.removeItem(CID_KEY);
    setMessages([{ role: 'bot', text: greeting(lang) }]);
    toast(lang === 'ru' ? 'История очищена' : 'History cleared', 'ok');
  }

  if (!user) return null;

  return (
    <>
      <button className={`agent-fab ${open ? 'hidden' : ''}`} onClick={() => setOpen(true)} title="Nestora AI" aria-label="AI">
        <Icon name="bot" size={26} />
      </button>

      {open && (
        <div className="agent-pop">
          <div className="agent-pop-head">
            <div className="row" style={{ gap: 10 }}>
              <span className="agent-pop-ava"><Icon name="logo" /></span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{lang === 'ru' ? 'ИИ-агент' : 'AI Agent'}</div>
                <div className="muted" style={{ fontSize: 11.5 }}>Nestora</div>
              </div>
            </div>
            <div className="row" style={{ gap: 4 }}>
              <button className="icon-btn" style={{ width: 34, height: 34 }} title={lang === 'ru' ? 'Очистить историю' : 'Clear history'} onClick={clearHistory}><Icon name="trash" /></button>
              <button className="icon-btn" style={{ width: 34, height: 34 }} title={lang === 'ru' ? 'Свернуть' : 'Minimize'} onClick={() => setOpen(false)}><Icon name="close" /></button>
            </div>
          </div>

          <div className="agent-pop-body" ref={bodyRef}>
            {messages.map((m, i) => (
              <div key={i} className={`agent-msg ${m.role === 'user' ? 'user' : 'bot'}`}>
                <div className="ava">{m.role === 'user' ? <Icon name="user" /> : <Icon name="logo" />}</div>
                <div className="agent-bubble">
                  <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>
                  {m.tools && m.tools.length > 0 && <div className="agent-tools">{[...new Set(m.tools)].map((t) => <span key={t} className="tool-chip">{TOOL_LABELS[t] || t}</span>)}</div>}
                </div>
              </div>
            ))}
            {busy && <div className="agent-msg bot"><div className="ava"><Icon name="logo" /></div><div className="agent-bubble"><span className="typing"><span /><span /><span /></span></div></div>}
            {messages.length <= 1 && !busy && (
              <div className="agent-suggest" style={{ marginTop: 4 }}>
                {(SUGGEST[lang] || SUGGEST.en).map((s) => <button key={s} className="chip" onClick={() => send(s)}>{s}</button>)}
              </div>
            )}
          </div>

          <div className="agent-pop-compose">
            <textarea className="textarea" value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={lang === 'ru' ? 'Спросите про недвижимость...' : 'Ask about real estate...'} rows={1} />
            <button className="btn btn-primary btn-icon" onClick={() => send()}><Icon name="send" /></button>
          </div>
        </div>
      )}
    </>
  );
}
