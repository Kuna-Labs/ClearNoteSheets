// ClearNote Sheets: home page
import './site.js';
import { loadCatalog } from './catalog.js';
import { cardHTML, bindPayhip, errorStateHTML } from './ui.js';

const $ = (s) => document.querySelector(s);
const newList = $('[data-new-releases]');
const recentList = $('[data-recent]');

function renderNew(cat) {
  let items = cat.newReleases;
  if (!items.length) {
    items = cat.all;
    $('[data-new-title]').textContent = 'Newest Sheets';
    $('[data-new-link]').href = 'browse.html';
  }
  items = items.slice(0, 5);
  newList.innerHTML = items.map(cardHTML).join('');
  newList.removeAttribute('aria-busy');
  return items;
}

function renderRecent(cat, shown) {
  const skip = new Set(shown.map((s) => s.slug));
  let items = cat.all.filter((s) => !skip.has(s.slug));
  if (items.length < 4) items = cat.all;
  recentList.innerHTML = items.slice(0, 12).map(cardHTML).join('');

  // the round arrow pages through the carousel, then back to the start
  const next = $('[data-carousel-next]');
  const sync = () => { next.hidden = recentList.scrollWidth - recentList.clientWidth < 8; };
  next.addEventListener('click', () => {
    const atEnd = recentList.scrollLeft + recentList.clientWidth >= recentList.scrollWidth - 8;
    recentList.scrollTo({ left: atEnd ? 0 : recentList.scrollLeft + recentList.clientWidth * 0.8, behavior: 'smooth' });
  });
  addEventListener('resize', sync);
  sync();
}

async function main() {
  let cat;
  try {
    cat = await loadCatalog();
  } catch (err) {
    newList.innerHTML = '';
    newList.insertAdjacentHTML('afterend', errorStateHTML(err.message));
    $('[data-recent-section]').hidden = true;
    return;
  }
  if (!cat.all.length) {
    newList.outerHTML = '<div class="glass empty"><h2>New sheets are on the way</h2>' +
      '<p>The first songs will appear here as soon as they’re published.</p></div>';
    $('[data-recent-section]').hidden = true;
    return;
  }
  const shown = renderNew(cat);
  renderRecent(cat, shown);
  bindPayhip();
}

main();
