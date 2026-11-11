// The details card (and hover tooltip) for one earthquake.
import { SOURCES } from './config.js';
import { LAND } from './content/land.js';
import { STORIES } from './content/stories.js';
import { drum, tip } from './dom.js';
import { posOf, viewH } from './drum.js';
import { agencyName, fmtDate, fmtDec, fmtTime, L, placeName, REGION } from './i18n.js';
import { unpin } from './selection.js';
import { S } from './state.js';
import { E } from './store.js';
import { openStory } from './stories.js';
import { viewHash } from './url.js';
import { esc } from './util.js';
import { view } from './views.js';

/* ---------- tooltip ---------- */
function linkFor(k) {
  if (k.startsWith('e:')) return [`https://www.seismicportal.eu/eventdetails.html?unid=${encodeURIComponent(k.slice(2))}`, L.openE];
  if (k.startsWith('i:')) return [`https://www.isc.ac.uk/cgi-bin/web-db-run?event_id=${encodeURIComponent(k.slice(2))}&out_format=ISF2&request=COMPREHENSIVE`, L.openI];
  if (k.startsWith('u:')) return [`https://earthquake.usgs.gov/earthquakes/eventpage/${encodeURIComponent(k.slice(2))}`, L.openU];
  return ['https://www.ipma.pt/pt/geofisica/sismicidade/', L.openP];
}
/** A small locator map of the earthquake's region: land outlines and a dot. */
function mapSVG(ev) {
  // frame the region's land (the remote Selvagens aside) together with the earthquake
  const shapes = LAND.filter(([r]) => r === ev.r).map(([, pts]) => pts);
  let x0 = ev.lon, x1 = ev.lon, y0 = ev.lat, y1 = ev.lat;
  for (const pts of shapes) {
    if (pts[0][1] < 31) continue;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  x0 -= 0.3; x1 += 0.3; y0 -= 0.3; y1 += 0.3;
  const mw = 240, mh = 132, pad = 8, c = Math.cos(((y0 + y1) / 2) * Math.PI / 180);
  const k = Math.min((mw - 2 * pad) / ((x1 - x0) * c), (mh - 2 * pad) / (y1 - y0)); // px per degree of latitude
  const ox = (mw - (x1 - x0) * c * k) / 2, oy = (mh - (y1 - y0) * k) / 2;
  const X = (lon) => ox + (lon - x0) * c * k, Y = (lat) => oy + (y1 - lat) * k;
  const f = (n) => n.toFixed(1);
  let land = '';
  for (const pts of shapes) {
    const xs = pts.map(([lo]) => X(lo)), ys = pts.map(([, la]) => Y(la));
    // an islet smaller than a couple of pixels is drawn as a dot so it stays visible
    if (Math.max(...xs) - Math.min(...xs) < 2.5 && Math.max(...ys) - Math.min(...ys) < 2.5) land += `<circle cx="${f(xs[0])}" cy="${f(ys[0])}" r="1.2"/>`;
    else land += `<path d="M${xs.map((x, i) => `${f(x)} ${f(ys[i])}`).join('L')}Z"/>`;
  }
  const px = f(Math.max(5, Math.min(mw - 5, X(ev.lon)))), py = f(Math.max(5, Math.min(mh - 5, Y(ev.lat))));
  return `<svg class="map" viewBox="0 0 ${mw} ${mh}" role="img" aria-label="${L.aMap}"><g class="land">${land}</g>` +
    `<circle class="ring" cx="${px}" cy="${py}" r="8"/><circle class="dot" cx="${px}" cy="${py}" r="3"/></svg>`;
}
export function tipHTML(e, isPinned) {
  const ev = E[e], m = ev.m;
  const src = SOURCES.filter(([b]) => ev.s & b).map(([, n]) => n).join(' · ');
  const link = linkFor(ev.k);
  const coords = `${fmtDec(Math.abs(ev.lat), 2)}°${ev.lat >= 0 ? 'N' : 'S'} ${fmtDec(Math.abs(ev.lon), 2)}°${ev.lon >= 0 ? L.E : L.W}`;
  const meta = [REGION[ev.r], ev.d != null ? L.deep(ev.d) : null, coords].filter(Boolean).join(' · ');
  const feltLine = ev.inten ? L.feltI(ev.inten) : ev.felt ? L.felt : '';
  return (isPinned ? `<button class="close" type="button" aria-label="${L.close}">×</button>` : '') +
    `<div class="mag">${Number.isNaN(m) ? L.noMag : `M ${fmtDec(m, 1)}`}${!Number.isNaN(m) && ev.mt ? `<small>${esc(ev.mt)}</small>` : ''}</div>` +
    (!Number.isNaN(m) && ev.au ? `<div class="meta">${esc(L.magBy(agencyName(ev.au)))}</div>` : '') +
    `<div>${fmtDate(ev.t)} · ${fmtTime(ev.t)} UTC</div>` +
    (ev.place ? `<div class="where">${esc(placeName(ev.place))}</div>` : '') +
    (feltLine ? `<div>${esc(feltLine)}</div>` : '') +
    `<div class="meta">${esc(meta)}</div>` +
    (ev.live ? `<div class="prelim">${L.prelim}</div>` : `<div class="src">${L.source} ${esc(src)}</div>`) +
    (isPinned ? mapSVG(ev) + `<div class="links"><a href="${link[0]}" target="_blank" rel="noopener">${link[1]} ↗</a>` +
      (/^\d{8}-/.test(ev.id) ? `<button class="copy" type="button">${L.copy}</button>` : '') +
      (STORIES.some((st) => st.id === ev.id) ? `<button class="story" type="button" data-story="${STORIES.find((st) => st.id === ev.id).key}">${L.readStory}</button>` : '') + '</div>' : '');
}
export let tipFor = -1, tipPinned = false, tipAt = null;
export function showTip(e, isPinned, at) {
  if (tipFor !== e || tipPinned !== isPinned || isPinned) tip.innerHTML = tipHTML(e, isPinned);
  tipFor = e; tipPinned = isPinned; tipAt = at || null;
  tip.classList.toggle('pinned', isPinned);
  tip.hidden = false;
  tip.classList.toggle('docked', view !== 'drum');
}
export function hideTip() { tip.hidden = true; tipFor = -1; tipPinned = false; }
export function placeTip(vt) {
  if (tip.hidden) return;
  if (tipPinned) {
    if (S.pinned < 0) { tip.style.visibility = 'hidden'; return; }
    if (tipFor !== S.pinned) showTip(S.pinned, true);
  }
  if (view !== 'drum') { tip.style.visibility = 'visible'; return; }
  let x, y;
  if (tipPinned || !tipAt) {
    const p = posOf(tipFor, vt);
    if (p.y < -10 || p.y > viewH + 10) { tip.style.visibility = 'hidden'; return; }
    x = p.x; y = p.y;
  } else { x = tipAt[0]; y = tipAt[1]; }
  tip.style.visibility = 'visible';
  const mainW = drum.parentElement.clientWidth, mainH = drum.parentElement.clientHeight;
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  let left = x + 14, top = y + 14;
  if (left + tw > mainW - 4) left = x - tw - 14;
  if (top + th > mainH - 4) top = y - th - 14;
  tip.style.left = Math.max(4, left) + 'px';
  tip.style.top = Math.max(4, top) + 'px';
}
tip.addEventListener('click', (ev) => {
  if (ev.target.closest('.close')) { unpin(); return; }
  const st = ev.target.closest('.story');
  if (st) { openStory(st.dataset.story); return; }
  const c = ev.target.closest('.copy');
  if (c && navigator.clipboard) {
    const url = new URL(location.href);
    url.hash = viewHash(true); // snapshot the map period in the shared link, keeping this view live
    navigator.clipboard.writeText(url.href).then(() => { c.textContent = L.copied; }, () => {});
  }
});
