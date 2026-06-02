import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApp } from '../lib/store.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { useToast } from '../lib/toast.jsx';
import { Icon } from '../lib/icons.jsx';
import { money, mediaUrl, TYPE_LABELS, DEAL_LABELS } from '../lib/format.js';

const TOOL_LABELS = {
  search_properties: 'search', open_tour: 'tour', show_on_map: 'map', compare_properties: 'compare',
  get_favorites: 'favorites', add_to_favorites: 'add favorite', remove_from_favorites: 'remove favorite',
  clear_favorites: 'clear favorites', get_viewing_history: 'history', delete_viewing_history: 'clear history',
  set_price_tracker: 'tracker', remove_price_tracker: 'untrack', get_recommendations: 'recs',
};

const SUGGEST = {
  ru: [
    'Найди квартиру в аренду до $300 за ночь',
    'Покажи дома на продажу до $800k',
    'Что у меня в избранном?',
    'Посоветуй по ипотеке',
    'Самые доступные квартиры',
    'Самые дорогие дома',
    'Найди жильё с 3 комнатами',
    'Покажи коммерческую недвижимость',
    'Самые просторные квартиры',
    'Студии в аренду',
    'Дома с виртуальным туром',
    'Что я смотрел недавно?',
    'Очисти историю просмотров',
    'Сравни два лучших варианта',
    'Покажи рекомендации для меня',
    'Квартиры до $500k на продажу',
    'Аренда до $150 за ночь',
    'Найди дом для большой семьи',
    'Самое выгодное предложение сейчас',
    'Покажи на карте дома на продажу',
    'Следи за ценой понравившейся квартиры',
    'Сколько стоит аренда в среднем?',
    'Двухкомнатные квартиры в аренду',
    'Найди жильё рядом с центром',
    'Покажи новые объявления',
    'Дешёвая коммерция на продажу',
    'Дома до $1M',
    'Помоги выбрать между арендой и покупкой',
    'Какие районы лучше для семьи?',
    'Что нужно проверить перед покупкой?',
    'Добавь лучший вариант в избранное',
    'Большие квартиры с тремя спальнями',
    'Самые дешёвые дома на продажу',
    'Покажи премиальное жильё',
    'Аренда с длительным сроком',
    'Найди компактную студию недорого',
    'Объясни процесс покупки жилья',
    'Подбери квартиру под бюджет $400k',
  ],
  en: [
    'Find a rental under $300 a night',
    'Show houses for sale under $800k',
    "What's in my favorites?",
    'Advise on a mortgage',
    'Most affordable apartments',
    'Most expensive houses',
    'Find a place with 3 rooms',
    'Show commercial real estate',
    'The most spacious apartments',
    'Studios for rent',
    'Homes with a 360° tour',
    'What did I view recently?',
    'Clear my viewing history',
    'Compare the two best options',
    'Show recommendations for me',
    'Apartments for sale under $500k',
    'Rentals under $150 a night',
    'Find a house for a big family',
    'The best deal right now',
    'Show houses for sale on the map',
    'Track the price of a place I like',
    "What's the average rent?",
    'Two-room apartments for rent',
    'Find a place near the center',
    'Show the newest listings',
    'Cheap commercial space for sale',
    'Houses under $1M',
    'Help me choose: rent or buy?',
    'Which neighborhoods are best for families?',
    'What should I check before buying?',
    'Add the best option to favorites',
    'Large apartments with three bedrooms',
    'The cheapest houses for sale',
    'Show premium homes',
    'Long-term rentals',
    'Find a compact studio on a budget',
    'Explain the home buying process',
    'Find an apartment within a $400k budget',
  ],
};

// Pick `n` random, non-repeating suggestions from the pool for the given lang.
function pickSuggestions(lang, n = 4) {
  const pool = [...(SUGGEST[lang] || SUGGEST.en)];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

function greeting(lang) {
  return lang === 'ru'
    ? 'Привет! Я ИИ-агент Nestora. Найду объекты, сравню их, добавлю в избранное или дам совет. С чего начнём?'
    : "Hi! I'm the Nestora AI agent. I can find listings, compare them, manage favorites or give advice. Where do we start?";
}

const CID_KEY = 'nestora_agent_cid';
const BOX_KEY = 'nestora_agent_box';
const MIN_W = 320, MIN_H = 380, MAX_W = 760, MAX_H = 900;
const DEF_W = 384, DEF_H = 580;

function defaultBox() {
  return {
    x: Math.max(16, window.innerWidth - DEF_W - 24),
    y: Math.max(16, window.innerHeight - DEF_H - 24),
    w: DEF_W, h: DEF_H,
  };
}

// ---- A compact, clickable listing card rendered inside the chat ----
function AgentListingCard({ p, lang, onNavigate }) {
  const cover = p.cover_url ? mediaUrl(p.cover_url) : null;
  const typeLabel = (lang === 'ru' ? TYPE_LABELS[p.type] : { apartment: 'Apartment', house: 'House', commercial: 'Commercial' }[p.type]) || p.type;
  const dealLabel = (lang === 'ru' ? DEAL_LABELS[p.deal_type] : { rent: 'Rent', sale: 'Sale' }[p.deal_type]) || p.deal_type;
  const perNight = p.deal_type === 'rent' ? (lang === 'ru' ? ' / ночь' : ' / night') : '';
  const roomsLabel = lang === 'ru' ? 'комн.' : 'rooms';
  return (
    <button className="ag-card" onClick={() => onNavigate(`/properties/${p.id}`)}>
      <div className="ag-card-img">
        {cover ? <img src={cover} alt={p.title} loading="lazy" /> : <span className="ag-card-ph"><Icon name="home" size={22} /></span>}
        {p.has_tour && <span className="ag-card-tour"><Icon name="globe" size={11} /> 360°</span>}
      </div>
      <div className="ag-card-info">
        <div className="ag-card-price">{money(p.price)}<small>{perNight}</small></div>
        <div className="ag-card-title">{p.title}</div>
        <div className="ag-card-meta">
          <span className="ag-tag">{dealLabel}</span>
          <span className="ag-tag muted">{typeLabel}</span>
        </div>
        <div className="ag-card-spec">
          <span><Icon name="ruler" size={12} /> {p.area} {lang === 'ru' ? 'м²' : 'm²'}</span>
          {p.rooms != null && <span><Icon name="bed" size={12} /> {p.rooms} {roomsLabel}</span>}
        </div>
      </div>
      <Icon name="arrow-right" size={16} />
    </button>
  );
}

function AgentResultBlock({ block, lang, onNavigate }) {
  if (block.kind === 'listings') {
    return (
      <div className="ag-listings">
        {block.items.map((p) => <AgentListingCard key={p.id} p={p} lang={lang} onNavigate={onNavigate} />)}
      </div>
    );
  }
  if (block.kind === 'action') {
    return (
      <div className="ag-action">
        <span className="ag-action-badge"><Icon name="check" size={14} /></span>
        <span className="ag-action-icon"><Icon name={block.icon} size={15} /></span>
        <span className="ag-action-label">{lang === 'ru' ? block.label_ru : block.label_en}</span>
        {block.property && (
          <button className="ag-action-link" onClick={() => onNavigate(`/properties/${block.property.id}`)}>
            {block.property.title}
          </button>
        )}
      </div>
    );
  }
  if (block.kind === 'link') {
    if (block.url) {
      return (
        <a className="ag-linkbtn" href={block.url} target="_blank" rel="noreferrer">
          <Icon name={block.icon} size={15} />
          <span>{lang === 'ru' ? block.label_ru : block.label_en}</span>
          <Icon name="arrow-right" size={15} />
        </a>
      );
    }
    return (
      <button className="ag-linkbtn" onClick={() => onNavigate(block.path)}>
        <Icon name={block.icon} size={15} />
        <span>{lang === 'ru' ? block.label_ru : block.label_en}</span>
        <Icon name="arrow-right" size={15} />
      </button>
    );
  }
  return null;
}

export function AgentWidget() {
  const { user } = useApp();
  const { lang } = useI18n();
  const toast = useToast();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState(() => pickSuggestions(lang));
  const convoId = useRef(localStorage.getItem(CID_KEY) ? Number(localStorage.getItem(CID_KEY)) : null);
  const bodyRef = useRef(null);
  const popRef = useRef(null);

  // ---- Floating box geometry (drag + resize), persisted ----
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 720;
  const [box, setBox] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(BOX_KEY));
      if (saved && saved.w && saved.h) return saved;
    } catch {}
    return defaultBox();
  });
  const drag = useRef(null);

  const clampBox = useCallback((b) => {
    const w = Math.min(Math.max(b.w, MIN_W), Math.min(MAX_W, window.innerWidth - 16));
    const h = Math.min(Math.max(b.h, MIN_H), Math.min(MAX_H, window.innerHeight - 16));
    const x = Math.min(Math.max(b.x, 8), Math.max(8, window.innerWidth - w - 8));
    const y = Math.min(Math.max(b.y, 8), Math.max(8, window.innerHeight - h - 8));
    return { x, y, w, h };
  }, []);

  useEffect(() => { localStorage.setItem(BOX_KEY, JSON.stringify(box)); }, [box]);

  // Drag via header
  function startDrag(e) {
    if (isMobile) return;
    if (e.target.closest('button')) return;
    const pt = e.touches ? e.touches[0] : e;
    drag.current = { mode: 'move', sx: pt.clientX, sy: pt.clientY, box: { ...box } };
    e.preventDefault();
  }
  // Resize via corner handle
  function startResize(e) {
    if (isMobile) return;
    const pt = e.touches ? e.touches[0] : e;
    drag.current = { mode: 'resize', sx: pt.clientX, sy: pt.clientY, box: { ...box } };
    e.preventDefault();
    e.stopPropagation();
  }

  useEffect(() => {
    if (isMobile) return;
    function onMove(e) {
      if (!drag.current) return;
      const pt = e.touches ? e.touches[0] : e;
      const dx = pt.clientX - drag.current.sx;
      const dy = pt.clientY - drag.current.sy;
      const b = drag.current.box;
      if (drag.current.mode === 'move') {
        setBox(clampBox({ ...b, x: b.x + dx, y: b.y + dy }));
      } else {
        // resize from bottom-right; keep top-left anchored
        setBox(clampBox({ ...b, w: b.w + dx, h: b.h + dy }));
      }
    }
    function onUp() { drag.current = null; }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [isMobile, clampBox]);

  function resizeStep(delta) {
    setBox((b) => clampBox({ ...b, w: b.w + delta, h: b.h + Math.round(delta * 1.4) }));
  }

  function resetBox() {
    setBox(clampBox(defaultBox()));
  }

  // Keep suggestions in the current UI language.
  useEffect(() => { setSuggestions(pickSuggestions(lang)); }, [lang]);

  // Load stored conversation history when opened the first time.
  useEffect(() => {
    if (!open) return;
    setSuggestions(pickSuggestions(lang)); // fresh set each time it opens
    if (messages.length) return;
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

  function goTo(path) { setOpen(false); nav(path); }

  async function send(text) {
    const msg = (text ?? input).trim();
    if (!msg || busy) return;
    if (!api.config.aiEnabled) { setMessages((m) => [...m, { role: 'bot', text: lang === 'ru' ? 'ИИ не настроен на сервере.' : 'AI is not configured on the server.' }]); return; }
    setInput('');
    setMessages((m) => [...m, { role: 'user', text: msg }]);
    setBusy(true);

    // Append an empty bot bubble. `full` = everything received so far; `text` =
    // what's currently revealed by the typewriter. A steady timer advances
    // `text` toward `full` so the answer types out smoothly instead of jumping.
    const botIndex = { current: -1 };
    setMessages((m) => { botIndex.current = m.length; return [...m, { role: 'bot', text: '', full: '', streaming: true, results: null }]; });
    const patchBot = (patch) => setMessages((m) => m.map((mm, i) => (i === botIndex.current ? { ...mm, ...(typeof patch === 'function' ? patch(mm) : patch) } : mm)));

    // Typewriter timer: reveal a few chars per tick from full -> text.
    let streamDone = false;
    let pendingResults = null;
    const typer = setInterval(() => {
      setMessages((m) => {
        const mm = m[botIndex.current];
        if (!mm) return m;
        const full = mm.full || '';
        const shown = mm.text || '';
        if (shown.length >= full.length) {
          // caught up; if the stream finished, stop typing and reveal results
          if (streamDone) {
            clearInterval(typer);
            const next = { ...mm, streaming: false };
            if (pendingResults) next.results = pendingResults;
            return m.map((x, i) => (i === botIndex.current ? next : x));
          }
          return m;
        }
        // reveal ~2-4 chars per tick for a natural pace
        const step = Math.max(2, Math.ceil((full.length - shown.length) / 22));
        const nextText = full.slice(0, shown.length + step);
        return m.map((x, i) => (i === botIndex.current ? { ...x, text: nextText } : x));
      });
    }, 18);

    try {
      const resp = await fetch(api.agentChatStreamUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${api.tokens.access}` },
        body: JSON.stringify({ message: msg, conversation_id: convoId.current, lang }),
      });
      if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const handleEvent = (payload) => {
        let obj; try { obj = JSON.parse(payload); } catch { return; }
        if (obj.type === 'meta') {
          if (obj.conversation_id) { convoId.current = obj.conversation_id; localStorage.setItem(CID_KEY, String(obj.conversation_id)); }
          // hold result cards until the text finishes typing, then stagger them in
          pendingResults = obj.results;
          patchBot({ tools: obj.tool_calls });
        } else if (obj.type === 'delta') {
          patchBot((mm) => ({ full: (mm.full || '') + obj.text }));
        } else if (obj.type === 'done') {
          patchBot((mm) => ({ full: obj.reply || mm.full || '…' }));
        } else if (obj.type === 'error') {
          streamDone = true; clearInterval(typer);
          patchBot({ text: '⚠️ ' + (obj.detail || 'error'), full: '⚠️ ' + (obj.detail || 'error'), streaming: false });
        }
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 2);
          const line = frame.split('\n').find((l) => l.startsWith('data: '));
          if (line) handleEvent(line.slice(6));
        }
      }
      streamDone = true;
    } catch (e) {
      streamDone = true; clearInterval(typer);
      // Fall back to the non-streaming endpoint on any streaming failure.
      try {
        const res = await api.agentChat({ message: msg, conversation_id: convoId.current, lang });
        convoId.current = res.conversation_id;
        localStorage.setItem(CID_KEY, String(res.conversation_id));
        patchBot({ text: res.reply || '…', full: res.reply || '…', tools: res.tool_calls, results: res.results, streaming: false });
      } catch (e2) {
        patchBot({ text: '⚠️ ' + e2.message, full: '⚠️ ' + e2.message, streaming: false });
      }
    } finally {
      setBusy(false);
    }
  }

  async function clearHistory() {
    if (convoId.current) { try { await api.deleteAgentConversation(convoId.current); } catch {} }
    convoId.current = null;
    localStorage.removeItem(CID_KEY);
    setMessages([{ role: 'bot', text: greeting(lang) }]);
    setSuggestions(pickSuggestions(lang));
    toast(lang === 'ru' ? 'История очищена' : 'History cleared', 'ok');
  }

  if (!user) return null;

  const popStyle = isMobile ? undefined : { left: box.x, top: box.y, width: box.w, height: box.h, right: 'auto', bottom: 'auto' };

  return (
    <>
      <button className={`agent-fab ${open ? 'hidden' : ''}`} onClick={() => setOpen(true)} title="Nestora AI" aria-label="AI">
        <Icon name="bot" size={26} />
      </button>

      {open && (
        <div className="agent-pop" ref={popRef} style={popStyle}>
          <div className="agent-pop-head" onMouseDown={startDrag} onTouchStart={startDrag} style={{ cursor: isMobile ? 'default' : 'move' }}>
            <div className="row" style={{ gap: 10 }}>
              <span className="agent-pop-ava"><Icon name="logo" /></span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{lang === 'ru' ? 'ИИ-агент' : 'AI Agent'}</div>
                <div className="muted" style={{ fontSize: 11.5 }}>Nestora</div>
              </div>
            </div>
            <div className="row" style={{ gap: 4 }}>
              {!isMobile && <button className="icon-btn" style={{ width: 30, height: 30 }} title={lang === 'ru' ? 'Уменьшить' : 'Shrink'} onClick={() => resizeStep(-80)}><Icon name="minus" /></button>}
              {!isMobile && <button className="icon-btn" style={{ width: 30, height: 30 }} title={lang === 'ru' ? 'Увеличить' : 'Enlarge'} onClick={() => resizeStep(80)}><Icon name="plus" /></button>}
              {!isMobile && <button className="icon-btn" style={{ width: 30, height: 30 }} title={lang === 'ru' ? 'Сбросить размер' : 'Reset size'} onClick={resetBox}><Icon name="repeat" /></button>}
              <button className="icon-btn" style={{ width: 30, height: 30 }} title={lang === 'ru' ? 'Очистить историю' : 'Clear history'} onClick={clearHistory}><Icon name="trash" /></button>
              <button className="icon-btn" style={{ width: 30, height: 30 }} title={lang === 'ru' ? 'Свернуть' : 'Minimize'} onClick={() => setOpen(false)}><Icon name="close" /></button>
            </div>
          </div>

          <div className="agent-pop-body" ref={bodyRef}>
            {messages.map((m, i) => (
              <div key={i} className={`agent-msg ${m.role === 'user' ? 'user' : 'bot'}`}>
                <div className="ava">{m.role === 'user' ? <Icon name="user" /> : <Icon name="logo" />}</div>
                <div className="agent-msg-col">
                  <div className="agent-bubble">
                    <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}{m.streaming && <span className="stream-caret" />}{m.streaming && !m.text && <span className="typing"><span /><span /><span /></span>}</div>
                    {m.tools && m.tools.length > 0 && <div className="agent-tools">{[...new Set(m.tools)].map((t) => <span key={t} className="tool-chip">{TOOL_LABELS[t] || t}</span>)}</div>}
                  </div>
                  {m.results && m.results.length > 0 && (
                    <div className="agent-results">
                      {m.results.map((b, bi) => <AgentResultBlock key={bi} block={b} lang={lang} onNavigate={goTo} />)}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && !messages.some((m) => m.streaming) && <div className="agent-msg bot"><div className="ava"><Icon name="logo" /></div><div className="agent-bubble"><span className="typing"><span /><span /><span /></span></div></div>}
            {messages.length <= 1 && !busy && (
              <div className="agent-suggest" style={{ marginTop: 4 }}>
                {suggestions.map((s) => <button key={s} className="chip" onClick={() => send(s)}>{s}</button>)}
              </div>
            )}
          </div>

          <div className="agent-pop-compose">
            <textarea className="textarea" value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={lang === 'ru' ? 'Спросите про недвижимость...' : 'Ask about real estate...'} rows={1} />
            <button className="btn btn-primary btn-icon" onClick={() => send()}><Icon name="send" /></button>
          </div>

          {!isMobile && <div className="agent-resize-handle" onMouseDown={startResize} onTouchStart={startResize} title={lang === 'ru' ? 'Изменить размер' : 'Resize'} />}
        </div>
      )}
    </>
  );
}
