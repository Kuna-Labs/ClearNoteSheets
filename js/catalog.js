// ClearNote Sheets: catalog data
// Loads every published sheet once (small enough for a sheet-music store), keeps it in
// sessionStorage for a few minutes, and does browsing and search in the browser, so
// filtering and typing feel instant.

import { CONFIG, isConfigured } from './config.js';

const COLUMNS = [
  'id', 'slug', 'title', 'artist', 'album', 'price', 'musical_key', 'bpm', 'time_signature',
  'release_date', 'cover_path', 'preview_path', 'payhip_key', 'is_new_release', 'created_at'
].join(',');
const CACHE_KEY = 'cn:catalog:v1';
const PAGE = 1000;

export const isDemo = () => !isConfigured();

function apiHeaders() {
  const key = CONFIG.supabaseKey;
  const h = { apikey: key, Accept: 'application/json' };
  // Legacy anon keys are JWTs and also go in Authorization; publishable keys don't.
  if (key.startsWith('eyJ')) h.Authorization = `Bearer ${key}`;
  return h;
}

async function fetchPublished(filter = '') {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const url = `${CONFIG.supabaseUrl.replace(/\/$/, '')}/rest/v1/sheets?select=${COLUMNS}` +
      `&published=eq.true${filter}&order=created_at.desc&limit=${PAGE}&offset=${from}`;
    const res = await fetch(url, { headers: apiHeaders() });
    if (!res.ok) throw new Error(`The catalog request failed (${res.status}).`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

async function fetchDemo() {
  const res = await fetch(new URL('../data/demo-catalog.json', import.meta.url));
  if (!res.ok) throw new Error('The demo catalog could not be loaded.');
  const { sheets } = await res.json();
  const now = Date.now();
  return sheets.map((s, i) => {
    const added = new Date(now - s.added_hours_ago * 36e5);
    const released = s.release_days_before_added == null ? null
      : new Date(added.getTime() - s.release_days_before_added * 864e5);
    const { added_hours_ago, release_days_before_added, ...rest } = s;
    return { id: `demo-${i + 1}`, ...rest, created_at: added.toISOString(), release_date: released ? isoDay(released) : null };
  });
}

function isoDay(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function readCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { t, rows } = JSON.parse(raw);
    if (Date.now() - t > CONFIG.cacheMinutes * 60e3) return null;
    return rows;
  } catch { return null; }
}

function writeCache(rows) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), rows })); } catch { /* storage full or blocked */ }
}

export function clearCatalogCache() {
  try { sessionStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
  memo = null;
}

let memo = null;

/** Every published sheet plus handy groupings. */
export async function loadCatalog({ fresh = false } = {}) {
  if (memo && !fresh) return memo;
  let rows = (!fresh && !isDemo()) ? readCache() : null;
  if (!rows) {
    rows = isDemo() ? await fetchDemo() : await fetchPublished();
    if (!isDemo()) writeCache(rows);
  }
  memo = prepare(rows);
  return memo;
}

/** One sheet straight from Supabase, for links to a sheet newer than the cached catalog. */
export async function fetchSheet(slug) {
  if (isDemo()) return null;
  const rows = await fetchPublished(`&slug=eq.${encodeURIComponent(slug)}`);
  return rows[0] ? prepareOne(rows[0]) : null;
}

// ---------- shaping ----------

export function normalize(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f\u0591-\u05C7]/g, '')   // accents, Hebrew vowels and cantillation
    .toLowerCase()
    .replace(/['’‘`´"“”]/g, '')                     // B'ezras -> bezras
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function firstLetter(title) {
  const ch = normalize(title).charAt(0).toUpperCase();
  return /[A-Z]/.test(ch) ? ch : '#';
}

function prepareOne(s) {
  const title = normalize(s.title), artist = normalize(s.artist), album = normalize(s.album);
  return {
    ...s,
    price: Number(s.price),
    _title: title,
    _artist: artist,
    _album: album,
    _titleWords: title.split(' '),
    _artistWords: artist.split(' '),
    _words: `${title} ${artist} ${album}`.split(' ').filter(Boolean),
    _added: new Date(s.created_at),
    _released: s.release_date ? new Date(`${s.release_date}T12:00:00`) : null,
    _letter: firstLetter(s.title),
  };
}

function prepare(rows) {
  const all = rows.map(prepareOne).sort((a, b) => b._added - a._added);
  const bySlug = new Map(all.map((s) => [s.slug, s]));

  const artistMap = new Map();
  const albumMap = new Map();
  for (const s of all) {
    const a = artistMap.get(s.artist) || { name: s.artist, count: 0, latest: s._added };
    a.count += 1;
    artistMap.set(s.artist, a);
    if (s.album) {
      const key = `${s.album}\u0000${s.artist}`;
      const al = albumMap.get(key) || { name: s.album, artist: s.artist, count: 0, cover: null, latest: s._added };
      al.count += 1;
      if (!al.cover && s.cover_path) al.cover = s;
      albumMap.set(key, al);
    }
  }
  const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  const artists = [...artistMap.values()].sort(byName);
  const albums = [...albumMap.values()].sort((a, b) => b.latest - a.latest);

  const releaseTime = (s) => (s._released || s._added).getTime();
  const newReleases = all.filter((s) => s.is_new_release)
    .sort((a, b) => releaseTime(b) - releaseTime(a) || b._added - a._added);

  return { all, bySlug, artists, albums, newReleases };
}

// ---------- sorting ----------

const collate = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
export const SORTS = {
  new: { label: 'Newest first', fn: (a, b) => b._added - a._added },
  title: { label: 'Song title, A to Z', fn: (a, b) => collate.compare(a.title, b.title) },
  artist: { label: 'Artist, A to Z', fn: (a, b) => collate.compare(a.artist, b.artist) || collate.compare(a.title, b.title) },
  price: { label: 'Price, low to high', fn: (a, b) => a.price - b.price || collate.compare(a.title, b.title) },
};

// ---------- search ----------

function editDistanceWithin(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}

function tokenScore(s, t) {
  if (s._titleWords.some((w) => w.startsWith(t))) return 10;
  if (s._title.includes(t)) return 7;
  if (s._artistWords.some((w) => w.startsWith(t))) return 6;
  if (s._artist.includes(t)) return 4;
  if (s._album.includes(t)) return 3;
  // spelling slips and transliteration variants: yerushalaim / yerushalayim
  if (t.length >= 4) {
    const max = t.length >= 8 ? 2 : 1;
    if (s._words.some((w) => editDistanceWithin(w, t, max) ||
      (w.length > t.length && editDistanceWithin(w.slice(0, t.length), t, max)))) return 2;
  }
  return 0;
}

/** Sheets matching every word of the query, best matches first. */
export function search(catalog, query, limit = Infinity) {
  const q = normalize(query);
  if (!q) return [];
  const tokens = q.split(' ');
  const hits = [];
  for (const s of catalog.all) {
    let score = 0;
    let ok = true;
    for (const t of tokens) {
      const sc = tokenScore(s, t);
      if (!sc) { ok = false; break; }
      score += sc;
    }
    if (!ok) continue;
    if (s._title === q) score += 80;
    else if (s._title.startsWith(q)) score += 40;
    else if (s._title.includes(q)) score += 20;
    if (s._artist === q || s._artist.startsWith(q)) score += 12;
    hits.push([score, s]);
  }
  hits.sort((a, b) => b[0] - a[0] || b[1]._added - a[1]._added);
  return hits.slice(0, limit).map((h) => h[1]);
}
