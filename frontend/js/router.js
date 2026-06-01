// ============================================================
// Tiny hash-based router
// ============================================================

const routes = [];
let notFound = null;
let currentCleanup = null;

export function route(pattern, handler) {
  // pattern like '/properties/:id'
  const keys = [];
  const rx = new RegExp(
    '^' + pattern.replace(/:[^/]+/g, (m) => { keys.push(m.slice(1)); return '([^/]+)'; }) + '$'
  );
  routes.push({ rx, keys, handler, pattern });
}

export function setNotFound(handler) { notFound = handler; }

export function navigate(path, replace = false) {
  const hash = '#' + path;
  if (replace) location.replace(hash);
  else location.hash = hash;
}

export function currentPath() {
  const raw = location.hash.slice(1) || '/';
  return raw.split('?')[0];
}

export function queryParams() {
  const raw = location.hash.slice(1) || '/';
  const qi = raw.indexOf('?');
  if (qi < 0) return {};
  return Object.fromEntries(new URLSearchParams(raw.slice(qi + 1)));
}

async function resolve() {
  const path = currentPath();
  if (typeof currentCleanup === 'function') { try { currentCleanup(); } catch {} currentCleanup = null; }

  for (const r of routes) {
    const m = path.match(r.rx);
    if (m) {
      const params = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      window.scrollTo(0, 0);
      const cleanup = await r.handler(params, queryParams());
      if (typeof cleanup === 'function') currentCleanup = cleanup;
      return;
    }
  }
  if (notFound) notFound();
}

export function startRouter() {
  window.addEventListener('hashchange', resolve);
  resolve();
}

export function reload() { resolve(); }
