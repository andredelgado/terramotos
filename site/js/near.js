// Near a place: show only the earthquakes within a distance of a town.
import { onFilter } from './controls.js';
import { $ } from './dom.js';
import { L } from './i18n.js';
import { S } from './state.js';
import { esc, kmBetween, pref } from './util.js';

export const RADII = [25, 50, 100, 200];
const FAR_KM = 150; // a visitor further than this from every town is not in Portugal
const dlg = $('#near'), search = $('#nearSearch'), list = $('#nearList'), note = $('#nearNote');

// the chosen town and distance are remembered like the other filters
S.near = null;
S.nearKm = 50;
try {
  const saved = JSON.parse(pref('seis.near') || 'null');
  if (saved && typeof saved.slug === 'string' && Number.isFinite(saved.lat) && Number.isFinite(saved.lon) && RADII.includes(saved.km)) {
    S.near = { slug: saved.slug, name: String(saved.name), lat: saved.lat, lon: saved.lon };
    S.nearKm = saved.km;
  }
} catch (_) {}

// the towns: Portugal's municipalities, fetched the first time they are needed
let places = null, fetching = null;
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function loadPlaces() {
  fetching ||= fetch('places.json')
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((rows) => { places = rows.map(([slug, name, lat, lon, area]) => ({ slug, name, lat, lon, area, key: fold(name) })); return places; })
    .catch(() => { fetching = null; return []; });
  return fetching;
}

/** Show the filter's state in the header button, the status line and the dialog. */
export function showNear() {
  $('#nearBtn').setAttribute('aria-pressed', String(!!S.near));
  const chip = $('#nearChip');
  chip.hidden = !S.near;
  chip.textContent = S.near ? L.plChip(S.nearKm, S.near.name) : '';
  $('#nearClear').hidden = !S.near;
  search.placeholder = L.plSearch;
  document.querySelectorAll('#nearRadius button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.km) === S.nearKm)));
}
/** Choose a town (or none) and a distance, and apply them. A choice that came from a link is not remembered. */
export function setNear(place, km = S.nearKm, remember = true) {
  S.near = place ? { slug: place.slug, name: place.name, lat: place.lat, lon: place.lon } : null;
  S.nearKm = km;
  if (remember) pref('seis.near', S.near ? JSON.stringify({ ...S.near, km }) : '');
  showNear();
  onFilter();
}
/** The same, from a link: the town is named by its slug. */
export function setNearBySlug(slug, km) {
  if (!slug) { if (S.near) setNear(null, S.nearKm, false); return; }
  loadPlaces().then((all) => {
    const place = all.find((p) => p.slug === slug);
    if (place) setNear(place, km, false); else if (S.near) setNear(null, S.nearKm, false);
  });
}

function renderList() {
  const q = fold(search.value.trim());
  if (!q || !places) { list.innerHTML = ''; return; }
  // towns that start with what was typed come before those that only contain it
  const hits = places.filter((p) => p.key.includes(q)).sort((a, b) => a.key.startsWith(q) === b.key.startsWith(q) ? 0 : a.key.startsWith(q) ? -1 : 1).slice(0, 8);
  list.innerHTML = hits.length
    ? hits.map((p) => `<li><button type="button" data-slug="${p.slug}"><b>${esc(p.name)}</b><span>${esc(p.area)}</span></button></li>`).join('')
    : `<li class="none">${L.plNone}</li>`;
}
function open() {
  note.textContent = '';
  search.value = '';
  renderList();
  showNear();
  loadPlaces();
  dlg.showModal();
}
$('#nearBtn').addEventListener('click', open);
$('#nearChip').addEventListener('click', open);
search.addEventListener('input', () => { loadPlaces().then(renderList); });
list.addEventListener('click', (ev) => {
  const pick = ev.target.closest('[data-slug]');
  if (!pick) return;
  setNear(places.find((p) => p.slug === pick.dataset.slug));
  dlg.close();
});
$('#nearRadius').addEventListener('click', (ev) => {
  const b = ev.target.closest('button');
  if (!b) return;
  if (S.near) setNear(S.near, Number(b.dataset.km)); else { S.nearKm = Number(b.dataset.km); showNear(); }
});
$('#nearClear').addEventListener('click', () => { setNear(null); dlg.close(); });
// the visitor's position is used here, to find the nearest town, and goes nowhere else
$('#nearMe').addEventListener('click', () => {
  if (!navigator.geolocation) { note.textContent = L.plMeFail; return; }
  note.textContent = L.plMeWait;
  navigator.geolocation.getCurrentPosition((pos) => {
    loadPlaces().then((all) => {
      const here = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      let best = null, bestKm = Infinity;
      for (const p of all) { const km = kmBetween(here, p); if (km < bestKm) { best = p; bestKm = km; } }
      if (!best || bestKm > FAR_KM) { note.textContent = L.plMeFar; return; }
      setNear(best);
      dlg.close();
    });
  }, () => { note.textContent = L.plMeFail; }, { maximumAge: 600000, timeout: 15000 });
});
dlg.addEventListener('click', (ev) => { if (ev.target === dlg || ev.target.closest('.close')) dlg.close(); });
showNear();
