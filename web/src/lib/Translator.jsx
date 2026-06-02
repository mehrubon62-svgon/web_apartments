import { useEffect } from 'react';
import { useI18n } from './i18n.jsx';
import { EN, RULES } from './dict.js';

const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'SVG', 'PATH', 'CANVAS', 'IFRAME']);
const SKIP_CLASS = /mapbox|pnlm|pannellum|maplibre/i;

function translate(text) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (EN[trimmed] != null) return text.replace(trimmed, EN[trimmed]);
  for (const [rx, repl] of RULES) {
    if (rx.test(trimmed)) return text.replace(trimmed, trimmed.replace(rx, repl));
  }
  return null;
}

function walk(root) {
  if (root.nodeType === Node.TEXT_NODE) {
    const p = root.parentNode;
    if (!p || SKIP.has(p.tagName)) return;
    const tr = translate(root.nodeValue);
    if (tr != null && tr !== root.nodeValue) root.nodeValue = tr;
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE || SKIP.has(root.tagName)) return;
  const cls = typeof root.className === 'string' ? root.className : '';
  if (cls && SKIP_CLASS.test(cls)) return;
  // attributes
  for (const attr of ['placeholder', 'title']) {
    const v = root.getAttribute && root.getAttribute(attr);
    if (v) { const tr = translate(v); if (tr != null && tr !== v) root.setAttribute(attr, tr); }
  }
  for (let c = root.firstChild; c; c = c.nextSibling) walk(c);
}

// Translates the live DOM to EN. Mounted once; re-runs on mutations.
export function Translator() {
  const { lang } = useI18n();
  useEffect(() => {
    if (lang !== 'en') return;            // RU = source language, nothing to do
    let raf = null;
    const run = () => { raf = null; obs.disconnect(); walk(document.body); obs.observe(document.body, { childList: true, subtree: true, characterData: true }); };
    const obs = new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(run); });
    walk(document.body);
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => { obs.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, [lang]);
  return null;
}
