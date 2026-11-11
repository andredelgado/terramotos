// The three map panels: projection, zoom and pan, drawing and pointer handling.
import { placeTip } from '../card.js';
import { MAP_BOUNDS, MAP_PERIODS, MAX_ZOOM } from '../config.js';
import { LAND } from '../content/land.js';
import { $, atlas } from '../dom.js';
import { schedule } from '../drum.js';
import { fmtDate, fmtDec, fmtNum, fmtTime, L, placeName, REGION } from '../i18n.js';
import { mapColour } from './colour.js';
import { drawGeography, GEO, loadGeo } from './geography.js';
import { mapLive } from './period.js';
import { play, playChrome, playFrac, playSeconds, playTime, stopPlay } from './play.js';
import { drawRail } from '../rail.js';
import { pin, unpin } from '../selection.js';
import { S } from '../state.js';
import { CHUNKS, E, ensureYears, FAILED, firstYear, MAG, mask, N, REG, T, yearCounts } from '../store.js';
import { C } from '../theme.js';
import { lowerBound, yearOf } from '../util.js';

const mapPlots = [...document.querySelectorAll('.map-panel')].map((panel, r) => ({
  panel, r, canvas: panel.querySelector('canvas'), count: panel.querySelector('.map-count'), points: [], indices: [],
  zoom: 1, lon: null, lat: null, volcanoes: [], // lon/lat: what sits at the middle of the panel once zoomed
}));
for (const plot of mapPlots) {
  const box = document.createElement('div');
  box.className = 'map-zoom';
  box.innerHTML = '<button type="button" data-zoom="in" data-i18n-aria="zIn">+</button>' +
    '<button type="button" data-zoom="out" data-i18n-aria="zOut" disabled>−</button>' +
    '<button type="button" data-zoom="reset" data-i18n-aria="zReset" hidden><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M1 5V1h4M9 1h4v4M13 9v4H9M5 13H1V9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';
  plot.panel.append(box);
  plot.buttons = box;
}

/** Degrees to pixels for a panel. At zoom 1 the region's frame is fitted and centred; zooming scales it about plot.lon/lat. */
function mapProjection(plot, w, h) {
  const [west, east, south, north] = MAP_BOUNDS[plot.r];
  const cosine = Math.cos((south + north) * Math.PI / 360);
  const base = Math.max(0.01, Math.min((w - 36) / ((east - west) * cosine), (h - 52) / (north - south)));
  const k = base * plot.zoom;
  const lon0 = plot.lon ?? (west + east) / 2, lat0 = plot.lat ?? (south + north) / 2 - 14 / base;
  return {
    k, base, cosine, lon0, lat0,
    x: (lon) => w / 2 + (lon - lon0) * cosine * k, y: (lat) => h / 2 + (lat0 - lat) * k,
    lon: (x) => lon0 + (x - w / 2) / (cosine * k), lat: (y) => lat0 - (y - h / 2) / k,
  };
}
function mapChrome(plot) {
  const zoomed = plot.zoom > 1;
  plot.canvas.classList.toggle('zoomed', zoomed);
  plot.canvas.dataset.zoom = String(Math.round(plot.zoom * 100) / 100);
  plot.buttons.querySelector('[data-zoom="in"]').disabled = plot.zoom >= MAX_ZOOM;
  plot.buttons.querySelector('[data-zoom="out"]').disabled = !zoomed;
  plot.buttons.querySelector('[data-zoom="reset"]').hidden = !zoomed;
}
function centreMap(plot, lon, lat) { // keep the middle of the panel inside the region
  const [west, east, south, north] = MAP_BOUNDS[plot.r];
  plot.lon = Math.max(west, Math.min(east, lon)); plot.lat = Math.max(south, Math.min(north, lat));
}
/** Zoom by a factor, keeping the point under (mx, my) where it is; the middle of the panel by default. */
function zoomMap(plot, factor, mx, my) {
  const w = plot.canvas.clientWidth, h = plot.canvas.clientHeight;
  const zoom = Math.max(1, Math.min(MAX_ZOOM, plot.zoom * factor));
  if (!w || !h || zoom === plot.zoom) return;
  if (zoom === 1) { plot.zoom = 1; plot.lon = plot.lat = null; }
  else {
    const p = mapProjection(plot, w, h), k = p.base * zoom;
    const x = mx ?? w / 2, y = my ?? h / 2, lon = p.lon(x), lat = p.lat(y);
    plot.zoom = zoom;
    centreMap(plot, lon - (x - w / 2) / (p.cosine * k), lat + (y - h / 2) / k);
  }
  mapChrome(plot); schedule();
}
function panMap(plot, dx, dy) {
  if (plot.zoom === 1) return;
  const p = mapProjection(plot, plot.canvas.clientWidth, plot.canvas.clientHeight);
  centreMap(plot, p.lon0 - dx / (p.cosine * p.k), p.lat0 + dy / p.k);
  schedule();
}
const mapRadius = (m) => Number.isNaN(m) ? 2.5 : Math.min(34, 3 + 1.25 * Math.pow(Math.max(0, m), 1.5));
function drawMapPanel(plot) {
  const canvas = plot.canvas, w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  const ratio = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(w * ratio)) canvas.width = Math.round(w * ratio);
  if (canvas.height !== Math.round(h * ratio)) canvas.height = Math.round(h * ratio);
  const c = canvas.getContext('2d'), p = mapProjection(plot, w, h);
  c.setTransform(ratio, 0, 0, ratio, 0, 0);
  c.fillStyle = C.paper; c.fillRect(0, 0, w, h);
  const css = getComputedStyle(document.documentElement);
  const landFill = css.getPropertyValue('--fill').trim(), faint = css.getPropertyValue('--line').trim();
  if (GEO) drawGeography(c, p, w, h, landFill, faint, plot);
  else { // the detailed geography has not arrived yet: the bundled coastlines stand in
    c.fillStyle = landFill; c.strokeStyle = C.muted; c.lineWidth = 0.8;
    for (const [region, land] of LAND) {
      if (region !== plot.r) continue;
      const xs = land.map(([lon]) => p.x(lon)), ys = land.map(([, lat]) => p.y(lat));
      c.beginPath();
      if (Math.max(...xs) - Math.min(...xs) < 2 && Math.max(...ys) - Math.min(...ys) < 2) c.arc(xs[0], ys[0], 1, 0, 2 * Math.PI);
      else { c.moveTo(xs[0], ys[0]); for (let i = 1; i < xs.length; i++) c.lineTo(xs[i], ys[i]); c.closePath(); }
      c.fill(); c.stroke();
    }
  }
  // Past a few thousand earthquakes only M 3+ keep their circle and the rest become small dots.
  // During playback the newest ones (the trail) are always drawn in full, and stronger.
  const end = play.t ?? S.mapTo, trail = play.t == null ? 0 : (S.mapTo - S.mapFrom) / 25;
  const dense = plot.indices.length > 3000, coloured = mapColour !== 'none';
  let floor = 3; // the smallest magnitude that keeps its circle on a crowded panel
  if (dense) {
    const atLeast = [0, 0, 0];
    for (const e of plot.indices) for (let k = 0; k < 3; k++) if (MAG[e] >= 3 + k) atLeast[k]++;
    floor = atLeast[0] <= 1500 ? 3 : atLeast[1] <= 1500 ? 4 : 5;
  }
  const tint = (e) => {
    if (mapColour === 'depth') { const d = E[e].d; return d == null ? C.muted : C.ramp[d < 5 ? 0 : d < 15 ? 1 : d < 30 ? 2 : d < 60 ? 3 : 4]; }
    if (mapColour === 'age') return C.ramp[Math.max(0, Math.min(4, Math.floor(5 * (T[e] - S.mapFrom) / Math.max(1, end - S.mapFrom))))];
    return C.ink;
  };
  const ordered = [], dots = [];
  let ink = '';
  c.globalAlpha = coloured ? 0.8 : 0.45;
  for (const e of plot.indices) {
    const x = p.x(E[e].lon), y = p.y(E[e].lat), fresh = trail ? Math.max(0, 1 - (end - T[e]) / trail) : 0;
    if (dense && !fresh && !(MAG[e] >= floor)) {
      if (x < -2 || x > w + 2 || y < -2 || y > h + 2) continue;
      const colour = tint(e);
      if (colour !== ink) { ink = colour; c.fillStyle = colour; }
      c.fillRect(x - 1, y - 1, 2, 2);
      if (!play.on) dots.push({ e, x, y, radius: 2 });
    } else ordered.push({ e, x, y, radius: mapRadius(MAG[e]), fresh, tint: tint(e) });
  }
  ordered.sort((a, b) => (Number.isNaN(MAG[a.e]) ? -1 : MAG[a.e]) - (Number.isNaN(MAG[b.e]) ? -1 : MAG[b.e]));
  plot.points = dots.concat(ordered);
  c.lineWidth = 1;
  for (const point of ordered) {
    c.fillStyle = c.strokeStyle = point.tint;
    c.beginPath(); c.arc(point.x, point.y, point.radius, 0, 2 * Math.PI);
    if (Number.isNaN(MAG[point.e])) { c.globalAlpha = 0.6; c.stroke(); }
    else {
      c.globalAlpha = Math.min(1, (coloured ? 0.22 : 0.1) + 0.45 * point.fresh); c.fill();
      c.globalAlpha = Math.min(1, (coloured ? 0.6 : 0.3) + 0.6 * point.fresh); c.stroke();
    }
  }
  c.globalAlpha = 1;
  const focused = plot.points.find((point) => point.e === (S.pinned >= 0 ? S.pinned : S.hover));
  if (focused) {
    c.fillStyle = C.accent; c.strokeStyle = C.accent; c.globalAlpha = 0.14;
    c.beginPath(); c.arc(focused.x, focused.y, focused.radius, 0, 2 * Math.PI); c.fill();
    c.globalAlpha = 0.85; c.lineWidth = 1.2; c.stroke();
  }
  // Draw every location above the halos so overlapping symbols keep their precise centres.
  c.globalAlpha = 0.9;
  for (const point of ordered) {
    if (Number.isNaN(MAG[point.e])) continue;
    c.fillStyle = point.tint;
    c.beginPath(); c.arc(point.x, point.y, 2, 0, 2 * Math.PI); c.fill();
  }
  c.globalAlpha = 1;
  if (focused && !Number.isNaN(MAG[focused.e])) {
    c.fillStyle = C.accent; c.beginPath(); c.arc(focused.x, focused.y, 2.5, 0, 2 * Math.PI); c.fill();
  }
  // Each frame has its own scale, measured at the frame's middle latitude.
  const kmPerPixel = 111.195 / p.k, limit = Math.min(90, w / 3) * kmPerPixel;
  const km = [1, 2, 5, 10, 20, 50, 100, 200, 500].filter((n) => n <= limit).at(-1) || 5;
  const length = km / kmPerPixel, x = 16, y = h - 16;
  c.strokeStyle = C.muted; c.fillStyle = C.muted; c.lineWidth = 1;
  c.beginPath(); c.moveTo(x, y - 4); c.lineTo(x, y); c.lineTo(x + length, y); c.lineTo(x + length, y - 4); c.stroke();
  c.font = `10px ${C.font}`; c.textAlign = 'left'; c.textBaseline = 'bottom'; c.fillText(`${km} km`, x, y - 6);
}
export function renderMap() {
  if (!S.META) return;
  loadGeo();
  if (mapLive) {
    const end = Math.max(S.END, Date.now() / 1000);
    if (end !== S.mapTo && play.t == null) { S.mapTo = end; S.mapFrom = mapLive === 'all' ? S.FIRST : end - MAP_PERIODS[mapLive]; }
  }
  const waiting = [];
  for (let y = yearOf(S.mapFrom); y <= yearOf(S.mapTo); y++) {
    if (S.META.years[y] && yearCounts[y - firstYear] && !CHUNKS.has(y)) waiting.push(y);
  }
  ensureYears(waiting);
  if (play.on) { // the clock stands still while years are loading
    const now = performance.now();
    if (play.last && !waiting.length) play.t = playTime(Math.min(1, playFrac(play.t) + (now - play.last) / 1000 / playSeconds()));
    play.last = now;
    if (play.t >= S.mapTo) stopPlay(); else schedule();
  }
  playChrome();
  const shownTo = play.t ?? S.mapTo;
  for (const plot of mapPlots) plot.indices = [];
  for (let e = lowerBound(T, S.mapFrom); e < N && T[e] <= shownTo; e++) if (mask[e]) mapPlots[REG[e]].indices.push(e);
  let total = 0;
  $('#mapPanels').classList.toggle('filtered', S.region !== 'all');
  for (const plot of mapPlots) {
    plot.panel.hidden = S.region !== 'all' && Number(S.region) !== plot.r;
    const n = plot.indices.length; total += n;
    plot.count.textContent = fmtNum(n);
    plot.canvas.setAttribute('aria-label', L.aRegionMap(REGION[plot.r], fmtNum(n)));
    plot.canvas.setAttribute('aria-busy', String(waiting.length > 0));
    if (!plot.panel.hidden) drawMapPanel(plot);
  }
  $('#mapEmpty').hidden = waiting.length > 0 || total > 0 || play.t != null;
  const a = fmtDate(S.mapFrom), b = fmtDate(S.mapTo);
  $('#range').textContent = a === b ? `${a} · ${fmtTime(S.mapFrom).slice(0, 5)}–${fmtTime(S.mapTo).slice(0, 5)}` : `${a} – ${b}`;
  $('#range').title = `${new Date(S.mapFrom * 1000).toISOString()} – ${new Date(S.mapTo * 1000).toISOString()}`;
  const failed = waiting.find((y) => FAILED.has(y));
  $('#inview').textContent = failed ? L.failedY(failed) : waiting.length ? L.loadingY(waiting[0]) + '…' : L.inView(fmtNum(total));
  drawRail(S.mapFrom, S.mapTo); placeTip(0);
  if (S.mapScrollToPinned && S.pinned >= 0) {
    mapPlots[REG[S.pinned]].panel.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    S.mapScrollToPinned = false;
  }
}
function hitMap(plot, x, y, slop) {
  let best = -1, distance = Infinity, magnitude = -Infinity;
  for (const point of plot.points) {
    const d = Math.hypot(point.x - x, point.y - y);
    const m = Number.isNaN(MAG[point.e]) ? -Infinity : MAG[point.e];
    if (d <= point.radius + slop && (d < distance || (d === distance && (point.e === S.pinned || (best !== S.pinned && m > magnitude))))) {
      distance = d; best = point.e; magnitude = m;
    }
  }
  return best;
}
for (const plot of mapPlots) {
  const canvas = plot.canvas;
  canvas.addEventListener('mousemove', (event) => {
    const box = canvas.getBoundingClientRect(), e = hitMap(plot, event.clientX - box.left, event.clientY - box.top, 4);
    if (S.hover !== e) { S.hover = e; schedule(); }
    canvas.style.cursor = e >= 0 ? 'pointer' : 'crosshair';
    const mx = event.clientX - box.left, my = event.clientY - box.top;
    const volcano = e < 0 ? plot.volcanoes.find((v) => Math.hypot(v.x - mx, v.y - my) < 8) : null;
    canvas.title = e >= 0 ? `${Number.isNaN(MAG[e]) ? L.noMag : 'M ' + fmtDec(MAG[e], 1)} · ${placeName(E[e].place) || REGION[plot.r]} · ${fmtDate(T[e])}` : volcano ? volcano.name : '';
  });
  // drag to pan once zoomed, pinch with two fingers, wheel to zoom
  const fingers = new Map();
  let moved = 0, spread = 0, draggedAt = -1e9;
  canvas.addEventListener('pointerdown', (event) => {
    if (!fingers.size) moved = 0;
    fingers.set(event.pointerId, [event.clientX, event.clientY]);
    spread = 0;
    if (plot.zoom > 1 || fingers.size > 1) { try { canvas.setPointerCapture(event.pointerId); } catch (_) {} } // capture is a nicety
  });
  canvas.addEventListener('pointermove', (event) => {
    const last = fingers.get(event.pointerId);
    if (!last) return;
    fingers.set(event.pointerId, [event.clientX, event.clientY]);
    if (fingers.size === 2) {
      const [a, b] = [...fingers.values()], box = canvas.getBoundingClientRect();
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (spread) zoomMap(plot, d / spread, (a[0] + b[0]) / 2 - box.left, (a[1] + b[1]) / 2 - box.top);
      spread = d; moved = 99;
    } else if (plot.zoom > 1) {
      const dx = event.clientX - last[0], dy = event.clientY - last[1];
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved > 4) panMap(plot, dx, dy);
    }
  });
  const lift = (event) => {
    if (!fingers.delete(event.pointerId)) return;
    spread = 0;
    if (!fingers.size && moved > 4) draggedAt = event.timeStamp; // the click that follows a drag is not a selection
  };
  canvas.addEventListener('pointerup', lift);
  canvas.addEventListener('pointercancel', lift);
  canvas.addEventListener('wheel', (event) => {
    // a plain wheel scrolls the page when the maps do not all fit; with Ctrl (or a trackpad pinch) it always zooms
    if (!event.ctrlKey && !event.metaKey && atlas.scrollHeight > atlas.clientHeight + 1) return;
    event.preventDefault();
    const box = canvas.getBoundingClientRect();
    zoomMap(plot, Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.002)), event.clientX - box.left, event.clientY - box.top);
  }, { passive: false });
  plot.buttons.addEventListener('click', (event) => {
    const kind = event.target.closest('button')?.dataset.zoom;
    if (kind === 'in') zoomMap(plot, 1.6);
    else if (kind === 'out') zoomMap(plot, 1 / 1.6);
    else if (kind === 'reset') zoomMap(plot, 0);
  });
  canvas.addEventListener('mouseleave', () => { S.hover = -1; schedule(); });
  canvas.addEventListener('click', (event) => {
    if (event.timeStamp - draggedAt < 400) { draggedAt = -1e9; return; }
    const box = canvas.getBoundingClientRect();
    const finger = event.pointerType ? event.pointerType !== 'mouse' : matchMedia('(pointer: coarse)').matches;
    const e = hitMap(plot, event.clientX - box.left, event.clientY - box.top, finger ? 12 : 4);
    canvas.focus({ preventScroll: true });
    if (e >= 0 && e !== S.pinned) pin(e); else unpin();
  });
  canvas.addEventListener('keydown', (event) => {
    const zoomKey = { '+': 1.6, '=': 1.6, '-': 1 / 1.6, _: 1 / 1.6, 0: 0 }[event.key];
    if (zoomKey !== undefined) { event.preventDefault(); zoomMap(plot, zoomKey); return; }
    const shift = event.shiftKey && { ArrowLeft: [60, 0], ArrowRight: [-60, 0], ArrowUp: [0, 60], ArrowDown: [0, -60] }[event.key];
    if (shift) { event.preventDefault(); panMap(plot, ...shift); return; } // Shift + arrows move a zoomed map
    const direction = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, Enter: 0, ' ': 0, Home: 0, End: 0 }[event.key];
    if (direction === undefined) return;
    event.preventDefault();
    const items = plot.indices;
    let index = items.indexOf(S.pinned);
    if (event.key === 'Home') index = 0;
    else if (event.key === 'End' || index < 0) index = items.length - 1;
    else index += direction;
    if (items[index] != null) {
      pin(items[index]);
      if (plot.zoom > 1) { // bring a selection that is off the zoomed panel into view
        const ev = E[items[index]], p = mapProjection(plot, canvas.clientWidth, canvas.clientHeight);
        const x = p.x(ev.lon), y = p.y(ev.lat);
        if (x < 20 || x > canvas.clientWidth - 20 || y < 20 || y > canvas.clientHeight - 40) centreMap(plot, ev.lon, ev.lat);
      }
    }
  });
  mapChrome(plot);
  new ResizeObserver(schedule).observe(canvas);
}
