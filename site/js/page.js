// The earthquake page: everything known about one earthquake, with its own text when it has one.
import { linkFor, mapSVG, tipFor, tipHTML, tipPinned } from './card.js';
import { SOURCES } from './config.js';
import { buildJump } from './controls.js';
import { $, tip } from './dom.js';
import { agencyName, fmtDate, fmtDec, fmtTime, L, lang, placeName, REGION } from './i18n.js';
import { S } from './state.js';
import { CHUNKS, ensureYear, N } from './store.js';
import { writeHash } from './url.js';
import { esc, kmBetween, yearOf } from './util.js';

const ID = /^\d{8}-\w+$/;
const NEAR_KM = 50, NEAR_SECONDS = 7 * 86400, NEAR_SHOWN = 8;

export const pageDlg = $('#story');
export let pageOpen = null; // null: closed; '': the list of stories; otherwise an earthquake's id

// the earthquakes that have a text of their own, written in content/quakes/ and built by tools/build_content.py
const TEXTS = new Map(), BODIES = new Map();
fetch('content/index.json')
  .then((r) => (r.ok ? r.json() : []))
  .then((list) => {
    for (const entry of list) TEXTS.set(entry.id, entry);
    if (pageDlg.open) renderPage();
    if (S.META) buildJump();
    if (!tip.hidden && tipFor >= 0 && tipFor < N) tip.innerHTML = tipHTML(tipFor, tipPinned);
  })
  .catch(() => {});
export const hasText = (id) => TEXTS.has(id);
/** [id, title] of every earthquake with a text, in the current language. */
export const storyTitles = () => [...TEXTS.keys()].map((id) => [id, textOf(id).title]);
/** The text's title and summary in the current language, or in the other one when it is missing. */
function textOf(id) {
  const entry = TEXTS.get(id);
  if (!entry) return null;
  const use = entry[lang] ? lang : entry.en ? 'en' : 'pt';
  return { ...entry[use], file: `content/${id}.${use}.html` };
}

const yearOfId = (id) => +id.slice(0, 4);
const findEvent = (id) => CHUNKS.get(yearOfId(id))?.events.find((x) => x.id === id);
const magText = (ev) => (Number.isNaN(ev.m) ? L.noMag : `M ${fmtDec(ev.m, 1)}`);
/** Other earthquakes close to this one in place and time, whatever the filters say. */
function nearby(ev) {
  const out = [];
  for (const y of new Set([yearOf(ev.t - NEAR_SECONDS), yearOf(ev.t), yearOf(ev.t + NEAR_SECONDS)])) {
    for (const x of CHUNKS.get(y)?.events || []) {
      if (x !== ev && Math.abs(x.t - ev.t) <= NEAR_SECONDS && kmBetween(ev, x) <= NEAR_KM) out.push(x);
    }
  }
  return out;
}
function nearbyHTML(ev) {
  const all = nearby(ev);
  if (!all.length) return `<h3>${L.nearTitle}</h3><p>${L.nearNone}</p>`;
  const shown = all.slice().sort((a, b) => (Number.isNaN(b.m) ? -1 : b.m) - (Number.isNaN(a.m) ? -1 : a.m) || a.t - b.t).slice(0, NEAR_SHOWN);
  return `<h3>${L.nearTitle}</h3><p>${L.near(all.length)}${all.length > shown.length ? ' ' + L.nearMore(shown.length) : ''}</p><ul class="story-list">` +
    shown.map((x) => `<li><button type="button" data-story="${x.id}"><b>${magText(x)}</b> · ${fmtDate(x.t)} · ${fmtTime(x.t).slice(0, 5)} UTC` +
      `<span>${esc(x.place ? placeName(x.place) : REGION[x.r])}</span></button></li>`).join('') + '</ul>';
}
function factsHTML(ev) {
  const coords = `${fmtDec(Math.abs(ev.lat), 2)}°${ev.lat >= 0 ? 'N' : 'S'} ${fmtDec(Math.abs(ev.lon), 2)}°${ev.lon >= 0 ? L.E : L.W}`;
  const felt = ev.inten ? L.feltI(ev.inten) : ev.felt ? L.felt : '';
  const src = SOURCES.filter(([b]) => ev.s & b).map(([, n]) => n).join(' · ');
  return '<div class="facts">' +
    (ev.place ? `<div class="where">${esc(placeName(ev.place))}</div>` : '') +
    (felt ? `<div>${esc(felt)}</div>` : '') +
    `<div class="meta">${esc([REGION[ev.r], ev.d != null ? L.deep(ev.d) : null, coords].filter(Boolean).join(' · '))}</div>` +
    (!Number.isNaN(ev.m) && ev.au ? `<div class="meta">${esc(L.magBy(agencyName(ev.au)))}</div>` : '') +
    `<div class="meta">${L.source} ${esc(src)}</div></div>`;
}

export function renderPage() {
  const body = $('#storyBody');
  if (!pageOpen) {
    body.innerHTML = `<h2 id="storyTitle">${L.stories}</h2><p>${L.storiesIntro}</p><ul class="story-list">` +
      [...TEXTS.keys()].map((id) => { const t = textOf(id); return `<li><button type="button" data-story="${id}"><b>${esc(t.title)}</b><span>${esc(t.summary)}</span></button></li>`; }).join('') + '</ul>';
    return;
  }
  const id = pageOpen, ev = findEvent(id), text = textOf(id);
  const back = text ? `<p><button class="back" type="button">${L.storyAll}</button></p>` : '';
  if (!ev) {
    body.innerHTML = back + `<h2 id="storyTitle">${text ? esc(text.title) : L.details}</h2><p>${CHUNKS.has(yearOfId(id)) ? L.pageMissing : L.loading}</p>`;
    return;
  }
  if (text && !BODIES.has(text.file)) {
    BODIES.set(text.file, '');
    fetch(text.file).then((r) => (r.ok ? r.text() : '')).then((html) => { BODIES.set(text.file, html); if (pageOpen === id) renderPage(); }, () => BODIES.delete(text.file));
  }
  const iso = (t) => new Date(t * 1000).toISOString();
  const link = linkFor(ev.k);
  body.innerHTML = back +
    `<h2 id="storyTitle">${esc(text ? text.title : ev.place ? placeName(ev.place) : REGION[ev.r])}</h2>` +
    `<p class="story-meta">${magText(ev)}${!Number.isNaN(ev.m) && ev.mt ? ' ' + esc(ev.mt) : ''} · ${fmtDate(ev.t)} · ${fmtTime(ev.t).slice(0, 5)} UTC</p>` +
    (text ? `<div class="page-text">${BODIES.get(text.file) || ''}</div>` : '') +
    factsHTML(ev) + mapSVG(ev) + nearbyHTML(ev) +
    `<p class="story-links"><a href="#s=1d&q=${id}">${L.onDrum}</a>` +
    `<a href="#v=map&from=${iso(ev.t - 86400)}&to=${iso(ev.t + 30 * 86400)}&q=${id}">${L.onMap}</a>` +
    `<a href="#v=list&q=${id}">${L.onList}</a>` +
    `<a href="${link[0]}" target="_blank" rel="noopener">${link[1]} ↗</a>` +
    `<button class="copy" type="button">${L.copy}</button></p>`;
}
/** Open an earthquake's page by id, or the list of stories with ''. */
export function openPage(ref) {
  if (ref && !ID.test(ref)) return;
  pageOpen = ref;
  renderPage();
  if (!pageDlg.open) pageDlg.showModal();
  if (ref && S.META) {
    ensureYear(yearOfId(ref)).then(() => {
      const ev = findEvent(ref);
      return ev && Promise.all([yearOf(ev.t - NEAR_SECONDS), yearOf(ev.t + NEAR_SECONDS)].map(ensureYear));
    }).then(() => { if (pageOpen === ref) renderPage(); });
  }
  writeHash();
}
pageDlg.addEventListener('close', () => { pageOpen = null; writeHash(); });
pageDlg.addEventListener('click', (ev) => {
  const pick = ev.target.closest('[data-story]'), copy = ev.target.closest('.copy');
  if (pick) openPage(pick.dataset.story);
  else if (ev.target.closest('.back')) openPage('');
  else if (copy) {
    const url = new URL(location.href);
    if (url.hostname === 'terramotos.com' || url.hostname === 'www.terramotos.com') {
      url.hostname = 'terramotos.com'; url.pathname = `${lang === 'en' ? '/en' : ''}/sismo/${pageOpen}`;
      url.hash = ''; url.search = '';
    } else url.hash = 'page=' + pageOpen;
    navigator.clipboard?.writeText(url.href).then(() => { copy.textContent = L.copied; }, () => {});
  } else if (ev.target === pageDlg || ev.target.closest('.close') || ev.target.closest('a:not([target])')) pageDlg.close();
});
$('#storiesBtn').addEventListener('click', () => openPage(''));
