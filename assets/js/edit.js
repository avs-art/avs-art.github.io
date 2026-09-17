// Edit mode: unlock, per-painting edit buttons, editor sheet, publish bar.
// Persistence goes through a store (store-github.js on the live site,
// store-local.js when served by tools/dev-server.mjs).

import { el, render, renderSite, renderCaption, sortedPaintings, usdEstimate, onRender, getDb, STATUSES } from './app.js';
import { t, pick } from './i18n.js';
import { createGithubStore } from './store-github.js';
import { createLocalStore, localStoreAvailable } from './store-local.js';

const MAX_IMAGE_EDGE = 2400;
const WEBP_QUALITY = 0.86;
const KEEP_AS_IS_BYTES = 1.5 * 1024 * 1024;

let store;
let draft;
let savedJson;
let statusNode;
let publishButton;
let active = false;
let justPublished = false;

// Freshly uploaded files are not served by Pages until the next deploy,
// so show them from memory for the rest of the session.
const previews = new Map();
const srcFor = (path) => previews.get(path) ?? path;

const isDirty = () => JSON.stringify(draft) !== savedJson;

/* ---------- Slugs ---------- */

const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

export function slugify(text) {
  return String(text).toLowerCase().replace(/[а-яё]/g, (c) => TRANSLIT[c] ?? '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const nameSlug = (p) => slugify(p.name.en?.trim() ? p.name.en : p.name.ru);

function uniqueSlug(base, except) {
  const taken = new Set(draft.paintings.filter((p) => p !== except).map((p) => p.slug));
  let slug = base || 'painting';
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}

/* ---------- Status bar ---------- */

function setStatus(text, kind = '') {
  statusNode.textContent = text;
  statusNode.className = `editbar__status${kind ? ` is-${kind}` : ''}`;
}

function refreshStatus() {
  const dirty = isDirty();
  publishButton.disabled = !dirty;
  if (dirty) justPublished = false;
  if (dirty) setStatus(t('bar.dirty'), 'dirty');
  else setStatus(t(justPublished ? `bar.published.${store.kind}` : 'bar.saved'));
}

function errorText(err) {
  if (err?.code === 'rejected') return t('unlock.rejected');
  if (err?.code === 'expired') return t('unlock.expired');
  if (err?.code === 'noPush') return t('unlock.noPush');
  if (err?.code === 'network') return t('unlock.network');
  return err?.message ?? String(err);
}

/* ---------- Unlock dialog ---------- */

function askPassword() {
  return new Promise((resolve) => {
    const input = el('input', { type: 'password', name: 'password', autocomplete: 'current-password', required: true });
    const error = el('p', { class: 'dialog__error', role: 'alert' });
    const submit = el('button', { class: 'btn btn--solid', type: 'submit', text: t('unlock.submit') });
    const dialog = el('dialog', { class: 'dialog' },
      el('form', { method: 'dialog' },
        el('h2', { class: 'dialog__title', text: t('unlock.title') }),
        el('p', { class: 'dialog__text', text: t(`unlock.text.${store.kind}`) }),
        // lets password managers file the token under a stable account name
        el('input', { type: 'text', name: 'username', autocomplete: 'username', value: 'avs-art-editor', hidden: true }),
        el('label', { class: 'field' }, el('span', { text: t('unlock.field') }), input),
        error,
        el('div', { class: 'dialog__actions' },
          el('button', { class: 'btn btn--quiet', type: 'button', text: t('unlock.cancel'), onclick: () => finish(false) }),
          submit,
        ),
      ),
    );
    // Called directly as well as from 'close' (Esc): browsers may delay that event.
    let done = false;
    const finish = (accepted) => {
      if (done) return;
      done = true;
      if (dialog.open) dialog.close();
      dialog.remove();
      resolve(accepted);
    };
    dialog.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      submit.disabled = true;
      error.textContent = t('unlock.checking');
      try {
        await store.unlock(input.value);
        finish(true);
      } catch (err) {
        error.textContent = errorText(err);
        submit.disabled = false;
        input.select();
      }
    });
    dialog.addEventListener('click', (e) => { if (e.target === dialog) finish(false); });
    dialog.addEventListener('close', () => finish(false));
    document.body.append(dialog);
    dialog.showModal();
  });
}

/* ---------- Images ---------- */

async function prepareImage(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(t('err.image'));
  }
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
  const stem = slugify(file.name.replace(/\.[^.]+$/, '')) || 'painting';
  const webSafe = /^image\/(webp|jpeg)$/.test(file.type);
  if (scale === 1 && webSafe && file.size <= KEEP_AS_IS_BYTES) {
    const ext = file.type === 'image/webp' ? '.webp' : '.jpg';
    return { blob: file, name: stem + ext, width: bitmap.width, height: bitmap.height };
  }
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = el('canvas', { width, height });
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  let blob = await new Promise((done) => canvas.toBlob(done, 'image/webp', WEBP_QUALITY));
  let ext = '.webp';
  if (!blob || blob.type !== 'image/webp') { // Safari < 17 cannot encode WebP
    blob = await new Promise((done) => canvas.toBlob(done, 'image/jpeg', WEBP_QUALITY));
    ext = '.jpg';
  }
  if (!blob) throw new Error(t('err.image'));
  return { blob, name: stem + ext, width, height };
}

// A button that picks an image, uploads it, and reports { path, width, height }.
function imagePicker(label, dir, onUploaded) {
  const input = el('input', { type: 'file', accept: 'image/*', hidden: true });
  const button = el('button', { class: 'btn btn--small', type: 'button', text: label, onclick: () => input.click() });
  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.value = '';
    if (!file) return;
    button.disabled = true;
    setStatus(t('bar.uploading'));
    try {
      const image = await prepareImage(file);
      const path = await store.upload(image.blob, image.name, dir);
      previews.set(path, URL.createObjectURL(image.blob));
      onUploaded({ path, width: image.width, height: image.height });
      refreshStatus();
    } catch (err) {
      setStatus(errorText(err), 'error');
    } finally {
      button.disabled = false;
    }
  });
  return el('span', { class: 'picker' }, input, button);
}

/* ---------- Sheet ---------- */

let openSheet;

function sheet(title, body, { onClose } = {}) {
  openSheet?.dismiss();
  let done = false;
  const dismiss = () => {
    if (done) return;
    done = true;
    if (dialog.open) dialog.close();
    dialog.remove();
    if (openSheet === dialog) {
      openSheet = null;
      document.body.classList.remove('has-sheet');
    }
    onClose?.();
  };
  const dialog = el('dialog', { class: 'sheet' },
    el('header', { class: 'sheet__head' },
      el('h2', { class: 'sheet__title', text: title }),
      el('button', { class: 'btn btn--small btn--solid', type: 'button', text: t('sheet.done'), onclick: dismiss }),
    ),
    el('div', { class: 'sheet__body' }, ...body),
  );
  dialog.dismiss = dismiss;
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dismiss(); });
  dialog.addEventListener('close', dismiss);
  document.body.append(dialog);
  document.body.classList.add('has-sheet');
  dialog.showModal();
  openSheet = dialog;
  return dialog;
}

function field(label, control, { hint } = {}) {
  return el('label', { class: 'field' }, el('span', { text: label }), control, hint && el('small', { class: 'field__hint' }, hint));
}

// One labelled group with a Russian and an English control.
function pairField(label, pair, { multiline = false, onInput }) {
  const controls = ['ru', 'en'].map((lang) => {
    const control = multiline
      ? el('textarea', { value: pair[lang] ?? '', lang, rows: 4 })
      : el('input', { type: 'text', value: pair[lang] ?? '', lang });
    control.addEventListener('input', () => { pair[lang] = control.value; onInput(); });
    return el('label', { class: 'pair__row' }, el('span', { class: 'pair__tag', text: lang.toUpperCase() }), control);
  });
  return el('fieldset', { class: 'field pair' }, el('legend', { text: label }), ...controls);
}

function toggle(label, checked, onChange) {
  const input = el('input', { type: 'checkbox', checked, role: 'switch' });
  input.addEventListener('change', () => onChange(input.checked));
  return el('label', { class: 'toggle' }, input, el('span', { class: 'toggle__track', 'aria-hidden': 'true' }), el('span', { text: label }));
}

const asPair = (value) => (value && typeof value === 'object' ? value : { ru: value ?? '', en: '' });

/* ---------- Painting editor ---------- */

function refreshWork(p) {
  const figure = document.getElementById(p.slug);
  if (!figure) return;
  figure.querySelector('.work__caption').replaceWith(renderCaption(p, draft.site));
  figure.querySelector('.work__img').alt = pick(p.name);
  decorateWork(figure, p);
  refreshStatus();
}

function renumber(list) {
  list.forEach((p, i) => { p.order = (i + 1) * 10; });
}

function openPainting(p) {
  p.name = asPair(p.name);
  p.description = asPair(p.description);
  let followName = !p.slug || p.slug === nameSlug(p) || p.slug === uniqueSlug(nameSlug(p), p);
  const figure = () => document.getElementById(p.slug);

  const slug = el('input', { type: 'text', value: p.slug, autocapitalize: 'off', spellcheck: false, inputMode: 'url' });
  const setSlug = (value) => {
    const node = figure();
    p.slug = value;
    if (node) node.id = value;
  };

  const name = pairField(t('f.name'), p.name, {
    onInput: () => {
      if (followName) {
        setSlug(uniqueSlug(nameSlug(p), p));
        slug.value = p.slug;
      }
      refreshWork(p);
    },
  });
  const description = pairField(t('f.description'), p.description, { multiline: true, onInput: () => refreshWork(p) });

  slug.addEventListener('input', () => { followName = false; setSlug(slug.value); refreshStatus(); });
  slug.addEventListener('change', () => { setSlug(slugify(slug.value)); slug.value = p.slug; refreshStatus(); });

  const date = el('input', { type: 'text', value: p.date ?? '', placeholder: String(new Date().getFullYear()) });
  date.addEventListener('input', () => { p.date = date.value; refreshWork(p); });

  const status = el('select', {}, ...STATUSES.map((value) =>
    el('option', { value, text: t(`status.${value}`), selected: value === p.status })));
  status.addEventListener('change', () => { p.status = status.value; refreshWork(p); });

  const usdHint = el('span');
  const showHint = el('small', { class: 'field__hint' });
  const syncPriceHints = () => {
    const usd = usdEstimate(p.price, draft.site);
    usdHint.textContent = usd ? `≈ ${usd} ${t('f.priceHint')}` : '';
    showHint.textContent = p.showPrice === false ? t('f.showPriceOff') : '';
  };
  const price = el('input', { type: 'number', min: '0', step: '1000', inputMode: 'numeric', value: String(p.price ?? 0) });
  price.addEventListener('input', () => { p.price = Math.max(0, Number(price.value) || 0); syncPriceHints(); refreshWork(p); });
  const showPrice = toggle(t('f.showPrice'), p.showPrice !== false, (on) => { p.showPrice = on; syncPriceHints(); refreshWork(p); });
  syncPriceHints();

  const thumb = el('img', { class: 'sheet__thumb', src: srcFor(p.img), alt: '' });
  const replace = imagePicker(t('f.replaceImage'), 'data/paintings', (image) => {
    Object.assign(p, { img: image.path, width: image.width, height: image.height });
    thumb.src = srcFor(p.img);
    const node = figure()?.querySelector('.work__img');
    if (node) Object.assign(node, { src: srcFor(p.img), width: image.width, height: image.height });
  });

  const move = (delta) => {
    const list = sortedPaintings(draft);
    const from = list.indexOf(p);
    const to = from + delta;
    if (to < 0 || to >= list.length) return;
    list.splice(to, 0, ...list.splice(from, 1));
    renumber(list);
    render(draft);
    syncMoves();
    scrollToWork(p);
  };
  const earlier = el('button', { class: 'btn btn--small', type: 'button', text: t('f.earlier'), onclick: () => move(-1) });
  const later = el('button', { class: 'btn btn--small', type: 'button', text: t('f.later'), onclick: () => move(1) });
  const position = el('span', { class: 'sheet__position' });
  const syncMoves = () => {
    const list = sortedPaintings(draft);
    const index = list.indexOf(p);
    earlier.disabled = index === 0;
    later.disabled = index === list.length - 1;
    position.textContent = `${index + 1} / ${list.length}`;
  };
  syncMoves();

  let armed = false;
  const del = el('button', { class: 'btn btn--small btn--quiet btn--danger', type: 'button', text: t('f.delete') });
  del.addEventListener('click', () => {
    if (!armed) {
      armed = true;
      del.textContent = t('f.deleteConfirm');
      setTimeout(() => { armed = false; del.textContent = t('f.delete'); }, 3000);
      return;
    }
    draft.paintings.splice(draft.paintings.indexOf(p), 1);
    renumber(sortedPaintings(draft));
    dialog.dismiss();
    render(draft);
  });

  const dialog = sheet(t('sheet.painting'), [
    name,
    description,
    el('div', { class: 'sheet__row' }, field(t('f.date'), date), field(t('f.status'), status)),
    field(t('f.price'), price, { hint: usdHint }),
    el('div', { class: 'field' }, showPrice, showHint),
    el('div', { class: 'field' }, el('span', { text: t('f.image') }), el('div', { class: 'sheet__image' }, thumb, replace)),
    el('div', { class: 'field' }, el('span', { text: t('f.order') }), el('div', { class: 'sheet__actions' }, earlier, later, position)),
    field(t('f.slug'), slug),
    el('div', { class: 'sheet__danger' }, del),
  ], {
    onClose: () => {
      // settle a half-typed slug
      const clean = uniqueSlug(slugify(p.slug) || nameSlug(p), p);
      if (draft.paintings.includes(p) && clean !== p.slug) { setSlug(clean); refreshStatus(); }
    },
  });
  scrollToWork(p);
}

function scrollToWork(p) {
  document.getElementById(p.slug)?.scrollIntoView({ block: 'center', behavior: 'instant' });
}

/* ---------- Site editor ---------- */

function openSite() {
  const site = draft.site;
  const refresh = () => { renderSite(site); showPreviews(); refreshStatus(); };
  const pairs = ['artistName', 'tagline', 'bio', 'contactNote'].map((key) => {
    site[key] = asPair(site[key]);
    return pairField(t(`f.${key}`), site[key], { multiline: key === 'bio', onInput: refresh });
  });

  const email = el('input', { type: 'email', value: site.email ?? '', autocapitalize: 'off' });
  email.addEventListener('input', () => { site.email = email.value.trim(); refresh(); });
  const instagram = el('input', { type: 'text', value: site.instagram ?? '', autocapitalize: 'off', spellcheck: false, placeholder: '@' });
  instagram.addEventListener('input', () => { site.instagram = instagram.value.trim(); refresh(); });
  const rate = el('input', { type: 'number', min: '0', step: '0.0001', inputMode: 'decimal', value: String(site.usdRateFallback ?? '') });
  rate.addEventListener('input', () => { site.usdRateFallback = Number(rate.value) || 0; refreshStatus(); });

  const thumb = el('img', { class: 'sheet__thumb', src: srcFor(site.bioImage ?? ''), alt: '' });
  const replace = imagePicker(t('f.replacePortrait'), 'data/site', (image) => {
    Object.assign(site, { bioImage: image.path, bioImageWidth: image.width, bioImageHeight: image.height });
    thumb.src = srcFor(site.bioImage);
    renderSite(site);
    showPreviews();
  });

  sheet(t('sheet.site'), [
    ...pairs,
    el('div', { class: 'field' }, el('span', { text: t('f.portrait') }), el('div', { class: 'sheet__image' }, thumb, replace)),
    field(t('f.email'), email),
    field(t('f.instagram'), instagram),
    field(t('f.usdRate'), rate, { hint: t('f.usdRateHint') }),
  ]);
}

/* ---------- Page decoration ---------- */

function decorateWork(figure, p) {
  figure.querySelector('.edit-slot')?.replaceChildren(
    el('button', { class: 'editpill', type: 'button', text: t('edit.painting'), onclick: () => openPainting(p) }),
  );
}

function addPainting(image) {
  const last = sortedPaintings(draft).at(-1);
  const painting = {
    slug: '', name: { ru: t('new.name'), en: '' }, description: { ru: '', en: '' },
    date: String(new Date().getFullYear()), price: 0, showPrice: true, status: 'for_sale',
    img: image.path, width: image.width, height: image.height, order: (last?.order ?? 0) + 10,
  };
  painting.slug = uniqueSlug(nameSlug(painting), painting);
  draft.paintings.push(painting);
  render(draft);
  openPainting(painting);
}

function showPreviews() {
  if (!previews.size) return;
  for (const p of draft.paintings) {
    if (previews.has(p.img)) document.getElementById(p.slug)?.querySelector('.work__img')?.setAttribute('src', srcFor(p.img));
  }
  if (previews.has(draft.site.bioImage)) document.querySelector('.about__img')?.setAttribute('src', srcFor(draft.site.bioImage));
}

function decorate() {
  if (!active) return;
  showPreviews();
  document.querySelectorAll('.reveal').forEach((n) => n.classList.add('is-in'));
  for (const p of draft.paintings) {
    const figure = document.getElementById(p.slug);
    if (figure) decorateWork(figure, p);
  }
  document.getElementById('site-edit-slot').replaceChildren(
    el('button', { class: 'editpill', type: 'button', text: t('edit.site'), onclick: openSite }),
  );
  const add = imagePicker(t('edit.add'), 'data/paintings', addPainting);
  add.querySelector('button').className = 'btn';
  document.getElementById('add-slot').replaceChildren(add);
  rebuildBar();
}

/* ---------- Validation & publish ---------- */

function validate() {
  const seen = new Set();
  for (const p of sortedPaintings(draft)) {
    const name = pick(p.name) || p.slug;
    if (!p.name?.ru?.trim()) return { p, message: t('v.name') };
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug)) return { p, message: t('v.slug', { name }) };
    if (seen.has(p.slug)) return { p, message: t('v.slugDup', { slug: p.slug }) };
    seen.add(p.slug);
    if (!Number.isFinite(p.price) || p.price < 0) return { p, message: t('v.price', { name }) };
  }
  return null;
}

async function publish() {
  const problem = validate();
  if (problem) {
    setStatus(problem.message, 'error');
    scrollToWork(problem.p);
    return;
  }
  publishButton.disabled = true;
  setStatus(t('bar.publishing'));
  const snapshot = JSON.stringify(draft);
  try {
    await store.save(JSON.parse(snapshot));
    savedJson = snapshot;
    justPublished = true;
    refreshStatus();
  } catch (err) {
    setStatus(errorText(err), 'error');
    publishButton.disabled = false;
  }
}

let bar;
function rebuildBar() {
  statusNode = el('span', { class: 'editbar__status', role: 'status' });
  publishButton = el('button', { class: 'btn btn--small btn--solid', type: 'button', text: t('bar.publish'), onclick: publish });

  let armed = false;
  const exit = el('button', { class: 'btn btn--small btn--quiet', type: 'button', text: t('bar.exit') });
  exit.addEventListener('click', () => {
    if (isDirty() && !armed) {
      armed = true;
      exit.textContent = t('bar.exitConfirm');
      setTimeout(() => { armed = false; exit.textContent = t('bar.exit'); }, 3000);
      return;
    }
    savedJson = JSON.stringify(draft); // silence the beforeunload guard
    history.replaceState(null, '', location.pathname + location.search);
    location.reload();
  });
  const revert = el('button', {
    class: 'btn btn--small btn--quiet', type: 'button', text: t('bar.revert'),
    onclick: () => { draft = JSON.parse(savedJson); render(draft); },
  });

  const next = el('div', { class: 'editbar' }, statusNode, el('div', { class: 'editbar__actions' }, revert, exit, publishButton));
  if (bar) bar.replaceWith(next); else document.body.append(next);
  bar = next;
  refreshStatus();
}

/* ---------- Entry point ---------- */

export async function startEditing() {
  if (active || document.querySelector('dialog.dialog')) return;
  store ??= (await localStoreAvailable()) ? createLocalStore() : createGithubStore();
  if (!(await askPassword())) return;

  try {
    draft = await store.load();
  } catch (err) {
    // e.g. first publish: nothing in the repository yet — start from what the page shows
    console.warn(err);
    draft = structuredClone(getDb());
  }
  savedJson = JSON.stringify(draft);
  active = true;
  document.body.classList.add('is-editing');
  document.getElementById('edit-trigger').hidden = true;
  window.addEventListener('beforeunload', (e) => { if (isDirty()) e.preventDefault(); });
  onRender(decorate);
  render(draft);
}
