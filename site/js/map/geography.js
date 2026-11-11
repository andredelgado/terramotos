// Land, plate boundaries, faults, volcanoes and labels under the earthquakes.
import { schedule } from '../drum.js';
import { lang } from '../i18n.js';
import { C } from '../theme.js';
import { assetURL, pref } from '../util.js';
import { view } from '../views.js';

// Detailed geography for the map (tools/build_map.py): land with its neighbours, plate boundaries
// and labels. It is a separate file, fetched the first time the map is shown.
export let GEO = null, geoAsked = false;
export function loadGeo() {
  if (geoAsked) return;
  geoAsked = true;
  fetch(assetURL('map.json'))
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((g) => { GEO = g; schedule(); })
    .catch(() => { setTimeout(() => { geoAsked = false; if (view === 'map') schedule(); }, 30000); });
}
export function drawGeography(c, p, w, h, landFill, faint, plot) {
  const trace = (flat) => { // flat is [lon, lat, lon, lat, …]; returns false when it lies wholly off the canvas
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    c.beginPath();
    for (let i = 0; i < flat.length; i += 2) {
      const x = p.x(flat[i]), y = p.y(flat[i + 1]);
      if (i) c.lineTo(x, y); else c.moveTo(x, y);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    if (x1 < 0 || x0 > w || y1 < 0 || y0 > h) return false;
    if (x1 - x0 < 2 && y1 - y0 < 2) { c.beginPath(); c.arc((x0 + x1) / 2, (y0 + y1) / 2, 1, 0, 2 * Math.PI); } // an islet stays visible
    return true;
  };
  for (const [portugal, ring] of GEO.land) { // neighbours first, Portugal on top
    if (!trace(ring)) continue;
    c.closePath();
    c.fillStyle = portugal ? landFill : C.grid; c.strokeStyle = portugal ? C.muted : faint; c.lineWidth = portugal ? 0.8 : 1;
    c.fill(); c.stroke();
  }
  if (layers.faults) {
    loadFaults();
    c.strokeStyle = C.ink; c.lineWidth = 1; c.globalAlpha = 0.5;
    for (const line of FAULTS || []) if (trace(line)) c.stroke();
    c.globalAlpha = 1;
  }
  if (layers.plates) {
    c.strokeStyle = C.muted; c.lineWidth = 1; c.globalAlpha = 0.75; c.setLineDash([5, 4]);
    for (const line of GEO.plates) if (trace(line)) c.stroke();
    c.setLineDash([]); c.globalAlpha = 1;
  }
  plot.volcanoes = [];
  if (layers.volcanoes) {
    c.fillStyle = C.paper; c.strokeStyle = C.ink; c.lineWidth = 1; c.lineJoin = 'miter';
    for (const [lon, lat, name] of GEO.volcanoes || []) {
      const x = p.x(lon), y = p.y(lat);
      if (x < -6 || x > w + 6 || y < -6 || y > h + 6) continue;
      c.beginPath(); c.moveTo(x, y - 5); c.lineTo(x + 4.5, y + 3.5); c.lineTo(x - 4.5, y + 3.5); c.closePath(); c.fill(); c.stroke();
      plot.volcanoes.push({ x, y, name });
    }
  }
  // labels sit under the earthquakes, with a halo so the coast does not cut through them
  c.font = `10px ${C.font}`; c.lineJoin = 'round'; c.lineWidth = 3; c.strokeStyle = C.paper; c.fillStyle = C.muted;
  const placed = []; // labels are listed most important first; one that would overlap an earlier one is left out
  for (const [kind, lon, lat, en, pt] of GEO.labels) {
    const x = p.x(lon), y = p.y(lat), text = lang === 'pt' ? pt : en;
    const tw = c.measureText(text).width, city = kind === 'city';
    const left = city ? x - 3 : x - tw / 2, top = city ? y - 7 : y - (kind === 'island' ? 9 : 0) - 12;
    const box = [left - 2, top, left + tw + (city ? 8 : 0) + 2, top + 14];
    if (box[0] < 4 || box[2] > w - 4 || box[1] < 4 || box[3] > h - 26) continue;
    if (placed.some((q) => box[0] < q[2] && box[2] > q[0] && box[1] < q[3] && box[3] > q[1])) continue;
    placed.push(box);
    if (city) {
      c.beginPath(); c.arc(x, y, 1.5, 0, 2 * Math.PI); c.fill();
      c.textAlign = 'left'; c.textBaseline = 'middle';
      c.strokeText(text, x + 5, y); c.fillText(text, x + 5, y);
    } else {
      c.textAlign = 'center'; c.textBaseline = 'bottom';
      const lift = kind === 'island' ? 9 : 0;
      c.strokeText(text, x, y - lift); c.fillText(text, x, y - lift);
    }
  }
}

// optional layers, remembered between visits
const layers = { plates: true, faults: false, volcanoes: false };
{ const saved = pref('seis.layers'); if (saved != null) for (const name of Object.keys(layers)) layers[name] = saved.split(',').includes(name); }
let FAULTS = null, faultsAsked = false;
function loadFaults() { // a separate file: it is derived from GEM's database and stays under CC BY-SA 4.0
  if (faultsAsked) return;
  faultsAsked = true;
  fetch(assetURL('faults.json'))
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((f) => { FAULTS = f.faults; schedule(); })
    .catch(() => { setTimeout(() => { faultsAsked = false; if (view === 'map') schedule(); }, 30000); });
}
function showLayers() {
  document.querySelectorAll('#layers button').forEach((b) => b.setAttribute('aria-pressed', String(layers[b.dataset.layer])));
}
document.querySelectorAll('#layers button').forEach((b) => b.addEventListener('click', () => {
  layers[b.dataset.layer] = !layers[b.dataset.layer];
  pref('seis.layers', Object.keys(layers).filter((name) => layers[name]).join(','));
  showLayers(); schedule();
}));
showLayers();
