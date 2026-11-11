// Line length, filters and the Jump menu.
import { SPANS } from './config.js';
import { jumpSel, listBox, magSel, regSel } from './dom.js';
import { centerTime, geometry, schedule, scrollToTime, setupRows, setVTop } from './drum.js';
import { fmtDate, fmtDec, L, placeName, REGION } from './i18n.js';
import { renderList } from './list.js';
import { pin, unpin } from './selection.js';
import { S } from './state.js';
import { applyCounts, applyMask, CHUNKS, E, ensureYear, firstYear, mask } from './store.js';
import { openPage, storyTitles } from './page.js';
import { writeHash } from './url.js';
import { esc, pref, yearOf } from './util.js';
import { scroller, view } from './views.js';

export let span = SPANS[pref('seis.span')] ? pref('seis.span') : '3h';
S.minMag = pref('seis.mag') || 'all';
S.region = pref('seis.region') || 'all';

/* ---------- controls ---------- */
export function setSpan(s) {
  const tc = S.META ? centerTime() : null;
  const atTop = scroller().scrollTop === 0;
  span = s; pref('seis.span', s); writeHash();
  document.querySelectorAll('#spans button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.span === s)));
  setupRows(); geometry();
  if (atTop || tc == null) setVTop(0); else scrollToTime(tc, 'center');
  schedule();
}
document.querySelectorAll('#spans button').forEach((b) => b.addEventListener('click', () => { S.mapContextDirty = true; setSpan(b.dataset.span); }));
magSel.value = S.minMag; if (magSel.value !== S.minMag) { S.minMag = 'all'; magSel.value = 'all'; }
regSel.value = S.region; if (regSel.value !== S.region) { S.region = 'all'; regSel.value = 'all'; }
export const onFilter = () => {
  const t = S.META && view === 'list' && listBox.scrollTop > 0 ? centerTime() : null;
  ++S.listJump;
  applyMask(); applyCounts();
  if (view === 'list') {
    renderList();
    if (t != null) scrollToTime(t, 'center'); else setVTop(0);
  }
  writeHash();
};
magSel.addEventListener('change', () => { cancelJump(); S.minMag = magSel.value; pref('seis.mag', S.minMag); onFilter(); });
regSel.addEventListener('change', () => { cancelJump(); S.region = regSel.value; pref('seis.region', S.region); onFilter(); });

export function buildJump() {
  let html = `<option value="">${L.jump}</option><option value="latest">${L.latest}</option><optgroup label="${L.largest}">`;
  S.META.largest.slice(0, 10).forEach((q, i) => {
    html += `<option value="L:${i}">M ${fmtDec(q.m, 1)} · ${fmtDate(q.t)} · ${esc(placeName(q.place) || REGION[q.r])}</option>`;
  });
  html += `</optgroup><optgroup label="${L.decades}">`;
  for (let d = Math.floor(yearOf(S.END) / 10) * 10; d >= Math.floor(firstYear / 10) * 10; d -= 10) html += `<option value="d:${d}">${L.decade(d)}</option>`;
  const stories = storyTitles(); // empty until the list of texts has arrived
  if (stories.length) html += `</optgroup><optgroup label="${L.stories}">`;
  for (const [id, title] of stories) html += `<option value="S:${id}">${esc(title)}</option>`;
  jumpSel.innerHTML = html + `</optgroup><option value="first">${L.first}</option>`;
  compactControls();
}
export function compactControls() {
  magSel.options[0].textContent = innerWidth <= 600 ? 'M' : L.mag;
  regSel.options[0].textContent = innerWidth <= 360 ? L.regionShort : L.region;
  jumpSel.options[0].textContent = innerWidth <= 600 ? L.jumpShort : L.jump;
}
export let jumpRequest = 0, pendingJump = null;
export function cancelJump() {
  const changed = pendingJump !== null;
  pendingJump = null; ++jumpRequest;
  if (changed) writeHash();
}
export function finishJump() {
  if (!pendingJump || pendingJump.request !== jumpRequest) return false;
  const e = E.findIndex((ev) => ev.id === pendingJump.id);
  if (e < 0) return false;
  pendingJump = null;
  if (!mask[e]) {
    S.minMag = 'all'; S.region = 'all'; magSel.value = 'all'; regSel.value = 'all';
    pref('seis.mag', 'all'); pref('seis.region', 'all'); onFilter();
  }
  scrollToTime(E[e].t, 'center'); pin(e);
  return true;
}
export function jumpTo(t, id) {
  unpin();
  const request = ++jumpRequest;
  if (id) pendingJump = { id, request };
  // A shared ID only estimates the day until loaded; don't shift a fixed map to that estimate.
  if (view !== 'map' || !id) scrollToTime(t, 'center');
  if (!id) return;
  ensureYear(yearOf(t)).then(() => {
    if (request !== jumpRequest || !pendingJump) return;
    // Keep the requested ID in the address bar while a failed year is awaiting its retry.
    if (CHUNKS.has(yearOf(t)) && !finishJump()) {
      cancelJump(); writeHash();
    }
  });
}
jumpSel.addEventListener('change', () => {
  const v = jumpSel.value; jumpSel.value = '';
  if (!v || !S.META) return;
  if (v.startsWith('S:')) { openPage(v.slice(2)); return; }
  S.mapContextDirty = true;
  unpin();
  if (v === 'latest') { setVTop(0); return; }
  if (v === 'first') {
    ensureYear(yearOf(S.META.first)).then(() => { const ev = E.find((x) => Math.round(x.t) === S.META.first) || E[0]; jumpTo(ev.t, ev.id); });
    scrollToTime(S.META.first, 'center');
    return;
  }
  if (v.startsWith('d:')) {
    const d = Number(v.slice(2));
    scrollToTime(Math.min(S.END, Date.UTC(d + 10, 0, 1) / 1000 - 1), 'top');
    return;
  }
  const q = S.META.largest[Number(v.slice(2))];
  jumpTo(q.t, q.id);
});
