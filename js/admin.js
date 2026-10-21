// ClearNote Sheets: store admin
// Sign in, then add, edit, publish or delete sheets. Images are resized in the browser
// and stored in Supabase Storage; the PDF itself lives in Payhip.
import './site.js';
import { CONFIG, isConfigured } from './config.js';
import { clearCatalogCache, normalize } from './catalog.js';
import { esc, money, imageUrl, coverHTML, songHref, toast } from './ui.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const BUCKET = CONFIG.imageBucket;
const STORED = (p) => p && !/^(https?:|data:|assets\/)/.test(p);

const views = Object.fromEntries($$('[data-view]').map((v) => [v.dataset.view, v]));
function show(name) {
  for (const [key, v] of Object.entries(views)) v.hidden = key !== name;
  $$('[data-signout]').forEach((b) => { b.hidden = !(name === 'app' || name === 'denied'); });
  if (name !== 'app') $$('[data-user]').forEach((u) => { u.textContent = ''; });
}

const form = $('[data-form]');
const grid = $('[data-grid]');
const list = $('[data-list]');
const fld = (name) => form.elements.namedItem(name);

let sb = null;
let sheets = [];
let current = null;
let dirty = false;
let entered = false;
const pending = { cover: null, preview: null };   // new images waiting to upload
const cleared = { cover: false, preview: false }; // existing images the admin removed

// ---------- helpers ----------
function busy(btn, label) {
  if (!btn.dataset.label) btn.dataset.label = btn.textContent;
  btn.textContent = label;
  btn.disabled = true;
}
function idle(btn) {
  if (btn.dataset.label) btn.textContent = btn.dataset.label;
  delete btn.dataset.label;
  btn.disabled = false;
}
function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function slugify(s) {
  return normalize(s).replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'sheet';
}
function uniqueSlug(base) {
  const taken = new Set(sheets.map((s) => s.slug));
  let slug = base;
  let n = 2;
  while (taken.has(slug)) slug = `${base}-${n++}`;
  return slug;
}
/** Accepts payhip.com/b/AbCd, payhip.com/buy?link=AbCd, a custom-domain /b/ link, or the bare key. */
function payhipKey(value) {
  const s = String(value || '').trim();
  if (!s) return null;
  const m = s.match(/\/b\/([A-Za-z0-9]+)/) || s.match(/[?&]link=([A-Za-z0-9]+)/);
  if (m) return m[1];
  return /^[A-Za-z0-9]{3,16}$/.test(s) ? s : null;
}
function friendly(error) {
  if (error.code === '23505') return 'Another sheet already uses this link name. Change the title slightly and save again.';
  if (error.code === '42501' || /row-level security/i.test(error.message)) {
    return 'Supabase refused the change. Check that this account is on the admin list.';
  }
  return error.message;
}

// ---------- images: resize in the browser before upload ----------
async function loadBitmap(file) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(file); } catch { /* fall back to <img> */ }
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
async function prepareImage(file, maxSide) {
  const src = await loadBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(src.width, src.height));
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  const encode = (type, q) => new Promise((resolve) => canvas.toBlob(resolve, type, q));
  let blob = await encode('image/webp', 0.86);
  if (!blob || blob.type !== 'image/webp') blob = await encode('image/jpeg', 0.88);   // older Safari
  if (!blob) throw new Error('This image could not be converted.');
  return blob;
}
async function upload(kind, blob, slug) {
  const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
  const safe = slug.normalize('NFD').replace(/[^\w-]/g, '').toLowerCase().slice(0, 60) || 'sheet';
  const path = `${kind}s/${safe}-${Date.now().toString(36)}.${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false });
  if (error) throw new Error(`The ${kind} image didn’t upload: ${error.message}`);
  return path;
}
function setImage(kind, url) {
  const box = $(`[data-img="${kind}"]`);
  $('[data-img-preview]', box).innerHTML = url
    ? `<img src="${esc(url)}" alt="">`
    : `<span>${kind === 'cover' ? 'No cover yet' : 'No preview yet'}</span>`;
  $('[data-img-remove]', box).hidden = !url;
}
$$('[data-img]').forEach((box) => {
  const kind = box.dataset.img;
  const input = $('[data-img-input]', box);
  const take = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast('Choose an image file: JPG, PNG or WebP.', 'error'); return; }
    try {
      const blob = await prepareImage(file, kind === 'cover' ? 1200 : 1800);
      pending[kind] = blob;
      cleared[kind] = false;
      dirty = true;
      setImage(kind, URL.createObjectURL(blob));
    } catch {
      toast('That image couldn’t be read. Try a JPG or PNG.', 'error');
    }
  };
  input.addEventListener('change', () => { take(input.files[0]); input.value = ''; });
  $('[data-img-remove]', box).addEventListener('click', () => {
    pending[kind] = null;
    cleared[kind] = true;
    dirty = true;
    setImage(kind, '');
  });
  const zone = $('[data-img-preview]', box);
  zone.addEventListener('dragover', (e) => { e.preventDefault(); box.dataset.drag = ''; });
  zone.addEventListener('dragleave', () => { delete box.dataset.drag; });
  zone.addEventListener('drop', (e) => { e.preventDefault(); delete box.dataset.drag; take(e.dataTransfer.files[0]); });
});

// ---------- list ----------
function renderList() {
  const q = normalize($('[data-filter]').value);
  const rows = q ? sheets.filter((s) => normalize(`${s.title} ${s.artist} ${s.album || ''}`).includes(q)) : sheets;
  $('[data-total]').textContent = sheets.length ? `(${sheets.length})` : '';
  if (!sheets.length) { list.innerHTML = '<li class="admin-items__empty">No sheets yet. Add your first one.</li>'; return; }
  if (!rows.length) { list.innerHTML = `<li class="admin-items__empty">Nothing matches “${esc($('[data-filter]').value)}”.</li>`; return; }
  list.innerHTML = rows.map((s) => `<li><button class="admin-item" type="button" data-id="${esc(s.id)}"${current?.id === s.id ? ' aria-current="true"' : ''}>` +
    `${coverHTML(s, { tiny: true })}` +
    `<span class="admin-item__main"><span class="admin-item__title">${esc(s.title)}</span>` +
    `<span class="admin-item__sub">${esc(s.artist)}, ${money(s.price)}</span></span>` +
    `<span class="admin-item__pills">${s.published ? '' : '<span class="pill">Draft</span>'}` +
    `${s.is_new_release ? '<span class="pill pill--new">New</span>' : ''}</span></button></li>`).join('');
}
list.addEventListener('click', (e) => {
  const b = e.target.closest('[data-id]');
  if (b) openEditor(sheets.find((s) => s.id === b.dataset.id));
});
$('[data-filter]').addEventListener('input', renderList);

function fillSuggestions() {
  const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  $('#dl-artists').innerHTML = uniq(sheets.map((s) => s.artist)).map((v) => `<option value="${esc(v)}">`).join('');
  $('#dl-albums').innerHTML = uniq(sheets.map((s) => s.album)).map((v) => `<option value="${esc(v)}">`).join('');
}

async function loadSheets(selectId) {
  const { data, error } = await sb.from('sheets').select('*').order('created_at', { ascending: false });
  if (error) { toast(`Sheets didn’t load: ${error.message}`, 'error'); return; }
  sheets = data || [];
  renderList();
  fillSuggestions();
  if (selectId) {
    const s = sheets.find((x) => x.id === selectId);
    if (s) openEditor(s, { force: true, keepScroll: true });
  }
}

// ---------- editor ----------
function clearErrors() {
  $$('[aria-invalid]', form).forEach((i) => i.removeAttribute('aria-invalid'));
  $$('[data-error-for]', form).forEach((p) => { p.textContent = ''; });
  $('[data-form-msg]').textContent = '';
}
function setError(name, msg) {
  fld(name).setAttribute('aria-invalid', 'true');
  const p = $(`[data-error-for="${name}"]`);
  if (p) p.textContent = msg;
}
function updateSaveLabel() {
  const pub = fld('published').checked;
  $('[data-save]').textContent = current
    ? (pub && !current.published ? 'Save and publish' : 'Save changes')
    : (pub ? 'Publish sheet' : 'Save as a draft');
}
function updatePayhipLink() {
  const key = payhipKey(fld('payhip_link').value);
  const a = $('[data-payhip-open]');
  a.hidden = !key;
  if (key) a.href = `https://payhip.com/b/${key}`;
}

function openEditor(s, { force = false, keepScroll = false } = {}) {
  if (!force && dirty && !confirm('Discard your unsaved changes?')) return;
  current = s || null;
  dirty = false;
  pending.cover = pending.preview = null;
  cleared.cover = cleared.preview = false;
  form.reset();
  clearErrors();
  $('[data-editor-empty]').hidden = true;
  form.hidden = false;
  grid.dataset.editing = '';
  $('[data-editor-title]').textContent = s ? 'Edit sheet' : 'Add a sheet';
  $('[data-steps]').hidden = !!s;
  if (s) {
    fld('title').value = s.title;
    fld('artist').value = s.artist;
    fld('album').value = s.album || '';
    fld('price').value = Number(s.price).toFixed(2);
    fld('musical_key').value = s.musical_key || '';
    fld('bpm').value = s.bpm || '';
    fld('time_signature').value = s.time_signature || '';
    fld('release_date').value = s.release_date || '';
    fld('payhip_link').value = s.payhip_key ? `https://payhip.com/b/${s.payhip_key}` : '';
    fld('is_new_release').checked = !!s.is_new_release;
    fld('published').checked = !!s.published;
  } else {
    fld('is_new_release').checked = true;
    fld('published').checked = true;
    fld('release_date').value = today();
    if (sheets[0]) fld('price').value = Number(sheets[0].price).toFixed(2);   // most sheets share a price
  }
  setImage('cover', s ? imageUrl(s.cover_path) : '');
  setImage('preview', s ? imageUrl(s.preview_path) : '');
  const view = $('[data-view-link]');
  view.hidden = !(s && s.published);
  if (s) view.href = songHref(s.slug);
  $('[data-delete]').hidden = !s;
  updateSaveLabel();
  updatePayhipLink();
  renderList();
  if (!keepScroll && matchMedia('(max-width: 900px)').matches) window.scrollTo({ top: 0 });
  if (!keepScroll && !s) fld('payhip_link').focus({ preventScroll: true });   // the link is the first thing to paste
}

function closeEditor({ force = false } = {}) {
  if (!force && dirty && !confirm('Discard your unsaved changes?')) return;
  current = null;
  dirty = false;
  form.hidden = true;
  $('[data-editor-empty]').hidden = false;
  delete grid.dataset.editing;
  renderList();
}

function readForm() {
  clearErrors();
  const v = (name) => fld(name).value.trim();
  const errors = {};
  if (!v('title')) errors.title = 'Add the song title.';
  if (!v('artist')) errors.artist = 'Add the artist.';
  let rawPrice = v('price').replace(/[^0-9.,]/g, '');
  if (!rawPrice.includes('.')) rawPrice = rawPrice.replace(',', '.');
  const price = Number(rawPrice.replace(/,/g, ''));
  if (!rawPrice || !Number.isFinite(price) || price < 0) errors.price = 'Enter a price like 6.99.';
  let bpm = null;
  if (v('bpm')) {
    bpm = Number(v('bpm'));
    if (!Number.isInteger(bpm) || bpm < 20 || bpm > 400) errors.bpm = 'Use a whole number between 20 and 400.';
  }
  const key = payhipKey(v('payhip_link'));
  if (!key) {
    errors.payhip_link = v('payhip_link')
      ? 'That doesn’t look like a Payhip product link. It should look like payhip.com/b/AbCd.'
      : 'Paste the product link from Payhip.';
  }
  const names = Object.keys(errors);
  names.forEach((n) => setError(n, errors[n]));
  if (names.length) {
    [...form.elements].find((el) => el.getAttribute?.('aria-invalid') === 'true')?.focus();
    return null;
  }
  return {
    title: v('title'),
    artist: v('artist'),
    album: v('album') || null,
    price: Math.round(price * 100) / 100,
    musical_key: v('musical_key') || null,
    bpm,
    time_signature: v('time_signature').replace(/\s+/g, '') || null,
    release_date: fld('release_date').value || null,
    payhip_key: key,
    is_new_release: fld('is_new_release').checked,
    published: fld('published').checked,
  };
}

form.addEventListener('input', (e) => {
  dirty = true;
  const t = e.target;
  if (t.name && t.getAttribute('aria-invalid')) {
    t.removeAttribute('aria-invalid');
    const p = $(`[data-error-for="${t.name}"]`);
    if (p) p.textContent = '';
  }
});
form.addEventListener('change', (e) => {
  dirty = true;
  if (e.target.name === 'published') updateSaveLabel();
});
fld('payhip_link').addEventListener('input', updatePayhipLink);
$('[data-back]').addEventListener('click', () => closeEditor());
$$('[data-new]').forEach((b) => b.addEventListener('click', () => openEditor(null)));
window.addEventListener('beforeunload', (e) => {
  if (!dirty) return;
  e.preventDefault();
  e.returnValue = '';
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const row = readForm();
  if (!row) return;
  const btn = $('[data-save]');
  const isNew = !current;
  const slug = current?.slug || uniqueSlug(slugify(`${row.title} ${row.artist}`));
  const replaced = [];
  try {
    for (const kind of ['cover', 'preview']) {
      const col = `${kind}_path`;
      if (pending[kind]) {
        busy(btn, kind === 'cover' ? 'Uploading the cover…' : 'Uploading the preview…');
        row[col] = await upload(kind, pending[kind], slug);
        if (current?.[col]) replaced.push(current[col]);
      } else if (cleared[kind]) {
        row[col] = null;
        if (current?.[col]) replaced.push(current[col]);
      }
    }
    busy(btn, 'Saving…');
    const res = isNew
      ? await sb.from('sheets').insert({ ...row, slug }).select().single()
      : await sb.from('sheets').update(row).eq('id', current.id).select().single();
    if (res.error) throw new Error(friendly(res.error));
    const stale = replaced.filter(STORED);
    if (stale.length) sb.storage.from(BUCKET).remove(stale).catch(() => {});
    clearCatalogCache();
    const wasPublished = !!current?.published;
    dirty = false;
    idle(btn);
    toast(isNew ? (row.published ? 'Published' : 'Saved as a draft') : (row.published && !wasPublished ? 'Published' : 'Changes saved'));
    await loadSheets(res.data.id);
  } catch (err) {
    idle(btn);
    updateSaveLabel();
    $('[data-form-msg]').textContent = err.message || 'Something went wrong while saving. Try again.';
    toast('Not saved', 'error');
  }
});

$('[data-delete]').addEventListener('click', async () => {
  if (!current) return;
  if (!confirm(`Delete “${current.title}”? It will be removed from the store. The product in Payhip stays as it is.`)) return;
  const btn = $('[data-delete]');
  busy(btn, 'Deleting…');
  const { error } = await sb.from('sheets').delete().eq('id', current.id);
  idle(btn);
  if (error) { toast(friendly(error), 'error'); return; }
  const paths = [current.cover_path, current.preview_path].filter(STORED);
  if (paths.length) sb.storage.from(BUCKET).remove(paths).catch(() => {});
  clearCatalogCache();
  toast('Deleted');
  closeEditor({ force: true });
  await loadSheets();
});

// ---------- auth ----------
async function enter(session) {
  if (entered) return;
  entered = true;
  const { data: ok, error } = await sb.rpc('is_admin');
  if (error || ok !== true) {
    $('[data-denied-email]').textContent = session.user.email || 'This account';
    $('[data-denied-detail]').textContent = error
      ? `Supabase said: ${error.message}. If the database isn’t set up yet, run supabase/schema.sql first.`
      : '';
    show('denied');
    return;
  }
  show('app');
  $$('[data-user]').forEach((u) => { u.textContent = session.user.email || ''; });
  await loadSheets();
}

$('[data-signin]').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  const msg = $('[data-signin-msg]');
  const email = f.elements.email.value.trim();
  const password = f.elements.password.value;
  msg.textContent = '';
  if (!email || !password) { msg.textContent = 'Enter your email and password.'; return; }
  const btn = f.querySelector('[type="submit"]');
  busy(btn, 'Signing in…');
  const { error } = await sb.auth.signInWithPassword({ email, password });
  idle(btn);
  if (error) {
    msg.textContent = /invalid login/i.test(error.message)
      ? 'That email and password don’t match. Try again, or get a sign-in link.'
      : error.message;
  }
});
$('[data-magic]').addEventListener('click', async () => {
  const f = $('[data-signin]');
  const msg = $('[data-signin-msg]');
  const email = f.elements.email.value.trim();
  if (!email) { msg.textContent = 'Enter your email first, then ask for a link.'; f.elements.email.focus(); return; }
  const { error } = await sb.auth.signInWithOtp({
    email, options: { shouldCreateUser: false, emailRedirectTo: location.href.split('#')[0] },
  });
  msg.textContent = error ? error.message : `Check ${email} for a sign-in link.`;
});
$$('[data-signout]').forEach((b) => b.addEventListener('click', async () => {
  if (dirty && !confirm('Discard your unsaved changes?')) return;
  dirty = false;
  await sb.auth.signOut();
}));

async function boot() {
  sb = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);
  sb.auth.onAuthStateChange((event, session) => {
    // Supabase advises not to await its calls inside this callback, so hand off.
    if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) setTimeout(() => enter(session), 0);
    if (event === 'SIGNED_OUT') {
      entered = false;
      current = null;
      show('signin');
    }
  });
  const { data } = await sb.auth.getSession();
  if (!data.session) show('signin');
}

if (!isConfigured()) {
  show('setup');
} else if (!window.supabase?.createClient) {
  show('setup');
  $('[data-setup-msg]').textContent = 'The Supabase library didn’t load. Check your connection, then reload the page.';
} else {
  boot();
}
