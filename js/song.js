// ClearNote Sheets: song page
import './site.js';
import { CONFIG } from './config.js';
import { loadCatalog, fetchSheet, isDemo, clearCatalogCache } from './catalog.js';
import {
  esc, money, browseHref, coverHTML, cardHTML, imageUrl, tempoHTML, timeSigHTML, factsText, longDate,
  buyButtonHTML, cartButtonHTML, bindPayhip, errorStateHTML, icon,
} from './ui.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const slug = (params.get('s') || decodeURIComponent(location.hash.replace(/^#/, ''))).trim();
const article = $('[data-song]');

function setMeta(name, content) {
  let m = document.querySelector(`meta[name="${name}"]`);
  if (!m) { m = document.createElement('meta'); m.name = name; document.head.append(m); }
  m.content = content;
}

function notFound() {
  document.title = 'Sheet not found | ClearNote Sheets';
  article.innerHTML = '<div class="glass empty"><h1 style="font-size:var(--fs-2xl)">This sheet isn’t available</h1>' +
    '<p>It may have been renamed or taken down. Search for the song above, or browse the catalog.</p>' +
    '<a class="btn btn--solid" href="browse.html">Browse all sheets</a></div>';
  article.removeAttribute('aria-busy');
}

function cell(label, html, filled) {
  return `<div><dt>${label}</dt><dd${filled ? '' : ' class="is-empty"'}>${filled ? html : 'Not listed'}</dd></div>`;
}

function render(s, cat) {
  const facts = factsText(s);
  document.title = `${s.title} – ${s.artist} sheet music | ClearNote Sheets`;
  setMeta('description', `Sheet music for “${s.title}” by ${s.artist}${facts ? ` (${facts})` : ''}. Instant PDF download after checkout.`);

  $('[data-crumbs]').innerHTML = `<ol><li><a href="browse.html">Browse</a></li>` +
    `<li><a href="${browseHref({ artist: s.artist })}">${esc(s.artist)}</a></li><li aria-current="page">${esc(s.title)}</li></ol>`;

  const preview = imageUrl(s.preview_path);
  const previewHTML = preview
    ? `<button class="paper" type="button" data-zoom aria-label="Enlarge the sheet preview">` +
      `<img src="${esc(preview)}" alt="Preview of the sheet music for ${esc(s.title)}" width="850" height="1100" decoding="async">` +
      `<span class="paper__tag">Preview</span><span class="paper__zoom" aria-hidden="true">${icon.zoom}</span></button>`
    : '<div class="paper paper--empty">Preview coming soon</div>';

  const dates = [];
  if (s._released) dates.push(`Released ${longDate(s._released)}.`);
  dates.push(`Added to the store ${longDate(s._added)}.`);

  const buy = s.payhip_key
    ? `<div class="song__buttons">${buyButtonHTML(s)}${cartButtonHTML(s)}</div>`
    : '<p class="song__assure">This sheet isn’t available to buy yet.</p>';

  article.innerHTML = `<div class="song__grid">
    <figure class="song__preview">${previewHTML}
      <figcaption>The full sheet downloads as a PDF right after checkout.</figcaption></figure>
    <div class="song__info"><div class="glass song__panel">
      ${s.is_new_release ? '<p class="song__new"><span class="tag">New release</span></p>' : ''}
      <div class="song__head">${coverHTML(s, { eager: true })}<div style="min-width:0">
        <h1 class="song__title">${esc(s.title)}</h1>
        <p class="song__by">by <a href="${browseHref({ artist: s.artist })}">${esc(s.artist)}</a>` +
        `${s.album ? `, from <a href="${browseHref({ album: s.album, artist: s.artist })}">${esc(s.album)}</a>` : ''}</p>
      </div></div>
      <dl class="chart">${cell('Key', esc(s.musical_key), !!s.musical_key)}${cell('BPM', tempoHTML(s.bpm), !!s.bpm)}` +
      `${cell('Time', timeSigHTML(s.time_signature), !!s.time_signature)}</dl>
      <div class="song__buy">
        <p class="song__price">${money(s.price)}</p>
        ${buy}
        <p class="song__assure">${icon.download}<span>Instant PDF download after checkout, plus a copy by email. ` +
        `Pay by card, PayPal and more through Payhip.</span></p>
      </div>
      <p class="song__dates">${dates.join(' ')}</p>
    </div></div></div>`;
  article.removeAttribute('aria-busy');

  // more from the artist, or the newest sheets when this is their only one
  let more = cat.all.filter((x) => x.artist === s.artist && x.slug !== s.slug);
  let title = `More from ${s.artist}`;
  let link = browseHref({ artist: s.artist });
  let linkText = `All sheets by ${s.artist}`;
  if (!more.length) {
    more = cat.all.filter((x) => x.slug !== s.slug);
    title = 'Recently added';
    link = 'browse.html';
    linkText = 'See the full catalog';
  }
  if (more.length) {
    $('[data-more-title]').textContent = title;
    const a = $('[data-more-link]');
    a.href = link;
    a.textContent = linkText;
    $('[data-more-list]').innerHTML = more.slice(0, 6).map(cardHTML).join('');
    $('[data-more]').hidden = false;
  }

  // structured data for search engines
  const abs = (u) => (u ? new URL(u, location.href).href : null);
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${s.title} sheet music`,
    description: `Sheet music for “${s.title}” by ${s.artist}.${facts ? ` ${facts}.` : ''}`,
    image: [abs(imageUrl(s.cover_path)), abs(preview)].filter(Boolean),
    sku: s.slug,
    brand: { '@type': 'Brand', name: 'ClearNote Sheets' },
    offers: {
      '@type': 'Offer', price: Number(s.price).toFixed(2), priceCurrency: CONFIG.currency,
      availability: 'https://schema.org/InStock', url: location.href,
    },
  };
  const tag = document.createElement('script');
  tag.type = 'application/ld+json';
  tag.textContent = JSON.stringify(ld);
  document.head.append(tag);

  // enlarge the preview
  const dlg = $('[data-lightbox]');
  const img = $('[data-lightbox-img]');
  article.addEventListener('click', (e) => {
    if (!e.target.closest('[data-zoom]') || !preview) return;
    img.src = preview;
    img.alt = `Preview of the sheet music for ${s.title}`;
    if (typeof dlg.showModal === 'function') dlg.showModal(); else window.open(preview, '_blank');
  });
  $('[data-lightbox-close]').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

  bindPayhip();
}

async function main() {
  if (!slug) { notFound(); return; }
  let cat;
  let s;
  try {
    cat = await loadCatalog();
    s = cat.bySlug.get(slug);
    if (!s && !isDemo()) {
      s = await fetchSheet(slug);       // published after this visitor's catalog was cached
      if (s) clearCatalogCache();
    }
  } catch (err) {
    article.innerHTML = errorStateHTML(err.message);
    article.removeAttribute('aria-busy');
    return;
  }
  if (!s) { notFound(); return; }
  render(s, cat);
}

main();
