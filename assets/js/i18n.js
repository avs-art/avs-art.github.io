// UI strings and language state. Content (names, bio…) lives in data/db.json
// as { ru, en } pairs; pick() resolves those with a fallback to Russian.

export const LANGS = ['ru', 'en'];
const DEFAULT_LANG = 'ru';

const STRINGS = {
  ru: {
    'title.suffix': 'Живопись',
    'hero.eyebrow': 'Авторская живопись',
    'about.eyebrow': 'О художнице',
    'works.eyebrow': 'Избранные работы',
    'contact.eyebrow': 'Контакты',
    'contact.lead': 'Связаться',
    'status.for_sale': 'В продаже',
    'status.sold': 'Продано',
    'status.on_order': 'На заказ',
    'price.onRequest': 'Цена по запросу',
    'work.inquire': 'Узнать подробнее',
    'work.commission': 'Заказать',
    'mail.subject': 'Вопрос о картине',
    'hero.cue': 'Прокрутить вниз',
    'lang.label': 'Язык',

    'edit.open': 'Редактировать',
    'unlock.title': 'Редактирование',
    'unlock.text.github': 'Введите пароль.',
    'unlock.text.local': 'Введите пароль локального сервера.',
    'unlock.field': 'Пароль',
    'unlock.submit': 'Войти',
    'unlock.cancel': 'Отмена',
    'unlock.checking': 'Проверка…',
    'unlock.rejected': 'Пароль не подошёл.',
    'unlock.expired': 'Пароль верный, но ключ доступа GitHub истёк. Запустите deploy.sh заново.',
    'unlock.noPush': 'У этого ключа нет права на запись в репозиторий.',
    'unlock.network': 'Нет связи с сервером. Попробуйте ещё раз.',

    'bar.saved': 'Все изменения опубликованы',
    'bar.dirty': 'Есть неопубликованные изменения',
    'bar.publishing': 'Публикация…',
    'bar.published.github': 'Опубликовано — появится на сайте через ~1 минуту',
    'bar.published.local': 'Сохранено в data/db.json',
    'bar.uploading': 'Загрузка изображения…',
    'bar.revert': 'Сбросить',
    'bar.exit': 'Выйти',
    'bar.exitConfirm': 'Выйти без сохранения?',
    'bar.publish': 'Опубликовать',

    'edit.painting': 'Изменить',
    'edit.site': 'Изменить текст и фото',
    'edit.add': '+ Добавить картину',
    'sheet.done': 'Готово',
    'sheet.painting': 'Картина',
    'sheet.site': 'О художнице и контакты',

    'f.name': 'Название',
    'f.description': 'Описание',
    'f.date': 'Дата',
    'f.status': 'Статус',
    'f.price': 'Цена, ₽',
    'f.priceHint': 'в английской версии',
    'f.showPrice': 'Показывать цену',
    'f.showPriceOff': 'Сейчас на сайте: «Цена по запросу»',
    'f.slug': 'Адрес (slug)',
    'f.image': 'Изображение',
    'f.replaceImage': 'Заменить изображение',
    'f.order': 'Порядок',
    'f.earlier': '↑ Выше',
    'f.later': '↓ Ниже',
    'f.delete': 'Удалить картину',
    'f.deleteConfirm': 'Нажмите ещё раз, чтобы удалить',
    'f.artistName': 'Имя',
    'f.tagline': 'Подзаголовок',
    'f.bio': 'Биография',
    'f.contactNote': 'Текст в контактах',
    'f.email': 'Email',
    'f.instagram': 'Instagram',
    'f.usdRate': 'Запасной курс ₽ → $',
    'f.usdRateHint': 'используется, если курс не загрузился',
    'f.portrait': 'Портрет',
    'f.replacePortrait': 'Заменить портрет',
    'new.name': 'Новая картина',

    'v.name': 'У каждой картины должно быть название на русском.',
    'v.slug': 'Адрес картины «{name}» может содержать только латинские буквы, цифры и дефисы.',
    'v.slugDup': 'Адрес «{slug}» используется дважды.',
    'v.price': 'Цена картины «{name}» должна быть числом от 0.',
    'err.image': 'Не удалось прочитать изображение.',
  },
  en: {
    'title.suffix': 'Paintings',
    'hero.eyebrow': 'Original paintings',
    'about.eyebrow': 'The artist',
    'works.eyebrow': 'Selected works',
    'contact.eyebrow': 'Contact',
    'contact.lead': 'Enquiries',
    'status.for_sale': 'Available',
    'status.sold': 'Sold',
    'status.on_order': 'Made to order',
    'price.onRequest': 'Price on request',
    'work.inquire': 'Inquire',
    'work.commission': 'Commission',
    'mail.subject': 'Enquiry',
    'hero.cue': 'Scroll down',
    'lang.label': 'Language',

    'edit.open': 'Edit',
    'unlock.title': 'Edit mode',
    'unlock.text.github': 'Enter the password.',
    'unlock.text.local': 'Enter the local server password.',
    'unlock.field': 'Password',
    'unlock.submit': 'Unlock',
    'unlock.cancel': 'Cancel',
    'unlock.checking': 'Checking…',
    'unlock.rejected': 'That password was not accepted.',
    'unlock.expired': 'The password is right, but the GitHub token behind it has expired. Run deploy.sh again.',
    'unlock.noPush': 'This key cannot write to the repository.',
    'unlock.network': 'Could not reach the server. Please try again.',

    'bar.saved': 'All changes published',
    'bar.dirty': 'Unpublished changes',
    'bar.publishing': 'Publishing…',
    'bar.published.github': 'Published — live on the site in ~1 minute',
    'bar.published.local': 'Saved to data/db.json',
    'bar.uploading': 'Uploading image…',
    'bar.revert': 'Revert',
    'bar.exit': 'Exit',
    'bar.exitConfirm': 'Discard & exit?',
    'bar.publish': 'Publish',

    'edit.painting': 'Edit',
    'edit.site': 'Edit text & photo',
    'edit.add': '+ Add painting',
    'sheet.done': 'Done',
    'sheet.painting': 'Painting',
    'sheet.site': 'Artist & contact',

    'f.name': 'Name',
    'f.description': 'Description',
    'f.date': 'Date',
    'f.status': 'Status',
    'f.price': 'Price, ₽',
    'f.priceHint': 'in the English version',
    'f.showPrice': 'Show price',
    'f.showPriceOff': 'The site now shows “Price on request”',
    'f.slug': 'Link (slug)',
    'f.image': 'Image',
    'f.replaceImage': 'Replace image',
    'f.order': 'Order',
    'f.earlier': '↑ Earlier',
    'f.later': '↓ Later',
    'f.delete': 'Delete painting',
    'f.deleteConfirm': 'Tap again to delete',
    'f.artistName': 'Name',
    'f.tagline': 'Tagline',
    'f.bio': 'Biography',
    'f.contactNote': 'Contact note',
    'f.email': 'Email',
    'f.instagram': 'Instagram',
    'f.usdRate': 'Fallback ₽ → $ rate',
    'f.usdRateHint': 'used when the live rate cannot be loaded',
    'f.portrait': 'Portrait',
    'f.replacePortrait': 'Replace portrait',
    'new.name': 'New painting',

    'v.name': 'Every painting needs a Russian name.',
    'v.slug': '“{name}” needs a link made of latin letters, digits and dashes.',
    'v.slugDup': 'The link “{slug}” is used more than once.',
    'v.price': '“{name}” needs a price of 0 or more.',
    'err.image': 'That file is not a readable image.',
  },
};

function initialLang() {
  let lang = new URLSearchParams(location.search).get('lang');
  try { lang = lang || localStorage.getItem('lang'); } catch {}
  return LANGS.includes(lang) ? lang : DEFAULT_LANG;
}

let current = initialLang();

export const getLang = () => current;

export function setLang(lang) {
  if (!LANGS.includes(lang)) return;
  current = lang;
  try { localStorage.setItem('lang', lang); } catch {}
}

export function t(key, vars = {}) {
  const text = STRINGS[current][key] ?? STRINGS[DEFAULT_LANG][key] ?? key;
  return text.replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? '');
}

// Resolve a { ru, en } content pair in the current language.
export function pick(pair) {
  if (pair == null) return '';
  if (typeof pair === 'string') return pair;
  return pair[current]?.trim() ? pair[current] : pair[DEFAULT_LANG] ?? '';
}

// Fill every [data-i18n] / [data-i18n-aria] node under root.
export function applyStrings(root = document) {
  for (const node of root.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
  for (const node of root.querySelectorAll('[data-i18n-aria]')) node.setAttribute('aria-label', t(node.dataset.i18nAria));
}
