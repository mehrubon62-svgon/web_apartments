// ============================================================
// DOM enhancer: replace emojis with SVG icons + translate text.
// Designed to be cheap and loop-proof:
//  - each element is processed at most once (WeakSet)
//  - heavy/3rd-party subtrees (Mapbox, canvas, pannellum) are skipped
//  - mutations are batched on rAF and the observer is paused while we work
// ============================================================
import { EMOJI_MAP, svgMarkup } from './icons.js';
import { getLang, translateText } from './i18n.js';

const EMOJI_KEYS = Object.keys(EMOJI_MAP).sort((a, b) => b.length - a.length);
const EMOJI_RX = new RegExp(
  '(' + EMOJI_KEYS.map((e) => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\uFE0F?',
  'u'
);
const EMOJI_RX_G = new RegExp(EMOJI_RX.source, 'gu');

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'SVG', 'PATH', 'TEXTAREA', 'INPUT', 'CANVAS', 'IFRAME', 'NOSCRIPT']);
// Class/id fragments whose subtrees must never be touched (3rd-party widgets).
const SKIP_MATCH = /mapbox|pnlm|pannellum|maplibre/i;

const seen = new WeakSet();

function shouldSkip(el) {
  if (SKIP_TAGS.has(el.tagName)) return true;
  if (el.dataset && el.dataset.icn) return true;
  const cls = typeof el.className === 'string' ? el.className : '';
  if (cls && SKIP_MATCH.test(cls)) return true;
  if (el.id && SKIP_MATCH.test(el.id)) return true;
  return false;
}

function processTextNode(node) {
  const text = node.nodeValue;
  if (!text || !text.trim()) return;
  const parent = node.parentNode;
  if (!parent || SKIP_TAGS.has(parent.tagName)) return;

  let working = text;
  if (getLang() === 'en') {
    const tr = translateText(working);
    if (tr !== working) working = tr;
  }

  if (EMOJI_RX.test(working)) {
    const frag = document.createDocumentFragment();
    let last = 0;
    EMOJI_RX_G.lastIndex = 0;
    let m;
    while ((m = EMOJI_RX_G.exec(working)) !== null) {
      if (m.index > last) frag.appendChild(document.createTextNode(working.slice(last, m.index)));
      const name = EMOJI_MAP[m[1]];
      const span = document.createElement('span');
      span.className = 'icn';
      span.setAttribute('data-icn', name);
      span.innerHTML = svgMarkup(name);
      frag.appendChild(span);
      last = m.index + m[0].length;
    }
    if (last < working.length) frag.appendChild(document.createTextNode(working.slice(last)));
    parent.replaceChild(frag, node);
  } else if (working !== text) {
    node.nodeValue = working;
  }
}

// Process one element subtree once. Uses a manual stack (no deep recursion).
function processSubtree(root) {
  if (root.nodeType === Node.TEXT_NODE) { processTextNode(root); return; }
  if (root.nodeType !== Node.ELEMENT_NODE || shouldSkip(root)) return;

  const stack = [root];
  const en = getLang() === 'en';
  while (stack.length) {
    const el = stack.pop();
    if (seen.has(el)) continue;
    seen.add(el);

    // Process this element's direct text-node children.
    let child = el.firstChild;
    while (child) {
      const next = child.nextSibling;
      if (child.nodeType === Node.TEXT_NODE) processTextNode(child);
      child = next;
    }

    if (en) {
      const ph = el.getAttribute('placeholder');
      if (ph) { const t = translateText(ph); if (t !== ph) el.setAttribute('placeholder', t); }
      const ti = el.getAttribute('title');
      if (ti) { const t = translateText(ti); if (t !== ti) el.setAttribute('title', t); }
    }

    // Queue element children (skip heavy/3rd-party subtrees).
    let c = el.firstElementChild;
    while (c) {
      if (!shouldSkip(c)) stack.push(c);
      c = c.nextElementSibling;
    }
  }
}

let observer = null;
let scheduled = false;
const pending = new Set();
let paused = false;

function flush() {
  scheduled = false;
  if (paused) return;
  const nodes = Array.from(pending);
  pending.clear();
  if (observer) observer.disconnect();
  for (const n of nodes) {
    if (n.isConnected) {
      try { processSubtree(n); } catch (e) { /* never break the UI */ }
    }
  }
  if (observer) observer.observe(document.body, { childList: true, subtree: true });
}

function schedule(node) {
  if (paused) return;
  pending.add(node);
  if (!scheduled) { scheduled = true; requestAnimationFrame(flush); }
}

export function pauseEnhancer() { paused = true; pending.clear(); }
export function resumeEnhancer() { paused = false; try { processSubtree(document.body); } catch (e) {} }

export function startEnhancer() {
  try { processSubtree(document.body); } catch (e) {}
  observer = new MutationObserver((mutations) => {
    for (const mut of mutations) {
      const added = mut.addedNodes;
      for (let i = 0; i < added.length; i++) {
        const n = added[i];
        if (n.nodeType === Node.ELEMENT_NODE) schedule(n);
        else if (n.nodeType === Node.TEXT_NODE && n.parentNode && n.parentNode.nodeType === Node.ELEMENT_NODE) schedule(n.parentNode);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

export function reprocessAll() {
  try { processSubtree(document.body); } catch (e) {}
}
