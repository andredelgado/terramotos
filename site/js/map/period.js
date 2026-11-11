// The map's period: rolling periods, fixed ranges and moving through time.
import { LHEAD, LROW, MAP_PERIODS, PADT } from '../config.js';
import { cancelJump } from '../controls.js';
import { listBox } from '../dom.js';
import { lastRow, nRows, ROWH, schedule, startAbs, viewH, vTop } from '../drum.js';
import { listRowTime } from '../list.js';
import { stopPlay } from './play.js';
import { unpin } from '../selection.js';
import { S } from '../state.js';
import { T } from '../store.js';
import { writeHash } from '../url.js';
import { pref } from '../util.js';
import { view } from '../views.js';

export let mapPeriod = MAP_PERIODS[pref('seis.mapPeriod')] ? pref('seis.mapPeriod') : '24h';
S.mapTo = Date.now() / 1000;
S.mapFrom = S.mapTo - MAP_PERIODS[mapPeriod];
export let mapLive = mapPeriod;
let mapContextRange = null;
S.mapVisited = false;
S.mapContextDirty = false;
S.mapScrollToPinned = false;
export const parseMapDate = (s) => /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(s || '') ? Date.parse(s) / 1000 : NaN;
export function visibleTimeRange() {
  if (view === 'map') return [S.mapFrom, S.mapTo];
  if (view === 'list') {
    const a = Math.floor(listBox.scrollTop / LROW);
    const b = Math.max(a, Math.ceil((listBox.scrollTop + listBox.clientHeight - LHEAD) / LROW) - 1);
    return [listRowTime(b), listRowTime(a)];
  }
  const vt = vTop(), last = lastRow();
  const a = Math.max(0, Math.min(nRows - 1, Math.floor((vt - PADT) / ROWH)));
  const b = Math.max(a, Math.min(nRows - 1, Math.floor((vt + viewH - PADT) / ROWH)));
  return [Math.max(S.FIRST, startAbs(last - b)), Math.min(S.END, startAbs(last - a + 1))];
}
function mapControls() {
  document.querySelectorAll('#periods button').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.period === mapPeriod));
    if (button.dataset.period === 'view') button.hidden = !mapContextRange;
  });
}
export function setMapRange(a, b, live = null, context = false) {
  stopPlay();
  S.mapFrom = a; S.mapTo = b; mapLive = live;
  mapPeriod = live || 'view';
  if (context) mapContextRange = [a, b];
  if (mapPeriod === 'view' && !mapContextRange) mapContextRange = [a, b];
  if (S.pinned >= 0 && (T[S.pinned] < a || T[S.pinned] > b)) unpin();
  mapControls(); schedule(); writeHash();
}
export function chooseMapPeriod(period) {
  cancelJump();
  if (period === 'view' && mapContextRange) { setMapRange(...mapContextRange, null, true); return; }
  if (period !== 'all' && !MAP_PERIODS[period]) period = '24h';
  const end = Math.max(S.END, Date.now() / 1000);
  setMapRange(period === 'all' ? S.FIRST : end - MAP_PERIODS[period], end, period);
  if (period !== 'all') pref('seis.mapPeriod', period); // the whole record is a heavy way to start a visit
}
export function moveMapTo(t) {
  const duration = S.mapTo - S.mapFrom;
  const end = Math.max(S.END, Date.now() / 1000);
  const b = Math.min(end, Math.max(S.FIRST + duration, t + duration / 2));
  setMapRange(b - duration, b, null, true);
}
document.querySelectorAll('#periods button').forEach((button) => button.addEventListener('click', () => chooseMapPeriod(button.dataset.period)));
