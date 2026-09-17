// Renders the site from data/db.json. Edit mode lives in edit.js and is
// only loaded once the visitor asks for it.

import { LANGS, getLang, setLang, t, pick, applyStrings } from './i18n.js';
import { currentRate, refreshRate, rubToUsd } from './rates.js';

export const DB_URL = 'data/db.json';
export const STATUSES = ['for_sale', 'sold', 'on_order'];

let db;
const afterRender = new Set();

export const getDb = () => db;
export const onRender = (fn) => afterRender.add(fn);

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k in node && k !== 'list') node[k] = v;
    else node.setAttribute(k, v);
  }
  node.append(...children.filter((c) => c != null && c !== false));
  return node;
}

export function sortedPaintings(source = db) {
  return [...source.paintings].sort((a, b) => a.order - b.order);
}

const money = (value, locale, currency) =>
  new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);

export function usdEstimate(rub, site = db.site) {
  const rate = currentRate(site.usdRateFallback);
  return rate && rub > 0 ? money(rubToUsd(rub, rate), 'en-US', 'USD') : '';
}

// '' for sold works; "price on request" when hidden, unset or unconvertible.
export function formatPrice(p, site = db.site) {
  if (p.status === 'sold') return '';
  if (p.showPrice === false || !(p.price > 0)) return t('price.onRequest');
  if (getLang() === 'ru') return money(p.price, 'ru-RU', 'RUB');
  return usdEstimate(p.price, site) || t('price.onRequest');
}

function inquireHref(site, p) {
  if (!site.email) return '#contact';
  const subject = encodeURIComponent(`${t('mail.subject')}: «${pick(p.name)}»`);
  return `mailto:${site.email}?subject=${subject}`;
}

export function renderCaption(p, site = db.site) {
  const price = formatPrice(p, site);
  const description = pick(p.description);
  return el('figcaption', { class: 'work__caption' },
    el('h3', { class: 'work__name', text: pick(p.name) }),
    el('p', { class: 'work__meta' },
      p.date && el('span', { text: p.date }),
      el('span', { class: 'work__status', 'data-status': p.status, text: t(`status.${p.status}`) }),
    ),
    description && el('p', { class: 'work__desc', text: description }),
    p.status !== 'sold' && el('p', { class: 'work__foot' },
      el('span', { class: 'work__price', text: price }),
      el('a', {
        class: 'link',
        href: inquireHref(site, p),
        text: t(p.status === 'on_order' ? 'work.commission' : 'work.inquire'),
      }),
    ),
    el('div', { class: 'edit-slot' }),
  );
}

function shapeClass(p) {
  const ratio = p.width && p.height ? p.width / p.height : 1.4;
  if (ratio < 0.5) return 'work--tall';
  if (ratio <= 1.05) return 'work--portrait';
  return 'work--landscape';
}

function renderWork(p, index, sideIndex) {
  const shape = shapeClass(p);
  const flip = shape !== 'work--landscape' && sideIndex % 2 === 1;
  return el('figure', { class: `work ${shape}${flip ? ' work--flip' : ''} reveal`, id: p.slug },
    el('div', { class: 'work__frame' },
      el('img', {
        class: 'work__img',
        src: p.img,
        alt: pick(p.name),
        width: p.width || null,
        height: p.height || null,
        loading: index === 0 ? 'eager' : 'lazy',
        decoding: 'async',
      }),
    ),
    renderCaption(p),
  );
}

let revealObserver;
function observeReveals() {
  revealObserver?.disconnect();
  const nodes = document.querySelectorAll('.reveal:not(.is-in)');
  if (!('IntersectionObserver' in window)) {
    nodes.forEach((n) => n.classList.add('is-in'));
    return;
  }
  revealObserver = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('is-in');
      revealObserver.unobserve(e.target);
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
  nodes.forEach((n) => revealObserver.observe(n));
}

export function renderSite(site = db.site) {
  const name = pick(site.artistName);
  for (const node of document.querySelectorAll('[data-site]')) {
    node.textContent = pick(site[node.dataset.site]);
  }
  document.title = [name, t('title.suffix')].filter(Boolean).join(' — ');

  document.getElementById('about-portrait').replaceChildren(
    ...(site.bioImage ? [el('img', {
      class: 'about__img',
      src: site.bioImage,
      alt: name,
      width: site.bioImageWidth || null,
      height: site.bioImageHeight || null,
      loading: 'lazy',
      decoding: 'async',
    })] : []),
  );

  document.getElementById('contact-links').replaceChildren(
    ...[
      site.email && el('a', { class: 'link link--plain', href: `mailto:${site.email}`, text: site.email }),
      site.instagram && el('a', {
        class: 'link',
        href: `https://instagram.com/${site.instagram.replace(/^@/, '')}`,
        target: '_blank',
        rel: 'noopener',
        text: 'Instagram',
      }),
    ].filter(Boolean),
  );
  document.getElementById('footer-credit').textContent = `© ${new Date().getFullYear()} ${name}`.trim();
}

function renderChrome() {
  document.documentElement.lang = getLang();
  applyStrings();
  for (const b of document.querySelectorAll('[data-set-lang]')) {
    b.setAttribute('aria-pressed', String(b.dataset.setLang === getLang()));
  }
}

// Render `next` (or re-render the current db) in the current language.
export function render(next = db) {
  db = next;
  renderChrome();
  renderSite();
  let side = 0;
  document.getElementById('works-list').replaceChildren(...sortedPaintings().map((p, i) => {
    const node = renderWork(p, i, side);
    if (!node.classList.contains('work--landscape')) side++;
    return node;
  }));
  observeReveals();
  afterRender.forEach((fn) => fn());
  if (getLang() === 'en') refreshRate().then((changed) => { if (changed) render(); });
}

export async function loadDb() {
  const res = await fetch(DB_URL, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load ${DB_URL} (${res.status})`);
  return res.json();
}

function initLang() {
  for (const b of document.querySelectorAll('[data-set-lang]')) {
    b.addEventListener('click', () => {
      if (!LANGS.includes(b.dataset.setLang) || b.dataset.setLang === getLang()) return;
      setLang(b.dataset.setLang);
      render();
    });
  }
}

function initEditTrigger() {
  const open = async () => (await import('./edit.js')).startEditing();
  document.getElementById('edit-trigger').addEventListener('click', open);
  if (location.hash === '#edit') open();
}

async function main() {
  initLang();
  renderChrome();
  try {
    render(await loadDb());
  } catch (err) {
    document.getElementById('works-list').append(el('p', { class: 'work__desc', text: err.message }));
    return;
  }
  initEditTrigger();

  // Deep link to a painting once it exists in the DOM.
  if (location.hash.length > 1 && location.hash !== '#edit') {
    document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
  }
}

main();
