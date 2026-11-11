// The list view: a virtualised table, newest first.
import { placeTip } from './card.js';
import { LHEAD, LROW } from './config.js';
import { cancelJump } from './controls.js';
import { $, listBox, rowsEl } from './dom.js';
import { schedule } from './drum.js';
import { fmtDate, fmtDec, fmtTime, L, lang, placeName, REGION } from './i18n.js';
import { drawRail } from './rail.js';
import { pin, stepQuake, unpin } from './selection.js';
import { S } from './state.js';
import { CHUNKS, E, ensureYear, FAILED, firstYear, mask, T, yearCounts } from './store.js';
import { writeHash } from './url.js';
import { esc, lowerBound, yearOf } from './util.js';
import { view } from './views.js';

const listGrid = listBox.querySelector('table');
let listYears = [];
let listTotal = 0;
S.listDirty = true;
let listKey = '';
S.listJump = 0;
function layoutList() {
  if (!S.listDirty) return;
  S.listDirty = false; listKey = '';
  listYears = []; listTotal = 0;
  if (!S.META) return;
  for (let y = yearOf(S.END); y >= firstYear; y--) {
    let idx = null, n;
    if (CHUNKS.has(y) || !S.META.years[y]) {
      idx = [];
      for (let e = lowerBound(T, Date.UTC(y, 0, 1) / 1000), hi = lowerBound(T, Date.UTC(y + 1, 0, 1) / 1000); e < hi; e++) if (mask[e]) idx.push(e);
      n = idx.length;
    } else n = yearCounts[y - firstYear] || 0;
    if (!n) continue;
    listYears.push({ y, n, top: listTotal, idx });
    listTotal += n;
  }
}
export function captureListAnchor() {
  if (view !== 'list' || !S.META || listBox.scrollTop === 0) return null;
  const row = Math.floor(listBox.scrollTop / LROW), t = listRowTime(row);
  const e = lowerBound(T, t);
  return { t, id: T[e] === t ? E[e].id : null, offset: listBox.scrollTop % LROW };
}
export function restoreListAnchor(anchor) {
  if (view !== 'list') return;
  renderList(); // establish the full scroll height before moving into it
  if (!anchor) return;
  const e = anchor.id ? E.findIndex((ev) => ev.id === anchor.id) : -1;
  listBox.scrollTop = listRowOf(e >= 0 && mask[e] ? T[e] : anchor.t) * LROW + anchor.offset;
  schedule();
}
export function placeListTime(t, align) {
  layoutList(); renderList();
  const offset = align === 'top' ? 0 : Math.max(0, listBox.clientHeight - LHEAD) / 3;
  listBox.scrollTop = Math.max(0, listRowOf(t) * LROW + (align === 'top' ? 0 : LROW / 2) - offset);
  schedule(); writeHash();
}
export function keepListEventVisible(e) {
  const top = listRowOf(T[e]) * LROW;
  if (top < listBox.scrollTop || top + LROW > listBox.scrollTop + listBox.clientHeight - LHEAD) placeListTime(T[e], 'center');
}
const yearSpan = (y) => [Math.max(S.FIRST, Date.UTC(y, 0, 1) / 1000), Math.min(S.END, Date.UTC(y + 1, 0, 1) / 1000)];
/** The time of row r (0 = newest); estimated inside a year that is not loaded yet. */
export function listRowTime(r) {
  layoutList();
  r = Math.max(0, Math.min(listTotal - 1, Math.floor(r)));
  for (const b of listYears) {
    if (r >= b.top + b.n) continue;
    const k = Math.max(0, r - b.top);
    if (b.idx) return T[b.idx[b.n - 1 - k]];
    const [a, z] = yearSpan(b.y);
    return z - ((k + 0.5) / b.n) * (z - a);
  }
  return S.FIRST;
}
/** The row showing the earthquake at time t, or the first row older than t. */
function listRowOf(t) {
  layoutList();
  const y = yearOf(t);
  for (const b of listYears) {
    if (b.y > y) continue;
    if (b.y < y) return b.top;
    if (b.idx) {
      let lo = 0, hi = b.n; // how many of the year's earthquakes are at or before t
      while (lo < hi) { const m = (lo + hi) >> 1; if (T[b.idx[m]] <= t) lo = m + 1; else hi = m; }
      return b.top + Math.min(b.n - 1, b.n - lo);
    }
    const [a, z] = yearSpan(b.y);
    return b.top + Math.min(b.n - 1, Math.floor(((z - t) / (z - a)) * b.n));
  }
  return Math.max(0, listTotal - 1);
}
function rowHTML(e, row) {
  const ev = E[e], m = ev.m;
  return `<tr id="quake-${e}" data-e="${e}" aria-rowindex="${row + 2}" aria-selected="${e === S.pinned}"${e === S.pinned ? ' class="on"' : ''}>` +
    `<td>${fmtDate(ev.t)} <span class="tm">${fmtTime(ev.t)}</span></td>` +
    `<td>${Number.isNaN(m) ? '<span class="na">–</span>' : `<b>${fmtDec(m, 1)}</b> <small>${esc(ev.mt || '')}</small>`}</td>` +
    `<td title="${esc(placeName(ev.place) || REGION[ev.r])}">${esc(placeName(ev.place) || REGION[ev.r])}${ev.live ? `<em>${L.prelimShort}</em>` : ''}</td>` +
    `<td class="opt">${REGION[ev.r]}</td><td class="opt">${ev.d != null ? `${ev.d} km` : ''}</td></tr>`;
}
export function renderList() {
  if (!S.META) return;
  layoutList();
  const st = listBox.scrollTop, H = listBox.clientHeight;
  const va = Math.min(Math.max(0, listTotal - 1), Math.floor(st / LROW)), vb = Math.min(listTotal, Math.max(va + 1, Math.ceil((st + H - LHEAD) / LROW)));
  const a = Math.max(0, va - 8), b = Math.min(listTotal, vb + 8);
  const waiting = [];
  for (const blk of listYears) if (!blk.idx && blk.top < vb && blk.top + blk.n > va) { waiting.push(blk.y); ensureYear(blk.y); }
  const cols = innerWidth <= 900 ? 3 : 5;
  const key = `${a}:${b}:${S.pinned}:${lang}:${cols}:${waiting.map((y) => FAILED.get(y) || 0).join(',')}`;
  if (key !== listKey) { // layoutList clears the key whenever the data or the filters change
    listKey = key;
    const pad = (rows) => (rows > 0 ? `<tr class="pad" aria-hidden="true" style="height:${rows * LROW}px"><td colspan="${cols}"></td></tr>` : '');
    let html = pad(a);
    for (const blk of listYears) {
      if (blk.top + blk.n <= a) continue;
      if (blk.top >= b) break;
      const k0 = Math.max(a, blk.top) - blk.top, k1 = Math.min(b, blk.top + blk.n) - blk.top;
      if (blk.idx) for (let k = k0; k < k1; k++) html += rowHTML(blk.idx[blk.n - 1 - k], blk.top + k);
      else html += `<tr class="wait" style="height:${(k1 - k0) * LROW}px"><td colspan="${cols}">${FAILED.has(blk.y) ? L.failedY(blk.y) : L.loadingY(blk.y) + '…'}</td></tr>`;
    }
    rowsEl.innerHTML = listTotal ? html + pad(listTotal - b) : `<tr class="wait" style="height:${LROW * 2}px"><td colspan="${cols}">${L.none}</td></tr>`;
    listGrid.setAttribute('aria-rowcount', String(listTotal + 1));
    if (S.pinned >= 0 && rowsEl.querySelector(`#quake-${S.pinned}`)) listGrid.setAttribute('aria-activedescendant', `quake-${S.pinned}`);
    else listGrid.removeAttribute('aria-activedescendant');
  }
  const tB = listTotal ? listRowTime(va) : S.END, tA = listTotal ? listRowTime(Math.max(va, vb - 1)) : S.END;
  const d0 = fmtDate(tA), d1 = fmtDate(tB);
  $('#range').innerHTML = listTotal ? `<b>${d0 === d1 ? d1 : `${d0} – ${d1}`}</b>` : '';
  const failed = waiting.filter((y) => FAILED.has(y));
  $('#inview').textContent = failed.length ? L.failedY(failed[0]) : waiting.length ? L.loadingY(waiting[0]) + (waiting.length > 1 ? '…' : '') : '';
  drawRail(tA, tB);
  placeTip(0);
}
rowsEl.addEventListener('click', (ev) => {
  const tr = ev.target.closest('tr[data-e]');
  if (!tr) return;
  listGrid.focus({ preventScroll: true });
  const e = Number(tr.dataset.e);
  if (e === S.pinned) unpin(); else pin(e);
});
listBox.addEventListener('scroll', () => { schedule(); writeHash(); }, { passive: true });
// A user's scroll takes precedence over an in-flight jump to an unloaded year.
for (const type of ['wheel', 'touchstart', 'pointerdown']) listBox.addEventListener(type, () => { ++S.listJump; cancelJump(); }, { passive: true });
listBox.addEventListener('keydown', (ev) => {
  if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
  ev.preventDefault();
  stepQuake(ev.key === 'ArrowUp' ? 1 : -1); // up the list is later in time
});
