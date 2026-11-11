// What keeps the page current: the site's own data, IPMA's feed and EMSC's live feed.
import { EMSC_WS, IPMA_FEED, IPMA_POLL } from './config.js';
import { buildJump } from './controls.js';
import { $ } from './dom.js';
import { geometry, schedule, setEnd, setupRows, setVTop } from './drum.js';
import { ago, fmtDate, fmtTime, L } from './i18n.js';
import { updateLatest } from './latest.js';
import { S } from './state.js';
import { applyCounts, CHUNKS, E, IPMA, LIVE, rebuild, regionOf } from './store.js';
import { hashId } from './util.js';

let ipmaAt = 0, emscAt = 0, ipmaFailed = false; // successful data receipts, rather than connection times
let liveOn = false;

/* ---------- live: EMSC feed + fresh site data ---------- */
const dataAt = () => Math.max(S.META ? Date.parse(S.META.generated) || 0 : 0, ipmaAt, emscAt);
export const current = () => navigator.onLine !== false && dataAt() > 0 && Date.now() - dataAt() < 3 * IPMA_POLL;
export function showFreshness() {
  const el = $('#freshness');
  const at = dataAt(), pending = !ipmaAt && !emscAt && !ipmaFailed;
  const state = navigator.onLine === false ? 'offline' : current() ? 'current' : 'stale';
  el.hidden = !S.META && state !== 'offline';
  el.dataset.state = state;
  el.className = state === 'current' && liveOn ? 'live' : '';
  el.textContent = [state === 'offline' ? L.offline : state === 'stale' ? L.delayed : '', at ? L.updated(ago(at / 1000)) : ''].filter(Boolean).join(' · ');
  const stamp = (t) => `${fmtDate(t / 1000)} ${fmtTime(t / 1000)} UTC`;
  el.title = [
    S.META ? L.catalogue(stamp(Date.parse(S.META.generated))) : '',
    ipmaAt ? L.received('IPMA', stamp(ipmaAt)) : '',
    ipmaFailed ? L.ipmaFailed : pending ? L.checking : '',
    emscAt ? L.received('EMSC', stamp(emscAt)) : '',
    liveOn && navigator.onLine !== false ? L.emscConnected : L.emscDisconnected,
  ].filter(Boolean).join('\n');
}

export let ws = null;
S.wsTries = 0;
let wsEverOpen = false;
export function connectLive() {
  if (!('WebSocket' in window) || ws || navigator.onLine === false) return;
  try { ws = new WebSocket(EMSC_WS); } catch (_) { ws = null; return; }
  ws.onopen = () => { S.wsTries = 0; wsEverOpen = true; liveOn = true; showFreshness(); if (current()) setEnd(Date.now() / 1000); };
  ws.onmessage = (m) => handleLive(m.data);
  ws.onclose = () => {
    ws = null; liveOn = false; showFreshness();
    // keep retrying a feed that worked before; give up quickly on one that never opened
    if (S.wsTries < (wsEverOpen ? 12 : 3)) setTimeout(connectLive, Math.min(60000, 3000 * 2 ** S.wsTries++));
  };
  ws.onerror = () => {};
}
function handleLive(raw) {
  let msg;
  try { msg = JSON.parse(raw); } catch (_) { return; }
  const f = msg && msg.data, p = f && f.properties;
  if (!p) return;
  const unid = p.unid || f.id;
  if (msg.action === 'delete') {
    if (LIVE.delete(unid)) { emscAt = Date.now(); rebuild(); showFreshness(); }
    return;
  }
  if (p.evtype && !/^(ke|se)$/.test(p.evtype)) return; // known or suspected earthquakes only
  const lat = Number(p.lat), lon = Number(p.lon), t = Date.parse(p.time) / 1000;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(t)) return;
  const r = regionOf(lat, lon);
  if (r < 0 || t < Date.now() / 1000 - 3 * 86400) return;
  const id = 'emsc-' + unid;
  if (!LIVE.has(unid)) { S.flashId = id; setTimeout(() => { if (S.flashId === id) { S.flashId = null; updateLatest(); } }, 12000); }
  const place = String(p.flynn_region || '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  LIVE.set(unid, {
    id, t, m: p.mag == null ? NaN : Number(p.mag), mt: String(p.magtype || '').toUpperCase(), au: p.auth || 'EMSC',
    r, d: p.depth == null ? null : Math.round(Number(p.depth)), lat, lon, place, s: 4, k: 'e:' + unid,
    felt: false, inten: null, live: true, seed: hashId(id),
  });
  emscAt = Date.now();
  setEnd(Math.max(t, emscAt / 1000));
  rebuild(); showFreshness();
}

/* ---------- IPMA's feed, read directly: the official record of the last ~30 days ---------- */
let ipmaBusy = false;
export function loadIpma() {
  if (!S.META || ipmaBusy || navigator.onLine === false) return;
  ipmaBusy = true;
  Promise.all([3, 7].map((area) => fetch(`${IPMA_FEED}${area}.json`, { cache: 'no-cache' })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })))
    .then((areas) => {
      if (areas.some((a) => !a || !Array.isArray(a.data))) throw new Error('Invalid IPMA feed');
      const first = ipmaAt === 0, seen = new Map();
      for (const d of areas.flatMap((a) => (Array.isArray(a.data) ? a.data : []))) {
        const lat = Number(d.lat), lon = Number(d.lon);
        const t = Date.parse(/Z|[+-]\d\d:?\d\d$/.test(d.time) ? d.time : d.time + 'Z') / 1000; // times are UTC
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(t)) continue;
        const r = regionOf(lat, lon);
        if (r < 0) continue;
        const m = Number(d.magnitud), sid = d.sismoId || new Date(t * 1000).toISOString().replace(/\D/g, '').slice(0, 14);
        const hasMag = d.magnitud != null && d.magnitud !== '' && Number.isFinite(m) && m > -9; // -99 = not computed yet
        const mt = String(d.magType || '').trim().toUpperCase();
        const id = 'ipma-' + sid;
        seen.set(sid, {
          id, t, m: hasMag ? m : NaN, mt: mt && !mt.startsWith('M') ? 'M' + mt : mt, au: 'IPMA',
          r, d: d.depth == null ? null : Math.round(Number(d.depth)), lat, lon,
          place: String(d.obsRegion || '').replace(/\s+/g, ' ').trim(), s: 1, k: '',
          felt: !!d.sensed, inten: d.degree || null, live: false, seed: hashId(id),
        });
        if (!first && !IPMA.has(sid) && t > Date.now() / 1000 - 6 * 3600) {
          S.flashId = id; setTimeout(() => { if (S.flashId === id) { S.flashId = null; updateLatest(); } }, 12000);
        }
      }
      IPMA.clear();
      for (const [sid, ev] of seen) IPMA.set(sid, ev);
      ipmaAt = Date.now();
      ipmaFailed = false;
      setEnd(ipmaAt / 1000);
      rebuild(); showFreshness();
    })
    .catch(() => { ipmaFailed = true; showFreshness(); })
    .finally(() => { ipmaBusy = false; });
}

// local testing only: feed fake live-feed messages from the console
if (location.hostname === 'localhost') window.__sismografo = { handleLive: (msg) => handleLive(JSON.stringify(msg)), live: LIVE, ipma: IPMA, events: () => E };

function applyMeta(m, first) {
  S.META = m;
  S.FIRST = S.META.first;
  const gen = Date.parse(S.META.generated) / 1000;
  if (first) { S.END = Math.max(gen, S.FIRST + 1); setupRows(); geometry(); setVTop(0); }
  else setEnd(gen);
  applyCounts(); buildJump();
  // reload any year we hold whose file changed
  let changed = false;
  for (const [y, c] of CHUNKS) if (!S.META.years[y] || S.META.years[y].v !== c.v) { CHUNKS.delete(y); changed = true; }
  if (changed) rebuild();
  showFreshness(); schedule();
}
export function loadMeta(first) {
  return fetch('data/meta.json', { cache: 'no-cache' })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((m) => { if (first || !S.META || m.generated !== S.META.generated) applyMeta(m, first); });
}
