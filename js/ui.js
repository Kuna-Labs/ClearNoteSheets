// ClearNote Sheets: shared rendering helpers

import { CONFIG, isConfigured } from './config.js';

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const moneyFmt = new Intl.NumberFormat(CONFIG.locale, { style: 'currency', currency: CONFIG.currency });
export const money = (n) => moneyFmt.format(Number(n) || 0);

export const songHref = (slug) => `song.html?s=${encodeURIComponent(slug)}`;
export function browseHref(params = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, v);
  const s = q.toString();
  return s ? `browse.html?${s}` : 'browse.html';
}

/** Public URL for a stored image path. Full URLs and site-relative assets pass through. */
export function imageUrl(path) {
  if (!path) return '';
  if (/^(https?:|data:|\/\/)/.test(path) || path.startsWith('assets/')) return path;
  if (!isConfigured()) return '';
  const base = CONFIG.supabaseUrl.replace(/\/$/, '');
  const clean = path.split('/').map(encodeURIComponent).join('/');
  return `${base}/storage/v1/object/public/${CONFIG.imageBucket}/${clean}`;
}

// ---------- icons ----------
export const icon = {
  bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/></svg>',
  plus: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  zoom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5M11 8v6M8 11h6"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14"/></svg>',
};

const QUARTER = '<svg viewBox="0 0 10 18" aria-hidden="true"><ellipse cx="4" cy="14.6" rx="3.6" ry="2.6" transform="rotate(-22 4 14.6)" fill="currentColor"/><path d="M7.1 13.6V1.2" stroke="currentColor" stroke-width="1.15" fill="none"/></svg>';

export function tempoHTML(bpm) {
  if (!bpm) return '';
  return `<span class="tempo" aria-label="${esc(bpm)} beats per minute">${QUARTER}<span aria-hidden="true">= ${esc(bpm)}</span></span>`;
}

export function timeSigHTML(ts) {
  if (!ts) return '';
  const m = String(ts).trim().match(/^(\d{1,2})\s*\/\s*(\d{1,2})$/);
  if (!m) return `<span>${esc(ts)}</span>`;
  return `<span class="timesig" aria-label="${m[1]}/${m[2]} time"><span aria-hidden="true">${m[1]}</span><span aria-hidden="true">${m[2]}</span></span>`;
}

/** Plain-text facts for tight spaces: "G minor, 96 BPM, 4/4". */
export function factsText(s) {
  return [s.musical_key, s.bpm ? `${s.bpm} BPM` : '', s.time_signature].filter(Boolean).join(', ');
}

// ---------- dates ----------
const rtf = new Intl.RelativeTimeFormat(CONFIG.locale, { numeric: 'auto' });
const dayFmt = new Intl.DateTimeFormat(CONFIG.locale, { month: 'short', day: 'numeric' });
const longFmt = new Intl.DateTimeFormat(CONFIG.locale, { month: 'long', day: 'numeric', year: 'numeric' });
export const longDate = (d) => longFmt.format(d);

export function relTime(date) {
  const diff = (date.getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 3600) return rtf.format(Math.round(diff / 60) || -1, 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 7) return rtf.format(Math.round(diff / 86400), 'day');
  return dayFmt.format(date);
}

/** "Added the day it came out" / "Added 2 days after release": the 24-72 hour promise, shown. */
export function speedNote(s) {
  if (!s._released) return '';
  const day = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((day(s._added) - day(s._released)) / 864e5);
  if (days < 0 || days > 6) return '';
  if (days === 0) return 'Added the day it came out';
  return `Added ${days} day${days === 1 ? '' : 's'} after release`;
}

// ---------- covers ----------
function hash(str) {
  let h = 2166136261;
  for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}

const STAFF = '<svg class="cover__staff" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width=".6"><path d="M0 4h100M0 12h100M0 20h100M0 28h100M0 36h100"/></g></svg>';

export function coverHTML(s, { tiny = false, eager = false, sizes = '' } = {}) {
  const src = imageUrl(s.cover_path);
  const alt = `Cover art for ${s.title} by ${s.artist}`;
  if (src) {
    return `<img class="cover" src="${esc(src)}" alt="${esc(alt)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" width="600" height="600"${sizes ? ` sizes="${sizes}"` : ''}>`;
  }
  const v = hash(s.slug || s.title) % 5;
  const initial = esc((s.title || '?').trim().charAt(0).toUpperCase());
  return `<div class="cover cover--auto${tiny ? ' cover--tiny' : ''}" data-v="${v}" data-initial="${initial}" role="img" aria-label="${esc(alt)}">` +
    `${STAFF}<span class="cover__title">${esc(s.title)}</span><span class="cover__artist">${esc(s.artist)}</span></div>`;
}

// ---------- product snippets ----------
const CART = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4h2.2l2.1 10.4a1.6 1.6 0 0 0 1.6 1.3h8.3a1.6 1.6 0 0 0 1.6-1.2L20.5 8H6.1"/><circle cx="9.5" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/></svg>';

export function cardHTML(s) {
  const href = songHref(s.slug);
  const key = esc(s.payhip_key || '');
  const cart = s.payhip_key
    ? `<a class="card__cart payhip-add-to-cart-button" href="https://payhip.com/b/${key}" data-product="${key}" data-theme="none" aria-label="Add ${esc(s.title)} to cart">${CART}</a>`
    : '';
  return `<li class="card"><a class="card__media" href="${href}" tabindex="-1" aria-hidden="true">${coverHTML(s)}</a>` +
    `<div class="card__body"><a class="card__title" href="${href}">${esc(s.title)}</a>` +
    `<p class="card__artist">${esc(s.artist)}</p>` +
    `<div class="card__foot"><span class="card__price">${money(s.price)}</span>${cart}</div></div></li>`;
}

export function cartButtonHTML(s, { label = 'Add to cart', short = 'Add', cls = 'btn btn--glass' } = {}) {
  if (!s.payhip_key) return '';
  const key = esc(s.payhip_key);
  return `<a class="${cls} payhip-add-to-cart-button" href="https://payhip.com/b/${key}" data-product="${key}" data-theme="none" ` +
    `aria-label="Add ${esc(s.title)} to cart">${icon.plus}<span class="label-long">${esc(label)}</span><span class="label-short">${esc(short)}</span></a>`;
}

export function buyButtonHTML(s, { label = 'Buy now', cls = 'btn btn--solid' } = {}) {
  if (!s.payhip_key) return '';
  const key = esc(s.payhip_key);
  return `<a class="${cls} payhip-buy-button" href="https://payhip.com/b/${key}" data-product="${key}" data-theme="none">${esc(label)}</a>`;
}

export function rowHTML(s, { added = false } = {}) {
  const href = songHref(s.slug);
  const facts = factsText(s);
  return `<li class="row">` +
    `<a class="row__thumb" href="${href}" tabindex="-1" aria-hidden="true">${coverHTML(s, { tiny: true })}</a>` +
    `<div class="row__main">` +
      `<a class="row__title" href="${href}">${esc(s.title)}</a>` +
      `<div class="row__sub"><a href="${browseHref({ artist: s.artist })}">${esc(s.artist)}</a>${s.is_new_release ? '<span class="tag">New release</span>' : ''}</div>` +
      (facts ? `<div class="row__facts-inline">${esc(facts)}</div>` : '') +
    `</div>` +
    `<span class="row__fact">${esc(s.musical_key || '')}</span>` +
    `<span class="row__fact">${s.bpm ? tempoHTML(s.bpm) : ''}</span>` +
    `<span class="row__fact">${esc(s.time_signature || '')}</span>` +
    `<div class="row__end">` +
      (added ? `<span class="row__added row__fact">${esc(relTime(s._added))}</span>` : '') +
      `<span class="price row__price">${money(s.price)}</span>` +
      `<span class="row__action">${cartButtonHTML(s)}</span>` +
    `</div></li>`;
}

// ---------- Payhip ----------
/** Payhip binds its buttons when the page loads. Buttons drawn after that need a nudge. */
export function bindPayhip() {
  if (window.Payhip && window.PayhipSetupFinished && window.Payhip.Button) {
    try { window.Payhip.Button.initiate(); } catch (e) { console.warn('Payhip buttons could not be set up', e); }
  }
}

// ---------- toast ----------
let toastTimer;
export function toast(message, tone = '') {
  let el = document.querySelector('[data-toast]');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.dataset.toast = '';
    document.body.append(el);
  }
  el.textContent = message;
  if (tone) el.dataset.tone = tone; else delete el.dataset.tone;
  el.dataset.show = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { delete el.dataset.show; }, 3200);
}

export function errorStateHTML(message) {
  return `<div class="glass error-state" role="alert"><h2>The catalog didn't load</h2>` +
    `<p>${esc(message)} Check your connection and try again.</p>` +
    `<button class="btn btn--solid" type="button" data-retry>Try again</button></div>`;
}
