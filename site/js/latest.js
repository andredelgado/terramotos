// The "latest earthquake" line under the header.
import { jumpTo } from './controls.js';
import { $ } from './dom.js';
import { fmtDec, L, lang, placeName, REGION } from './i18n.js';
import { S } from './state.js';
import { CHUNKS, E, mask, N } from './store.js';
import { esc, eventHref, plainLinkClick } from './util.js';
import { setView, view } from './views.js';

/* ---------- latest earthquake ---------- */
let latestEv = null;
S.flashId = null;
export function updateLatest() {
  const box = $('#latest');
  const newest = S.META ? Math.max(...Object.keys(S.META.years).map(Number)) : 0;
  if (!CHUNKS.has(newest)) return; // the built link still works while offline or loading
  latestEv = null;
  for (let e = N - 1; e >= 0; e--) if (mask[e]) { latestEv = E[e]; break; }
  box.hidden = !latestEv;
  if (!latestEv) return;
  const ev = latestEv;
  // Live-only EMSC/IPMA IDs do not have permanent pages yet.
  const tag = /^\d{8}-[a-f0-9]+$/.test(ev.id) ? 'a' : 'button';
  let el = box.firstElementChild;
  if (el?.localName !== tag) {
    el = document.createElement(tag); el.className = 'latest'; box.replaceChildren(el);
  }
  if (tag === 'a') el.href = eventHref(ev.id, lang);
  else el.type = 'button';
  const date = new Date(ev.t * 1000).toISOString();
  const details = [Number.isNaN(ev.m) ? L.noMag : `M ${fmtDec(ev.m, 1)}`, placeName(ev.place) || REGION[ev.r]];
  const utc = date.slice(0, 19).replace('T', ' ') + ' UTC';
  const label = details.join(' · ') + ' · ';
  if (el.textContent !== L.latest + ' ' + label + utc) {
    el.innerHTML = `<span class="k">${L.latest}</span> ${esc(label)}<time datetime="${date}">${utc}</time>`;
  }
  el.classList.toggle('new', ev.id === S.flashId);
}
$('#latest').addEventListener('click', (e) => {
  if (!latestEv || !plainLinkClick(e)) return;
  e.preventDefault();
  if (view === 'stats') setView('drum', false);
  S.mapContextDirty = true; jumpTo(latestEv.t, latestEv.id);
});
