import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApp } from '../lib/store.jsx';
import { Icon } from '../lib/icons.jsx';

const TOOL_LABELS = {
  search_properties: 'поиск объектов', open_tour: 'открыть тур', show_on_map: 'на карте',
  compare_properties: 'сравнение', get_favorites: 'избранное', add_to_favorites: 'в избранное',
  get_viewing_history: 'история', delete_viewing_history: 'очистка истории',
  set_price_tracker: 'трекер цены', get_recommendations: 'рекомендации',
};
const SUGGESTIONS = ['Найди квартиру в аренду до $300 за ночь', 'Покажи дома на продажу до $800k', 'Что у меня в избранном?', 'Сравни объекты 1 и 2', 'Посоветуй по ипотеке на 20 лет'];

export function AgentPage() {
  const nav = useNavigate();
  const { user } = useApp();
  const [messages, setMessages] = useState([{ role: 'bot', text: 'Привет! Я ИИ-агент Nestora. Могу найти объекты, сравнить их, добавить в избранное, поставить трекер цены или дать совет. С чего начнём?' }]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const convoId = useRef(null);
  const bodyRef = useRef(null);

  useEffect(() => { if (!user) nav('/auth'); }, [user]);
  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight; }, [messages, busy]);

  async function send(text) {
    const msg = (text ?? input).trim();
    if (!msg || busy) return;
    if (!api.config.aiEnabled) { setMessages((m) => [...m, { role: 'bot', text: '⚠️ ИИ не настроен на сервере (нет AI_API_KEY).' }]); return; }
    setInput(''); setMessages((m) => [...m, { role: 'user', text: msg }]); setBusy(true);
    try {
      const res = await api.agentChat({ message: msg, conversation_id: convoId.current });
      convoId.current = res.conversation_id;
      setMessages((m) => [...m, { role: 'bot', text: res.reply || '(пустой ответ)', tools: res.tool_calls }]);
    } catch (e) { setMessages((m) => [...m, { role: 'bot', text: '⚠️ ' + e.message }]); }
    finally { setBusy(false); }
  }

  return (
    <div className="agent-wrap">
      <div className="page-head" style={{ paddingTop: 20, marginBottom: 8 }}>
        <div>
          <div className="page-title" style={{ fontSize: 24 }}><Icon name="bot" /> ИИ-агент Nestora</div>
          <div className="page-sub">Ищет, сравнивает и управляет объектами за вас через реальные инструменты</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => { convoId.current = null; setMessages([{ role: 'bot', text: 'Новый чат начат. Чем помочь?' }]); }}><Icon name="plus" /> Новый чат</button>
      </div>
      <div className="agent-body" ref={bodyRef}>
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
      </div>
      <div className="agent-compose">
        <div className="agent-suggest">{SUGGESTIONS.map((s) => <button key={s} className="chip" onClick={() => send(s)}>{s}</button>)}</div>
        <div className="row" style={{ gap: 10 }}>
          <textarea className="textarea" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Спросите что угодно про недвижимость..." rows={1} />
          <button className="btn btn-primary btn-icon btn-lg" onClick={() => send()}><Icon name="send" /></button>
        </div>
      </div>
    </div>
  );
}
