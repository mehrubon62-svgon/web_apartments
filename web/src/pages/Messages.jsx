import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApp } from '../lib/store.jsx';
import { useToast } from '../lib/toast.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { Icon } from '../lib/icons.jsx';
import { Avatar, Empty, Modal } from '../components/Common.jsx';
import { fmtTime, timeAgo, mediaUrl, ROLE_LABELS } from '../lib/format.js';

export function MessagesPage() {
  const { user } = useApp();
  const toast = useToast();
  const { t } = useI18n();
  const [convos, setConvos] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState(null);
  const [editing, setEditing] = useState(null);
  const [text, setText] = useState('');
  const bodyRef = useRef(null);
  const fileRef = useRef(null);

  const loadConvos = useCallback(async () => { try { const d = await api.conversations(); setConvos(d.items); } catch {} }, []);
  const loadMessages = useCallback(async (cid) => { try { const m = await api.messages(cid, { limit: 100 }); setMessages(m); api.markRead(cid).catch(() => {}); } catch {} }, []);

  useEffect(() => { loadConvos(); }, []);
  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight; }, [messages]);
  useEffect(() => {
    const onRt = (e) => {
      const ev = e.detail?.event; const cid = e.detail?.data?.conversation_id;
      if (['message:new', 'message:edited', 'message:deleted', 'message:read'].includes(ev)) {
        loadConvos();
        if (active && Number(cid) === active.id) loadMessages(active.id);
      }
    };
    window.addEventListener('nestora:rt', onRt);
    return () => window.removeEventListener('nestora:rt', onRt);
  }, [active]);

  async function open(c) { setActive(c); setReply(null); await loadMessages(c.id); }

  async function send() {
    if (!text.trim() || !active) return;
    const body = text.trim(); setText('');
    try {
      if (editing) { await api.editMessage(active.id, editing.id, { text: body }); setEditing(null); }
      else { await api.sendMessage(active.id, { text: body, reply_to_id: reply ? reply.id : null }); setReply(null); }
      await loadMessages(active.id); await loadConvos();
    } catch (e) { toast(e.message, 'err'); setText(body); }
  }
  async function sendFile(file) {
    if (!file || !active) return;
    const fd = new FormData(); fd.append('file', file);
    try { toast(t('Загрузка файла...'), 'info'); await api.sendFileMessage(active.id, fd); await loadMessages(active.id); }
    catch (e) { toast(e.message, 'err'); }
  }
  async function del(m) {
    if (!confirm(t('Удалить сообщение?'))) return;
    try { await api.deleteMessage(active.id, m.id); await loadMessages(active.id); } catch (e) { toast(e.message, 'err'); }
  }

  const other = (c) => (user && c.buyer.id === user.id ? c.seller : c.buyer);

  return (
    <div className={`chat-layout ${active ? 'has-active' : ''}`}>
      <div className={`chat-list ${active ? '' : 'show'}`}>
        {!convos.length ? <div className="empty" style={{ padding: '40px 16px' }}><div className="emoji"><Icon name="inbox" size={40} /></div><p>{t('Диалогов пока нет')}</p></div>
          : convos.map((c) => {
            const o = other(c);
            return (
              <div key={c.id} className={`chat-list-item ${active && active.id === c.id ? 'active' : ''}`} onClick={() => open(c)}>
                <Avatar user={o} size={46} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="ci-top"><span className="ci-name">{o.full_name || o.company_name || t('Пользователь')}</span><span className="muted" style={{ fontSize: 12 }}>{timeAgo(c.last_message_at)}</span></div>
                  <div className="row-between"><span className="ci-last">{c.last_message || t('Нет сообщений')}</span>{c.unread > 0 && <span className="badge" style={{ position: 'static', border: 'none' }}>{c.unread}</span>}</div>
                </div>
              </div>
            );
          })}
      </div>
      <div className="chat-main">
        {!active ? <div style={{ display: 'grid', placeContent: 'center', height: '100%' }}><Empty icon="chat" title={t('Выберите диалог')} sub={t('Начните общение с риелтором со страницы объекта')} /></div> : (
          <>
            <div className="chat-head">
              <button className="chat-back icon-btn" onClick={() => setActive(null)} title={t('Назад')}><Icon name="arrow-left" /></button>
              <Avatar user={other(active)} size={42} />
              <div>
                <div style={{ fontWeight: 700 }}>{other(active).full_name || other(active).company_name || t('Пользователь')}</div>
                <div className="muted" style={{ fontSize: 12.5 }}>{ROLE_LABELS[other(active).role]}</div>
              </div>
              {active.property_id && <Link className="btn btn-soft btn-sm" style={{ marginLeft: 'auto' }} to={`/properties/${active.property_id}`}><Icon name="home" /> {t('К объекту')}</Link>}
            </div>
            <div className="chat-body" ref={bodyRef}>
              {messages.map((m) => {
                const out = m.sender_id === user.id;
                const parent = m.reply_to_id ? messages.find((x) => x.id === m.reply_to_id) : null;
                return (
                  <div key={m.id} className={`msg ${out ? 'out' : 'in'}`}>
                    {parent && <div className="reply-quote">{parent.text || t('вложение')}</div>}
                    {m.is_deleted ? <em className="muted">{t('Сообщение удалено')}</em> : <>
                      {m.attachment_url && ((m.attachment_type || '').startsWith('image/')
                        ? <img className="attach-img" src={mediaUrl(m.attachment_url)} onClick={() => window.open(mediaUrl(m.attachment_url), '_blank')} />
                        : <a className="attach" href={mediaUrl(m.attachment_url)} target="_blank" rel="noreferrer"><Icon name="paperclip" /> {m.attachment_name || t('Файл')}</a>)}
                      {m.text && <div>{m.text}</div>}
                      <div className="msg-actions">
                        <button title={t('Ответить')} onClick={() => setReply(m)}><Icon name="reply" /></button>
                        {out && m.text && <button title={t('Изменить')} onClick={() => { setEditing(m); setText(m.text); }}><Icon name="edit" /></button>}
                        {out && <button title={t('Удалить')} onClick={() => del(m)}><Icon name="trash" /></button>}
                      </div>
                    </>}
                    <div className="meta"><span>{fmtTime(m.created_at)}</span>{m.is_edited && <span>· {t('изменено')}</span>}{out && <span>· {m.is_read ? '✓✓' : '✓'}</span>}</div>
                  </div>
                );
              })}
            </div>
            {(reply || editing) && (
              <div className="reply-bar">
                <span>{editing ? t('Редактирование') : t('Ответ')}: {((editing || reply).text || t('вложение')).slice(0, 50)}</span>
                <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => { setReply(null); setEditing(null); setText(''); }}><Icon name="close" /></button>
              </div>
            )}
            <div className="chat-compose">
              <button className="icon-btn" title={t('Прикрепить файл')} onClick={() => fileRef.current.click()}><Icon name="paperclip" /></button>
              <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={(e) => sendFile(e.target.files[0])} />
              <textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder={t('Напишите сообщение...')} rows={1} />
              <button className="btn btn-primary btn-icon" onClick={send}><Icon name="send" /></button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
