// The catalogue in memory: loading years, merging the live feeds, and the filter mask.
import { hideTip, showTip } from './card.js';
import { MATCH_KM, MATCH_S } from './config.js';
import { finishJump, pendingJump } from './controls.js';
import { $ } from './dom.js';
import { schedule } from './drum.js';
import { fmtNum } from './i18n.js';
import { updateLatest } from './latest.js';
import { captureListAnchor, restoreListAnchor } from './list.js';
import { pinnedId, unpin } from './selection.js';
import { S } from './state.js';
import { hashId, kmBetween, lowerBound, yearOf } from './util.js';

// data: META describes every year; CHUNKS holds the years loaded so far. Two feeds read straight
// from the browser fill in what the stored catalogue does not have yet: IPMA (official, last
// ~30 days) and LIVE (EMSC's push feed, preliminary)
S.META = null;
export const CHUNKS = new Map(), LOADING = new Map(), LIVE = new Map(), IPMA = new Map();
export let E = [], N = 0, T = new Float64Array(0), MAG = new Float32Array(0), REG = new Uint8Array(0);
export let mask = new Uint8Array(0), cum = new Int32Array(1);
S.END = Date.now() / 1000;
S.FIRST = Date.UTC(1909, 0, 1) / 1000;
export let yearCounts = [];
export let yearMax = 1;
export let firstYear = 1909;
export function regionOf(lat, lon) {
  if (!S.META) return -1;
  for (let k = 0; k < S.META.polygons.length; k++) {
    const poly = S.META.polygons[k];
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
    }
    if (inside) return k;
  }
  return -1;
}

/* ---------- data ---------- */
function decodeYear(p) {
  const out = new Array(p.t.length);
  const felt = new Set(p.felt), inten = new Map(p.intensity);
  let acc = Date.UTC(p.year, 0, 1) / 1000;
  for (let i = 0; i < p.t.length; i++) {
    acc += p.t[i];
    out[i] = {
      id: p.id[i], t: acc, m: p.m[i] == null ? NaN : p.m[i] / 10,
      mt: p.mtypes[p.mt[i]], au: p.authors[p.ma[i]], r: p.r[i], d: p.d[i],
      lat: p.lat[i] / 100, lon: p.lon[i] / 100, place: p.places[p.p[i]], s: p.s[i], k: p.k[i],
      felt: felt.has(i), inten: inten.get(i) || null, live: false, seed: hashId(p.id[i]),
    };
  }
  return out;
}

export const FAILED = new Map(); // year -> time of the last failed fetch
export function ensureYear(y) {
  if (!S.META || !S.META.years[y]) return Promise.resolve();
  if (CHUNKS.has(y)) return Promise.resolve();
  if (LOADING.has(y)) return LOADING.get(y);
  if (Date.now() - (FAILED.get(y) || 0) < 20000) return Promise.resolve();
  const pr = fetch(`data/years/${y}.json?v=${S.META.years[y].v}`)
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((p) => { FAILED.delete(y); CHUNKS.set(y, { v: S.META.years[y].v, events: decodeYear(p) }); yearArrived(); })
    .catch(() => { FAILED.set(y, Date.now()); setTimeout(schedule, 20500); })
    .finally(() => { LOADING.delete(y); schedule(); });
  LOADING.set(y, pr);
  return pr;
}

// Many years at once (the whole record, for statistics or a long playback): six requests at a
// time, and the arrays are rebuilt every half second rather than after each file.
let bulk = 0, rebuildTimer = 0;
const QUEUED = new Set();
function yearArrived() {
  if (!bulk || pendingJump || LOADING.size <= 1) { clearTimeout(rebuildTimer); rebuildTimer = 0; rebuild(); }
  else if (!rebuildTimer) rebuildTimer = setTimeout(() => { rebuildTimer = 0; rebuild(); }, 500);
}
export function ensureYears(years) {
  const todo = years.filter((y) => S.META.years[y] && !CHUNKS.has(y) && !LOADING.has(y) && !QUEUED.has(y) && Date.now() - (FAILED.get(y) || 0) >= 20000);
  if (todo.length < 4) { todo.forEach(ensureYear); return; }
  for (const y of todo) QUEUED.add(y);
  bulk++;
  let next = 0;
  const run = () => { if (next >= todo.length) return null; const y = todo[next++]; QUEUED.delete(y); return ensureYear(y).then(run); };
  Promise.all(Array.from({ length: 6 }, run)).finally(() => {
    bulk--;
    if (rebuildTimer) { clearTimeout(rebuildTimer); rebuildTimer = 0; rebuild(); }
  });
}

/** Flatten the loaded years plus live events into the arrays the drawing uses. */
export function rebuild() {
  const anchor = captureListAnchor();
  const stored = [];
  for (const y of [...CHUNKS.keys()].sort((a, b) => a - b)) for (const ev of CHUNKS.get(y).events) stored.push(ev);
  const ST = Float64Array.from(stored, (ev) => ev.t);
  const list = stored.slice();
  const inStored = (ev) => {
    for (let i = lowerBound(ST, ev.t - MATCH_S); i < stored.length && ST[i] <= ev.t + MATCH_S; i++) {
      if ((ev.k && stored[i].k === ev.k) || kmBetween(stored[i], ev) <= MATCH_KM) return true;
    }
    return false;
  };
  // IPMA's own records first, then EMSC's for earthquakes neither the catalogue nor IPMA has
  const extra = [];
  for (const ev of IPMA.values()) if (!inStored(ev)) extra.push(ev);
  const nIpma = extra.length;
  for (const [unid, ev] of LIVE) {
    if (inStored(ev)) { LIVE.delete(unid); continue; } // the stored catalogue has it now
    let dup = false;
    for (let i = 0; i < nIpma && !dup; i++) dup = Math.abs(extra[i].t - ev.t) <= MATCH_S && kmBetween(extra[i], ev) <= MATCH_KM;
    if (!dup) extra.push(ev);
  }
  for (const ev of extra) list.push(ev);
  if (list.length !== stored.length) list.sort((a, b) => a.t - b.t);
  E = list; N = E.length;
  T = Float64Array.from(E, (ev) => ev.t);
  MAG = Float32Array.from(E, (ev) => ev.m);
  REG = Uint8Array.from(E, (ev) => ev.r);
  S.hover = -1;
  if (!pinnedId) hideTip(); // indexes moved; a hover tip would point at the wrong event
  S.pinned = pinnedId ? E.findIndex((ev) => ev.id === pinnedId) : -1;
  if (pinnedId && S.pinned < 0 && !LOADING.size) unpin();
  applyMask();
  if (S.near) applyCounts();
  if (S.pinned >= 0) showTip(S.pinned, true);
  restoreListAnchor(anchor);
  finishJump();
}

export function applyMask() {
  const mm = S.minMag === 'all' ? null : Number(S.minMag);
  const rg = S.region === 'all' ? null : Number(S.region);
  const near = S.near, reach = S.nearKm / 111; // a degree of latitude is about 111 km: a quick first test
  mask = new Uint8Array(N); cum = new Int32Array(N + 1);
  for (let e = 0; e < N; e++) {
    const ok = (rg === null || REG[e] === rg) && (mm === null || (!Number.isNaN(MAG[e]) && MAG[e] >= mm)) &&
      (!near || (Math.abs(E[e].lat - near.lat) <= reach && kmBetween(near, E[e]) <= S.nearKm));
    mask[e] = ok ? 1 : 0;
    cum[e + 1] = cum[e] + mask[e];
  }
  S.listDirty = true;
  if (S.pinned >= 0 && !mask[S.pinned]) unpin();
  updateLatest();
  schedule();
}

/** Per-year totals for the rail and the header, from META's counts (no year files needed). */
export function applyCounts() {
  if (!S.META) return;
  const mm = S.minMag === 'all' ? 0 : Number(S.minMag);
  const rg = S.region === 'all' ? null : Number(S.region);
  firstYear = yearOf(S.META.first);
  const y1 = yearOf(S.END);
  yearCounts = new Array(y1 - firstYear + 1).fill(0);
  let total = 0;
  for (const [y, regs] of Object.entries(S.META.counts)) {
    let n = 0;
    regs.forEach((b, r) => {
      if (rg !== null && r !== rg) return;
      b.forEach((c, k) => { if (mm === 0 || (k >= mm && k > 0)) n += c; });
    });
    if (Number(y) - firstYear < yearCounts.length) yearCounts[Number(y) - firstYear] = n;
    total += n;
  }
  if (S.near) {
    // distances are only known for the years in memory, so all of them are fetched; until a year
    // arrives its count stays the estimate above, which is what makes the views ask for it
    ensureYears(Object.keys(S.META.years).map(Number));
    total = 0;
    for (let k = 0; k < yearCounts.length; k++) {
      const y = firstYear + k;
      if (CHUNKS.has(y)) yearCounts[k] = cum[lowerBound(T, Date.UTC(y + 1, 0, 1) / 1000)] - cum[lowerBound(T, Date.UTC(y, 0, 1) / 1000)];
      total += yearCounts[k];
    }
  }
  yearMax = Math.max(1, ...yearCounts);
  S.listDirty = true;
  $('#count').textContent = fmtNum(total);
}
