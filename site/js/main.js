// Entry point: wires the modules together, applies the language, and starts loading.
import { tipFor, tipHTML, tipPinned } from './card.js';
import { IPMA_POLL, META_POLL } from './config.js';
import { buildJump, compactControls, span } from './controls.js';
import { $, drum, jumpSel, listBox, main, tip } from './dom.js';
import { centerTime, geometry, schedule, scrollToTime, setEnd, setupRows } from './drum.js';
import { connectLive, current, loadIpma, loadMeta, showFreshness, ws } from './feeds.js';
import { L, lang, setLang } from './i18n.js';
import { updateLatest } from './latest.js';
import { showColour } from './map/colour.js';
import { playChrome } from './map/play.js';
import { S } from './state.js';
import { setStatsPeriod, statsPeriod } from './stats.js';
import { applyCounts, ensureYear, N } from './store.js';
import { renderStory, storyDlg } from './stories.js';
import { readColors } from './theme.js';
import { applyHash, countUsage, writeHash } from './url.js';
import { pref, yearOf } from './util.js';
import { scroller, setView, view } from './views.js';
import './text.js';
import './rail.js';
import './selection.js';
import './list.js';
import './map/period.js';
import './map/geography.js';
import './map/panels.js';

/* ---------- lifecycle ---------- */
for (const box of [drum, listBox]) {
  for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown']) {
    box.addEventListener(type, (event) => {
      S.navigationTime = null;
      if (type !== 'keydown' || /^(Arrow|Page|Home|End)/.test(event.key)) S.mapContextDirty = true;
    }, { passive: true });
  }
}
drum.addEventListener('scroll', () => { schedule(); writeHash(); }, { passive: true });
let resizeFrame = 0;
new ResizeObserver(() => {
  if (resizeFrame) return;
  // Updating the controls can resize main again; finish outside the observer's delivery cycle.
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = 0;
    const keep = S.META && scroller().scrollTop !== 0 ? centerTime() : null;
    geometry(); compactControls();
    if (keep != null) scrollToTime(keep, 'center');
    schedule();
  });
}).observe(main);
function applyLang() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = L[el.dataset.i18n]; });
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', L[el.dataset.i18nAria]); });
  const lb = $('#lang'); lb.textContent = L.other; lb.setAttribute('aria-label', L.aLang);
  document.querySelectorAll('#views button').forEach((b) => { b.title = b.getAttribute('aria-label'); });
  S.listDirty = true;
  $('#aboutBody').innerHTML = L.aboutHTML(S.META ? yearOf(S.FIRST) : 1909);
  $('#aboutBody [data-usage]').hidden = !window.terramotosUsage?.enabled;
  if (S.META) { applyCounts(); buildJump(); } else { $('#range').textContent = navigator.onLine === false ? L.offlineLoad : L.loading; jumpSel.options[0].textContent = L.jump; }
  if (!tip.hidden && tipFor >= 0 && tipFor < N) tip.innerHTML = tipHTML(tipFor, tipPinned);
  S.statsKey = ''; showColour(); playChrome();
  if (storyDlg.open) renderStory();
  showFreshness(); updateLatest(); schedule(); countUsage();
}
const about = $('#about');
$('#aboutBtn').addEventListener('click', () => about.showModal());
about.addEventListener('click', (ev) => { if (ev.target === about || ev.target.closest('.close')) about.close(); });
$('#lang').addEventListener('click', () => { setLang(lang === 'pt' ? 'en' : 'pt'); pref('seis.lang', lang); applyLang(); });
if (document.fonts) document.fonts.ready.then(schedule);

readColors();
applyLang();
document.querySelectorAll('#spans button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.span === span)));
setupRows(); setView(view, false); setStatsPeriod(statsPeriod);

let starting = false, bootRetry = 0;
function start() {
  if (starting || S.booted) return;
  clearTimeout(bootRetry);
  if (navigator.onLine === false) { $('#range').textContent = L.offlineLoad; showFreshness(); return; }
  starting = true;
  loadMeta(true)
    .then(() => {
      applyHash(); S.booted = true; countUsage();
      ensureYear(Math.max(...Object.keys(S.META.years).map(Number))); // the latest earthquake is in the newest year
      connectLive(); loadIpma();
      setInterval(() => { if (navigator.onLine !== false) loadMeta(false).catch(() => {}); }, META_POLL);
      setInterval(() => { if (document.visibilityState === 'visible') loadIpma(); }, IPMA_POLL);
      setInterval(() => { if (current()) setEnd(Date.now() / 1000); showFreshness(); updateLatest(); }, 30000);
    })
    .catch(() => {
      $('#range').textContent = navigator.onLine === false ? L.offlineLoad : L.loadError;
      showFreshness(); bootRetry = setTimeout(start, META_POLL);
    })
    .finally(() => { starting = false; });
}
function reconnect() {
  showFreshness();
  if (!S.booted) { start(); return; }
  loadMeta(false).catch(() => {}); loadIpma();
  if (!ws) { S.wsTries = 0; connectLive(); }
}
window.addEventListener('offline', () => {
  showFreshness();
  if (!S.META) $('#range').textContent = L.offlineLoad;
});
window.addEventListener('online', reconnect);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && navigator.onLine !== false) reconnect();
});
start();
