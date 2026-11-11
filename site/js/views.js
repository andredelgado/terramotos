// Switching between the seismograph, list, map and statistics.
import { hideTip, showTip } from './card.js';
import { VIEWS } from './config.js';
import { $, atlas, drum, jumpSel, listBox, main, railBox, statsBox } from './dom.js';
import { centerTime, geometry, schedule, scrollToTime, setVTop } from './drum.js';
import { chooseMapPeriod, mapPeriod, setMapRange, visibleTimeRange } from './map/period.js';
import { play } from './map/play.js';
import { unpin } from './selection.js';
import { S } from './state.js';
import { T } from './store.js';
import { countUsage, writeHash } from './url.js';
import { pref } from './util.js';

export let view = VIEWS.includes(pref('seis.view')) ? pref('seis.view') : 'drum';
export const scroller = () => (view === 'map' ? atlas : view === 'list' ? listBox : view === 'stats' ? statsBox : drum);

/** Switch between the drum and the list, staying at the same moment in time. */
export function setView(v, keep = true) {
  v = VIEWS.includes(v) ? v : 'drum';
  const source = view;
  const historical = S.META && source !== 'map' && source !== 'stats' && scroller().scrollTop > 0;
  const incoming = keep && v === 'map' && historical && (!S.mapVisited || S.mapContextDirty) ? visibleTimeRange() : null;
  const t = keep && S.META ? S.pinned >= 0 ? T[S.pinned] : source !== 'stats' && (source === 'map' || scroller().scrollTop > 0) ? centerTime() : null : null;
  if (v !== 'map') play.on = false;
  if (v === 'stats') unpin();
  ++S.listJump;
  view = v; pref('seis.view', v);
  document.querySelectorAll('#views button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
  drum.hidden = v !== 'drum'; listBox.hidden = v !== 'list'; atlas.hidden = v !== 'map'; statsBox.hidden = v !== 'stats';
  $('#spans').hidden = v !== 'drum'; $('#periods').hidden = v !== 'map'; $('#speriods').hidden = v !== 'stats';
  railBox.hidden = jumpSel.hidden = v === 'stats';
  main.classList.toggle('list-view', v === 'list' || v === 'map');
  main.classList.toggle('map-view', v === 'map');
  S.hover = -1; S.listDirty = true;
  if (S.pinned >= 0) showTip(S.pinned, true); else hideTip();
  geometry();
  if (v === 'map') {
    if (incoming) {
      let [a, b] = incoming;
      if (b <= a) { a -= 43200; b += 43200; }
      if (S.pinned >= 0 && (T[S.pinned] < a || T[S.pinned] > b)) { const d = b - a; a = T[S.pinned] - d / 2; b = a + d; }
      setMapRange(a, b, null, true);
    } else if (!S.mapVisited) chooseMapPeriod(mapPeriod);
    S.mapVisited = true; S.mapContextDirty = false;
    if (S.pinned >= 0) S.mapScrollToPinned = true;
  } else if (v === 'stats') {
    $('#range').removeAttribute('title');
    S.statsKey = '';
  } else {
    $('#range').removeAttribute('title');
    if (source === 'map') S.mapContextDirty = false;
    if (t != null) scrollToTime(t, 'center'); else setVTop(0);
  }
  schedule(); writeHash(); countUsage();
}
document.querySelectorAll('#views button').forEach((b) => b.addEventListener('click', () => { if (b.dataset.view !== view) setView(b.dataset.view); }));
