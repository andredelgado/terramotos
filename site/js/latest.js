// The "latest earthquake" line under the header.
import { jumpTo } from './controls.js';
import { $ } from './dom.js';
import { ago, fmtDec, L, placeName, REGION } from './i18n.js';
import { S } from './state.js';
import { CHUNKS, E, mask, N } from './store.js';
import { esc } from './util.js';
import { setView, view } from './views.js';

/* ---------- latest earthquake ---------- */
let latestEv = null;
S.flashId = null;
export function updateLatest() {
  const el = $('#latest');
  latestEv = null;
  const newest = S.META ? Math.max(...Object.keys(S.META.years).map(Number)) : 0;
  if (CHUNKS.has(newest)) for (let e = N - 1; e >= 0; e--) if (mask[e]) { latestEv = E[e]; break; }
  el.hidden = !latestEv;
  if (!latestEv) return;
  const ev = latestEv;
  el.innerHTML = `<span class="k">${L.latest}</span>` +
    esc([Number.isNaN(ev.m) ? L.noMag : `M ${fmtDec(ev.m, 1)}`, placeName(ev.place) || REGION[ev.r], ago(ev.t)].join(' · '));
  el.classList.toggle('new', ev.id === S.flashId);
}
$('#latest').addEventListener('click', () => { if (view === 'stats') setView('drum', false); S.mapContextDirty = true; if (latestEv) jumpTo(latestEv.t, latestEv.id); });
