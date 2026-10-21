// ClearNote Sheets: behaviour shared by every storefront page

import { CONFIG } from './config.js';
import { loadCatalog, search, isDemo } from './catalog.js';
import { esc, money, songHref, browseHref, coverHTML } from './ui.js';

const root = document.documentElement;

// ---------- theme: Auto (follows the device), Light or Dark ----------
// The choice sits in the footer and the phone menu; the admin page has a header button.
const darkQuery = matchMedia('(prefers-color-scheme: dark)');
const theme = () => root.dataset.theme || (darkQuery.matches ? 'dark' : 'light');

function syncTheme() {
  const t = theme();
  const choice = root.dataset.theme || 'auto';
  document.querySelectorAll('[data-theme-choice]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeChoice === choice)));
  document.querySelectorAll('[data-theme-toggle]').forEach((b) => b.setAttribute('aria-label', t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = t === 'dark' ? '#B9C9D6' : '#172B3B';
}
function setTheme(choice) {
  if (choice === 'light' || choice === 'dark') {
    root.dataset.theme = choice;
    try { localStorage.setItem('cn-theme', choice); } catch { /* private mode */ }
  } else {
    delete root.dataset.theme;
    try { localStorage.removeItem('cn-theme'); } catch { /* private mode */ }
  }
  syncTheme();
}
document.querySelectorAll('[data-theme-choice]').forEach((b) => b.addEventListener('click', () => setTheme(b.dataset.themeChoice)));
document.querySelectorAll('[data-theme-toggle]').forEach((b) => b.addEventListener('click', () => setTheme(theme() === 'dark' ? 'light' : 'dark')));
darkQuery.addEventListener?.('change', syncTheme);
syncTheme();

// ---------- Liquid Glass refraction: desktop Chromium only ----------
const ua = navigator.userAgent;
if (/Chrome\/\d+/.test(ua) && !/Mobile|Android/.test(ua) && matchMedia('(pointer: fine)').matches) {
  root.classList.add('can-refract');
}

// ---------- mobile menu ----------
const menuBtn = document.querySelector('[data-menu-toggle]');
const mobileNav = document.getElementById('mobile-nav');
if (menuBtn && mobileNav) {
  menuBtn.addEventListener('click', () => {
    const open = menuBtn.getAttribute('aria-expanded') !== 'true';
    menuBtn.setAttribute('aria-expanded', String(open));
    mobileNav.hidden = !open;
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !mobileNav.hidden) { mobileNav.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); menuBtn.focus(); }
  });
}

// ---------- links and details from config ----------
document.querySelectorAll('[data-account]').forEach((a) => { a.href = CONFIG.payhipAccountUrl; a.target = '_blank'; a.rel = 'noopener'; });
document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = String(new Date().getFullYear()); });
document.querySelectorAll('[data-contact]').forEach((el) => {
  if (!CONFIG.contactEmail) { el.hidden = true; return; }
  el.href = `mailto:${CONFIG.contactEmail}`;
  if (!el.textContent.trim()) el.textContent = CONFIG.contactEmail;
});

if (isDemo() && !document.body.classList.contains('admin')) {
  const note = document.createElement('div');
  note.className = 'demo-note';
  note.innerHTML = '<p>Showing demo songs. Add your Supabase project in <code>js/config.js</code> to show your own catalog.</p>';
  document.querySelector('.site-header')?.after(note);
}

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-retry]')) location.reload();
});

// In the demo catalog the Payhip products aren't real, so explain instead of opening checkout.
if (isDemo()) {
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.payhip-buy-button, .payhip-add-to-cart-button');
    if (!b) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    import('./ui.js').then(({ toast }) => toast('Demo store: checkout opens once real Payhip products are added.'));
  }, true);
}

// ---------- cart badge, kept in step with Payhip's cart ----------
const countEls = document.querySelectorAll('[data-cart-count]');
function showCount(n) {
  countEls.forEach((el) => {
    delete el.dataset.dot;
    if (n > 0) { el.textContent = n > 99 ? '99+' : String(n); el.hidden = false; }
    else { el.textContent = ''; el.hidden = true; }
  });
  try { sessionStorage.setItem('cn:cart', String(n)); } catch { /* ignore */ }
}
try {
  const last = Number(sessionStorage.getItem('cn:cart') || 0);
  if (last > 0) showCount(last);
} catch { /* ignore */ }
window.addEventListener('message', (e) => {
  let host = '';
  try { host = new URL(e.origin).hostname; } catch { return; }
  if (host !== 'payhip.com' || !e.data || typeof e.data !== 'object') return;
  const { action, callbackData = {} } = e.data;
  if (action === 'cart:item:count:changed' && typeof callbackData.newNumberOfCartItems === 'number') {
    showCount(callbackData.newNumberOfCartItems);
  } else if (action === 'cart:page:loaded' && callbackData.cartHasItems === false) {
    showCount(0);
  } else if (action === 'cart:page:loaded' && callbackData.cartHasItems && countEls[0]?.hidden) {
    countEls.forEach((el) => { el.dataset.dot = ''; el.textContent = ''; el.hidden = false; });
  }
});

// ---------- header search with live suggestions ----------
const form = document.querySelector('[data-search]');
if (form) {
  const input = form.querySelector('input[type="search"]');
  const box = form.querySelector('[data-search-results]');
  let active = -1;
  let timer;
  let lastQuery = '';

  const options = () => [...box.querySelectorAll('[role="option"]')];
  const close = () => { box.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; };
  const open = () => { box.hidden = false; input.setAttribute('aria-expanded', 'true'); };
  const mark = (i) => {
    const opts = options();
    opts.forEach((o, n) => o.setAttribute('aria-selected', String(n === i)));
    active = i;
    if (opts[i]) { input.setAttribute('aria-activedescendant', opts[i].id); opts[i].scrollIntoView({ block: 'nearest' }); }
    else input.removeAttribute('aria-activedescendant');
  };

  async function update() {
    const q = input.value.trim();
    lastQuery = q;
    if (!q) { close(); return; }
    let catalog;
    try { catalog = await loadCatalog(); } catch { close(); return; }
    if (q !== lastQuery) return;
    const all = search(catalog, q);
    const top = all.slice(0, 6);
    if (!top.length) {
      box.innerHTML = `<p class="search__none">No sheets match “${esc(q)}”. Try the artist’s name or a shorter spelling.</p>` +
        `<a class="search__all" href="browse.html">Browse all sheets</a>`;
    } else {
      box.innerHTML = top.map((s, i) => `<a class="suggest" id="sug-${i}" role="option" aria-selected="false" href="${songHref(s.slug)}">` +
        `${coverHTML(s, { tiny: true })}<span style="min-width:0"><span class="suggest__title" style="display:block">${esc(s.title)}</span>` +
        `<span class="suggest__artist" style="display:block">${esc(s.artist)}</span></span>` +
        `<span class="suggest__price">${money(s.price)}</span></a>`).join('') +
        `<a class="search__all" href="${browseHref({ q })}">${all.length > top.length ? `See all ${all.length} results` : 'Open in the catalog'}</a>`;
    }
    active = -1;
    open();
  }

  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(update, 90); });
  input.addEventListener('focus', () => { loadCatalog().catch(() => {}); if (input.value.trim()) update(); });
  input.addEventListener('keydown', (e) => {
    const opts = options();
    if (e.key === 'ArrowDown' && !box.hidden) { e.preventDefault(); mark(Math.min(active + 1, opts.length - 1)); }
    else if (e.key === 'ArrowUp' && !box.hidden) { e.preventDefault(); mark(Math.max(active - 1, -1)); }
    else if (e.key === 'Enter' && active >= 0 && opts[active]) { e.preventDefault(); location.href = opts[active].href; }
    else if (e.key === 'Escape') { close(); }
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = input.value.trim();
    location.href = browseHref(q ? { q } : {});
  });
  document.addEventListener('click', (e) => { if (!form.contains(e.target)) close(); });
}
