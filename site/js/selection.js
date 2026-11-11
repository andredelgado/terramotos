// The selected earthquake: pinning, unpinning and stepping to the next one.
import { hideTip, showTip } from './card.js';
import { LROW, PADB, PADT } from './config.js';
import { cancelJump } from './controls.js';
import { $, listBox } from './dom.js';
import { centerTime, posOf, schedule, scrollToTime, viewH, vTop } from './drum.js';
import { keepListEventVisible, listRowTime } from './list.js';
import { S } from './state.js';
import { CHUNKS, E, ensureYear, firstYear, mask, N, T, yearCounts } from './store.js';
import { writeHash } from './url.js';
import { lowerBound, yearOf } from './util.js';
import { view } from './views.js';

S.hover = -1;
S.pinned = -1;
export let pinnedId = null;

/** Pin the next (dir 1) or previous (dir -1) earthquake in time, loading years on the way as needed. */
export function stepQuake(dir) {
  if (!S.META) return;
  cancelJump();
  const t0 = S.pinned >= 0 ? T[S.pinned] : view === 'list' ? listRowTime(Math.floor(listBox.scrollTop / LROW)) : centerTime();
  const y0 = yearOf(t0);
  if (S.META.years[y0] && !CHUNKS.has(y0) && yearCounts[y0 - firstYear]) {
    ensureYear(y0).then(() => { if (CHUNKS.has(y0)) stepQuake(dir); });
    return;
  }
  let e = S.pinned >= 0 ? S.pinned + dir : lowerBound(T, t0) - (view !== 'list' && dir < 0 ? 1 : 0);
  while (e >= 0 && e < N && !mask[e]) e += dir;
  const found = e >= 0 && e < N;
  const yEnd = yearOf(found ? T[e] : dir > 0 ? S.END : S.FIRST);
  for (let y = yearOf(t0); dir > 0 ? y <= yEnd : y >= yEnd; y += dir) {
    // a year not loaded yet may hold a closer earthquake: fetch it, then try again
    if (S.META.years[y] && !CHUNKS.has(y) && yearCounts[y - firstYear]) { ensureYear(y).then(() => { if (CHUNKS.has(y)) stepQuake(dir); }); return; }
  }
  if (!found) return;
  if (view === 'list') {
    keepListEventVisible(e);
  } else {
    const y = posOf(e, vTop()).y;
    if (y < PADT || y > viewH - PADB) scrollToTime(T[e], 'center');
  }
  pin(e);
}
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !$('#about').open && !$('#story').open) unpin(); });
export function pin(e) {
  cancelJump();
  S.pinned = e; pinnedId = E[e].id; showTip(e, true);
  if (view === 'list') keepListEventVisible(e);
  if (view === 'map') S.mapScrollToPinned = true;
  schedule(); writeHash();
}
export function unpin() { cancelJump(); if (S.pinned < 0 && !pinnedId) return; S.pinned = -1; pinnedId = null; hideTip(); schedule(); writeHash(); }
