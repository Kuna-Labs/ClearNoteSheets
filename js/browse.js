// ClearNote Sheets: catalog page (all sheets, search, artists, albums, new releases)
import './site.js';
import { loadCatalog, search, SORTS, normalize } from './catalog.js';
import { esc, browseHref, coverHTML, cardHTML, rowHTML, bindPayhip, errorStateHTML } from './ui.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
let savedView = 'list';
try { savedView = localStorage.getItem('cn-view') || 'list'; } catch { /* ignore */ }

const state = {
  q: params.get('q') || '',
  artist: params.get('artist') || '',
  album: params.get('album') || '',
  letter: (params.get('letter') || '').toUpperCase(),
  isNew: params.get('new') === '1',
  by: ['artist', 'album'].includes(params.get('by')) ? params.get('by') : '',
  sort: SORTS[params.get('sort')] ? params.get('sort') : '',
  view: savedView === 'grid' ? 'grid' : 'list',
};
const PAGE = 60;
let shown = PAGE;
let catalog;

const el = {
  title: $('[data-browse-title]'), sub: $('[data-browse-sub]'), toolbar: $('[data-toolbar]'),
  form: $('[data-browse-search]'), q: $('[data-browse-q]'), sort: $('[data-sort]'), filters: $('[data-filters]'),
  az: $('[data-az]'), count: $('[data-count]'), results: $('[data-results]'),
  moreWrap: $('[data-more-wrap]'), more: $('[data-more]'),
};

const url = (next = {}) => {
  const s = { ...state, ...next };
  return browseHref({ q: s.q, artist: s.artist, album: s.album, letter: s.letter, new: s.isNew ? '1' : '', by: s.by, sort: s.sort });
};
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const xIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>';

function setHeading(title, sub = '') {
  el.title.textContent = title;
  el.sub.textContent = sub;
  el.sub.hidden = !sub;
  document.title = `${title} | ClearNote Sheets`;
}

function markMode() {
  const mode = state.by || 'songs';
  document.querySelectorAll('[data-mode]').forEach((a) => {
    if (a.dataset.mode === mode) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.querySelectorAll('.nav a, .mobile-nav a').forEach((a) => {
    const href = a.getAttribute('href') || '';
    const isNewLink = href.includes('new=1');
    const isBrowse = href === 'browse.html';
    if ((isNewLink && state.isNew) || (isBrowse && !state.isNew && !state.by)) a.setAttribute('aria-current', 'page');
  });
}

// ---------- songs ----------
function filtered() {
  let list = state.isNew ? catalog.newReleases : catalog.all;
  if (state.artist) list = list.filter((s) => s.artist === state.artist);
  if (state.album) list = list.filter((s) => s.album === state.album);
  if (state.letter) list = list.filter((s) => s._letter === state.letter);
  if (state.q) {
    const hits = search({ all: list }, state.q);
    return state.sort ? [...hits].sort(SORTS[state.sort].fn) : hits;
  }
  const key = state.sort || (state.letter ? 'title' : 'new');
  return [...list].sort(SORTS[key].fn);
}

function renderSort() {
  const opts = [];
  if (state.q) opts.push(['', 'Best match']);
  for (const [key, { label }] of Object.entries(SORTS)) opts.push([key, label]);
  const current = state.sort || (state.q ? '' : state.letter ? 'title' : 'new');
  el.sort.innerHTML = opts.map(([v, l]) => `<option value="${v}"${v === current ? ' selected' : ''}>${l}</option>`).join('');
}

function renderFilters() {
  const chips = [];
  const chip = (label, next, what) => chips.push(`<a class="filter-chip" href="${url(next)}" aria-label="Remove filter: ${esc(what)}">${esc(label)}${xIcon}</a>`);
  if (state.isNew) chip('New releases', { isNew: false }, 'new releases');
  if (state.artist) chip(state.artist, { artist: '', album: '' }, `artist ${state.artist}`);
  if (state.album) chip(state.album, { album: '' }, `album ${state.album}`);
  if (state.letter) chip(state.letter === '#' ? 'Starts with a number' : `Starts with ${state.letter}`, { letter: '' }, 'first letter');
  el.filters.innerHTML = chips.join('');
  el.filters.hidden = !chips.length;
}

function renderAZ() {
  if (state.q) { el.az.hidden = true; return; }
  const base = state.isNew ? catalog.newReleases : catalog.all;
  const pool = base.filter((s) => (!state.artist || s.artist === state.artist) && (!state.album || s.album === state.album));
  const has = new Set(pool.map((s) => s._letter));
  const letters = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#'];
  el.az.innerHTML = `<a href="${url({ letter: '' })}"${state.letter ? '' : ' aria-current="true"'}>All</a>` +
    letters.map((L) => has.has(L)
      ? `<a href="${url({ letter: L, sort: state.sort || 'title' })}"${state.letter === L ? ' aria-current="true"' : ''} aria-label="Starts with ${L === '#' ? 'a number or symbol' : L}">${L}</a>`
      : `<span aria-hidden="true">${L}</span>`).join('');
  el.az.hidden = pool.length < 12;
}

function renderSongs() {
  el.toolbar.hidden = false;
  const list = filtered();
  const albumArtist = state.album ? (state.artist || list[0]?.artist || '') : '';

  let title = 'All sheets';
  let sub = 'Search, sort, or jump to a letter to find a song fast.';
  if (state.isNew) { title = 'New releases'; sub = 'The latest songs, transcribed within 24–72 hours of release.'; }
  if (state.artist && !state.album) { title = state.artist; sub = 'Every sheet by this artist.'; }
  if (state.album) { title = state.album; sub = albumArtist ? `Album by ${albumArtist}` : ''; }
  if (state.letter && !state.artist && !state.album) title = state.letter === '#' ? 'Songs starting with a number' : `Songs starting with ${state.letter}`;
  if (state.q) { title = `Results for “${state.q}”`; sub = ''; }
  setHeading(title, sub);

  renderSort();
  renderFilters();
  renderAZ();
  document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === state.view)));

  el.count.textContent = plural(list.length, 'sheet');
  if (!list.length) {
    const msg = state.q
      ? `<h2>No sheets match “${esc(state.q)}”</h2><p>Check the spelling, try fewer words, or search by the artist’s name.</p>`
      : '<h2>Nothing here yet</h2><p>New sheets are added every week. Try the full catalog in the meantime.</p>';
    el.results.innerHTML = `<div class="glass empty">${msg}<a class="btn btn--glass" href="browse.html">Browse all sheets</a></div>`;
    el.moreWrap.hidden = true;
    return;
  }
  const page = list.slice(0, shown);
  el.results.innerHTML = state.view === 'grid'
    ? `<ul class="cards">${page.map(cardHTML).join('')}</ul>`
    : `<ol class="rows">${page.map((s) => rowHTML(s)).join('')}</ol>`;
  const left = list.length - page.length;
  el.moreWrap.hidden = left <= 0;
  el.more.textContent = `Show ${Math.min(left, PAGE)} more`;
  bindPayhip();
}

// ---------- artists & albums ----------
function letterOf(name) {
  const ch = normalize(name).charAt(0).toUpperCase();
  return /[A-Z]/.test(ch) ? ch : '#';
}

function renderArtists() {
  el.toolbar.hidden = true;
  el.az.hidden = true;
  el.moreWrap.hidden = true;
  setHeading('Artists', 'Every artist in the store, A to Z.');
  el.count.textContent = plural(catalog.artists.length, 'artist');
  let html = '<ul class="artist-list">';
  let last = '';
  for (const a of catalog.artists) {
    const L = letterOf(a.name);
    if (L !== last) { html += `<li class="letter-head" aria-hidden="true">${L}</li>`; last = L; }
    html += `<li><a href="${browseHref({ artist: a.name })}"><span>${esc(a.name)}</span><span class="chip__count">${a.count}</span></a></li>`;
  }
  el.results.innerHTML = `${html}</ul>`;
}

function renderAlbums() {
  el.toolbar.hidden = true;
  el.az.hidden = true;
  el.moreWrap.hidden = true;
  setHeading('Albums', 'Newest albums first.');
  el.count.textContent = plural(catalog.albums.length, 'album');
  if (!catalog.albums.length) {
    el.results.innerHTML = '<div class="glass empty"><h2>No albums yet</h2><p>Albums appear here once sheets have an album filled in.</p></div>';
    return;
  }
  el.results.innerHTML = `<ul class="albums">${catalog.albums.map((al) => {
    const s = { title: al.name, artist: al.artist, slug: `${al.name}|${al.artist}`, cover_path: al.cover?.cover_path };
    return `<li><a class="album" href="${browseHref({ album: al.name, artist: al.artist })}">${coverHTML(s)}` +
      `<p class="album__title">${esc(al.name)}</p><p class="album__meta">${esc(al.artist)}, ${plural(al.count, 'sheet')}</p></a></li>`;
  }).join('')}</ul>`;
}

function render() {
  markMode();
  if (state.by === 'artist') renderArtists();
  else if (state.by === 'album') renderAlbums();
  else renderSongs();
  el.results.removeAttribute('aria-busy');
}

// ---------- controls ----------
el.q.value = state.q;
let typing;
el.q.addEventListener('input', () => {
  clearTimeout(typing);
  typing = setTimeout(() => {
    state.q = el.q.value.trim();
    shown = PAGE;
    history.replaceState(null, '', url());
    if (catalog) renderSongs();
  }, 140);
});
el.form.addEventListener('submit', (e) => { e.preventDefault(); el.q.blur(); });
el.sort.addEventListener('change', () => {
  state.sort = el.sort.value;
  shown = PAGE;
  history.replaceState(null, '', url());
  renderSongs();
});
document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
  state.view = b.dataset.view;
  try { localStorage.setItem('cn-view', state.view); } catch { /* ignore */ }
  renderSongs();
}));
el.more.addEventListener('click', () => { shown += PAGE; renderSongs(); });

loadCatalog()
  .then((cat) => { catalog = cat; render(); })
  .catch((err) => {
    el.toolbar.hidden = true;
    el.results.innerHTML = errorStateHTML(err.message);
    el.results.removeAttribute('aria-busy');
  });
