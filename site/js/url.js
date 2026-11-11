// The view in the address bar, so any state can be shared and restored.
import { MAP_PERIODS, SPANS, STAT_PERIODS, VIEWS } from './config.js';
import { jumpTo, onFilter, pendingJump, setSpan, span } from './controls.js';
import { magSel, regSel } from './dom.js';
import { centerTime, schedule, scrollToTime, setVTop } from './drum.js';
import { lang } from './i18n.js';
import { mapColour, setColour } from './map/colour.js';
import { chooseMapPeriod, mapLive, parseMapDate, setMapRange } from './map/period.js';
import { RADII, setNearBySlug } from './near.js';
import { openPage, pageDlg, pageOpen } from './page.js';
import { pinnedId, unpin } from './selection.js';
import { S } from './state.js';
import { setStatsPeriod, statsPeriod } from './stats.js';
import { scroller, setView, view } from './views.js';

/* ---------- the view in the URL: #s=span&m=magnitude&r=region, then q=earthquake or t=time, and page=earthquake ---------- */
S.booted = false;
let hashTimer = 0;
export function countUsage() { if (S.booted) window.terramotosUsage?.count(view, lang); }
export function viewHash(fixedMap = false) {
  const p = [];
  if (view !== 'drum') p.push('v=' + view);
  if (view === 'map') {
    if (!mapLive || fixedMap) p.push('from=' + new Date(S.mapFrom * 1000).toISOString(), 'to=' + new Date(S.mapTo * 1000).toISOString());
    else if (mapLive !== '24h') p.push('period=' + mapLive);
    if (mapColour !== 'none') p.push('c=' + mapColour);
  }
  if (view === 'stats' && statsPeriod !== 'all') p.push('sp=' + statsPeriod);
  if (span !== '3h') p.push('s=' + span);
  if (S.minMag !== 'all') p.push('m=' + S.minMag);
  if (S.region !== 'all') p.push('r=' + S.region);
  if (S.near) p.push('near=' + S.near.slug, ...(S.nearKm === 50 ? [] : ['km=' + S.nearKm]));
  const sharedId = pendingJump ? pendingJump.id : pinnedId;
  if (sharedId && /^\d{8}-/.test(sharedId)) p.push('q=' + sharedId);
  else if (view !== 'map' && view !== 'stats' && scroller().scrollTop > 0) p.push('t=' + new Date(centerTime() * 1000).toISOString().slice(0, 19));
  if (pageOpen) p.push('page=' + pageOpen);
  return p.length ? '#' + p.join('&') : '';
}
function syncHash() {
  clearTimeout(hashTimer);
  if (!S.booted) return;
  const h = viewHash();
  if (h !== location.hash) history.replaceState(null, '', h || location.pathname + location.search);
}
export function writeHash() { clearTimeout(hashTimer); hashTimer = setTimeout(syncHash, 250); }
export function applyHash() {
  if (!S.META || (!location.hash && !S.booted)) return;
  const p = new URLSearchParams(location.hash.slice(1));
  const s = SPANS[p.get('s')] ? p.get('s') : '3h';
  const m = ['2', '3', '4', '5'].includes(p.get('m')) ? p.get('m') : 'all';
  const r = ['0', '1', '2'].includes(p.get('r')) ? p.get('r') : 'all';
  if (m !== S.minMag || r !== S.region) { S.minMag = m; S.region = r; magSel.value = m; regSel.value = r; onFilter(); }
  const near = p.get('near') || '', km = RADII.includes(Number(p.get('km'))) ? Number(p.get('km')) : 50;
  if (near !== (S.near?.slug || '') || (near && km !== S.nearKm)) setNearBySlug(near, km);
  const nextView = VIEWS.includes(p.get('v')) ? p.get('v') : 'drum';
  if (nextView !== view) setView(nextView, false);
  if (s !== span) setSpan(s);
  const from = parseMapDate(p.get('from')), to = parseMapDate(p.get('to'));
  const mapDates = view === 'map' && Number.isFinite(from) && Number.isFinite(to) && to > from;
  if (mapDates) setMapRange(from, to, null, true);
  else if (view === 'map') chooseMapPeriod(p.get('period') === 'all' || Object.hasOwn(MAP_PERIODS, p.get('period')) ? p.get('period') : '24h');
  if (view === 'map' && ['depth', 'age'].includes(p.get('c'))) setColour(p.get('c'));
  if (view === 'stats') setStatsPeriod(Object.hasOwn(STAT_PERIODS, p.get('sp')) ? p.get('sp') : 'all');
  const page = p.get('page');
  if (page) openPage(page); else if (pageDlg.open) pageDlg.close();
  if (view === 'stats') { unpin(); schedule(); writeHash(); return; }
  const q = p.get('q') || '', time = p.get('t') || '';
  const ts = /^\d{4}-\d{2}-\d{2}T\d{2}(?::\d{2}){0,2}$/.test(time)
    ? Date.parse(time + (time.length === 13 ? ':00:00Z' : time.length === 16 ? ':00Z' : 'Z')) / 1000 : NaN;
  const qt = Date.UTC(+q.slice(0, 4), +q.slice(4, 6) - 1, +q.slice(6, 8), 12) / 1000;
  if (/^\d{8}-\w+$/.test(q) && Number.isFinite(qt)) jumpTo(qt, q);
  else if (Number.isFinite(ts)) { unpin(); scrollToTime(ts, 'center'); }
  else { unpin(); if (view !== 'map') setVTop(0); }
  schedule(); writeHash();
}
window.addEventListener('hashchange', applyHash);
