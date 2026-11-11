// The seismograph view: lines of time, the waves, scrolling and hit-testing.
import { hideTip, placeTip, showTip } from './card.js';
import { LHEAD, LROW, MAP_PERIODS, MAXH, ORIGIN, PADB, PADT, SPANS } from './config.js';
import { span } from './controls.js';
import { $, ctx, cv, drum, listBox, railBox, railCv, spacer } from './dom.js';
import { fmtDate, fmtDec, fmtNum, L, MON } from './i18n.js';
import { listRowTime, placeListTime, renderList } from './list.js';
import { renderMap } from './map/panels.js';
import { chooseMapPeriod, mapPeriod, moveMapTo } from './map/period.js';
import { drawRail } from './rail.js';
import { pin, stepQuake, unpin } from './selection.js';
import { S } from './state.js';
import { renderStats } from './stats.js';
import { CHUNKS, cum, E, ensureYear, FAILED, firstYear, MAG, mask, N, T, yearCounts } from './store.js';
import { C } from './theme.js';
import { writeHash } from './url.js';
import { lowerBound, rng, yearOf } from './util.js';
import { view } from './views.js';

// geometry
export let dpr = 1, W = 0, viewH = 0, ROWH = 20, G = 64, base = 0, nRows = 1, maxScroll = 0, maxTop = 0;
let raf = 0;
S.navigationTime = null;

/* ---------- rows ---------- */
function rowAbs(ts) {
  const s = SPANS[span];
  if (s.u) return Math.floor((ts - ORIGIN) / s.u);
  const d = new Date(ts * 1000);
  return span === '1mo' ? (d.getUTCFullYear() - 1900) * 12 + d.getUTCMonth() : d.getUTCFullYear() - 1900;
}
export function startAbs(i) {
  const s = SPANS[span];
  if (s.u) return ORIGIN + i * s.u;
  if (span === '1mo') return Date.UTC(1900 + Math.floor(i / 12), i % 12, 1) / 1000;
  return Date.UTC(1900 + i, 0, 1) / 1000;
}
export const lastRow = () => base + nRows - 1;
export function setupRows() { base = rowAbs(S.FIRST); nRows = rowAbs(S.END) - base + 1; }

function label(i) {
  const t = startAbs(i), d = new Date(t * 1000);
  const Y = d.getUTCFullYear(), Mo = d.getUTCMonth(), Dd = d.getUTCDate(), h = d.getUTCHours();
  switch (span) {
    case '3h': return h === 0 ? [`${Dd}/${Mo + 1}`, 1] : [String(h).padStart(2, '0') + 'h', 0];
    case '1d': return Dd === 1 ? [`${MON[Mo]} '${String(Y).slice(2)}`, 1] : [`${Dd}/${Mo + 1}`, 0];
    case '1w': {
      const e = new Date((t + 604799) * 1000).getUTCFullYear();
      return e !== Y || (Mo === 0 && Dd === 1) ? [String(e), 1] : [`${Dd}/${Mo + 1}`, 0];
    }
    case '1mo': return Mo === 0 ? [String(Y), 1] : [MON[Mo], 0];
    default: return [String(Y), Y % 10 === 0 ? 1 : 0];
  }
}
const amp = (m) => {
  const s = SPANS[span];
  if (Number.isNaN(m)) return Math.max(1, 3 - s.shift);
  return Math.min(ROWH * 6, Math.max(0.8, ROWH * 0.11 * Math.pow(10, 0.3 * (m - 1 - s.shift))));
};
const len = (m) => Math.max(3, (10 + 9 * (Number.isNaN(m) ? 1.5 : Math.max(0, m))) * SPANS[span].stretch);
function fmtRange(a, b) {
  const da = new Date(a * 1000), db = new Date(b * 1000);
  if (span === '1y') return da.getUTCFullYear() === db.getUTCFullYear() ? `${db.getUTCFullYear()}` : `${da.getUTCFullYear()} – ${db.getUTCFullYear()}`;
  if (span === '1mo') return `${MON[da.getUTCMonth()]} ${da.getUTCFullYear()} – ${MON[db.getUTCMonth()]} ${db.getUTCFullYear()}`;
  return `${fmtDate(a)} – ${fmtDate(b)}`;
}

function wave(p, e, x, y, A, L) {
  const r = rng(Math.imul(E[e].seed, 747796405));
  const sP = 0.24 * L, step = L < 12 ? 1 : 1.5;
  p.moveTo(x, y);
  let k = 0;
  for (let dx = step; dx <= L; dx += step, k++) {
    const env = dx < sP ? 0.08 + 0.2 * (dx / sP) : Math.exp(-(dx - sP) / (0.28 * L));
    p.lineTo(x + dx, y + (k & 1 ? 1 : -1) * A * env * (0.3 + 0.7 * r()));
  }
  p.lineTo(x + L + step, y);
}

/* ---------- geometry & scrolling ---------- */
export function geometry() {
  const narrow = window.innerWidth < 640;
  ROWH = narrow ? 18 : 20;
  G = narrow ? 44 : 64;
  dpr = window.devicePixelRatio || 1;
  if (view !== 'drum') {
    railCv.width = Math.round(railBox.clientWidth * dpr);
    railCv.height = Math.round(railBox.clientHeight * dpr);
    return;
  }
  viewH = drum.clientHeight;
  W = drum.clientWidth;
  const total = PADT + nRows * ROWH + PADB;
  const Hs = Math.max(viewH, Math.min(total, MAXH));
  spacer.style.height = (Hs - viewH) + 'px';
  maxScroll = Hs - viewH;
  maxTop = Math.max(0, total - viewH);
  cv.style.width = W + 'px';
  cv.style.height = viewH + 'px';
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(viewH * dpr);
  const rw = railBox.clientWidth, rh = railBox.clientHeight;
  railCv.width = Math.round(rw * dpr);
  railCv.height = Math.round(rh * dpr);
}
export const vTop = () => (maxScroll > 0 ? (drum.scrollTop / maxScroll) * maxTop : 0);
export const setVTop = (v) => {
  if (v <= 0 || !Number.isFinite(v)) S.navigationTime = null;
  if (view === 'stats') return;
  if (view === 'map') {
    if (v <= 0) chooseMapPeriod(MAP_PERIODS[mapPeriod] ? mapPeriod : '24h');
    else moveMapTo(S.FIRST);
    return;
  }
  if (view === 'list') { renderList(); listBox.scrollTop = v <= 0 ? 0 : listBox.scrollHeight; schedule(); writeHash(); return; }
  drum.scrollTop = maxTop > 0 ? (Math.max(0, Math.min(maxTop, v)) / maxTop) * maxScroll : 0;
};
const yOf = (j, vt) => PADT + j * ROWH + ROWH / 2 - vt;

export function centerTime() {
  if (view === 'stats') return S.END;
  if (view === 'map') return (S.mapFrom + S.mapTo) / 2;
  if (S.navigationTime != null) return S.navigationTime;
  if (view === 'list') return listRowTime(Math.floor((listBox.scrollTop + Math.max(0, listBox.clientHeight - LHEAD) / 3) / LROW));
  const vt = vTop();
  const j = Math.max(0, Math.min(nRows - 1, Math.floor((vt + viewH / 2 - PADT) / ROWH)));
  const i = lastRow() - j;
  return (startAbs(i) + Math.min(S.END, startAbs(i + 1))) / 2;
}
export function scrollToTime(t, align) {
  if (view === 'stats') return;
  S.navigationTime = t;
  if (view === 'map') { if (t < S.mapFrom || t > S.mapTo) moveMapTo(t); return; }
  if (view === 'list') {
    t = Math.max(S.FIRST, Math.min(S.END, t));
    const request = ++S.listJump;
    placeListTime(t, align);
    const y = yearOf(t);
    if (S.META && S.META.years[y] && !CHUNKS.has(y) && yearCounts[y - firstYear]) {
      ensureYear(y).then(() => {
        if (view === 'list' && request === S.listJump && CHUNKS.has(y)) placeListTime(t, align);
      });
    }
    return;
  }
  const i = Math.max(base, Math.min(lastRow(), rowAbs(t)));
  const j = lastRow() - i;
  setVTop(align === 'top' ? PADT + j * ROWH - ROWH : PADT + j * ROWH + ROWH / 2 - viewH / 2);
}
export function schedule() { if (!raf) raf = requestAnimationFrame(draw); }

/** Move the end of the record (the pen) forward, keeping the view where it was. */
export function setEnd(t) {
  if (t <= S.END) return;
  if (view !== 'drum') { S.END = t; setupRows(); S.listDirty = true; schedule(); return; }
  const before = nRows, atTop = drum.scrollTop === 0, vt = vTop();
  S.END = t; setupRows();
  if (nRows !== before) {
    geometry();
    if (!atTop) setVTop(vt + (nRows - before) * ROWH);
  }
  schedule();
}

/* ---------- drawing ---------- */
export function posOf(e, vt) {
  const i = rowAbs(T[e]), j = lastRow() - i, s = startAbs(i), en = startAbs(i + 1);
  const pw = Math.max(10, W - G - 6);
  return { x: G + pw * (T[e] - s) / (en - s), y: yOf(j, vt) };
}

function draw() {
  raf = 0;
  if (view === 'map') { renderMap(); return; }
  if (view === 'list') { renderList(); return; }
  if (view === 'stats') { renderStats(); return; }
  if (!W || !viewH) return;
  const vt = vTop();
  const x0 = G, pw = Math.max(10, W - G - 6), last = lastRow();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, W, viewH);

  // grid: six equal divisions of the line
  ctx.beginPath();
  for (let k = 0; k <= 6; k++) { const x = Math.round(x0 + pw * k / 6) + 0.5; ctx.moveTo(x, 0); ctx.lineTo(x, viewH); }
  ctx.strokeStyle = C.grid; ctx.lineWidth = 1; ctx.stroke();

  const jTop = Math.max(0, Math.floor((vt - PADT) / ROWH) - 1);
  const jBot = Math.min(nRows - 1, Math.ceil((vt + viewH - PADT) / ROWH));

  // labels
  ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
  const fs = G < 60 ? 10 : 11;
  for (let j = jTop; j <= jBot; j++) {
    const [txt, bold] = label(last - j);
    ctx.font = `${bold ? 600 : 400} ${fs}px ${C.font}`;
    ctx.fillStyle = bold ? C.ink : C.muted;
    ctx.fillText(txt, x0 - 8, yOf(j, vt));
  }

  ctx.save();
  ctx.beginPath(); ctx.rect(x0, -400, pw, viewH + 800); ctx.clip();

  // background traces (deterministic noise per line)
  ctx.beginPath();
  let pen = null;
  for (let j = jTop; j <= jBot; j++) {
    const i = last - j, y = yOf(j, vt);
    let xe = x0 + pw;
    if (i === last) {
      const s = startAbs(i), e = startAbs(i + 1);
      xe = x0 + pw * Math.min(1, (S.END - s) / (e - s));
      pen = [xe, y];
    }
    const r = rng(Math.imul(i, 2654435761) ^ 0x9e3779b9);
    let v = 0;
    ctx.moveTo(x0, y);
    for (let x = x0 + 1; x <= xe; x += 1) { v = 0.55 * v + 0.45 * (r() - 0.5); ctx.lineTo(x, y + v * 3); }
  }
  ctx.strokeStyle = C.trace; ctx.lineWidth = 0.75; ctx.stroke();

  // earthquakes, including a few lines above and below so tall waves spill in
  let inView = 0;
  const jA = Math.max(0, jTop - 7), jB = Math.min(nRows - 1, jBot + 7);
  const strong = new Path2D(), faint = new Path2D();
  // A year per line holds thousands of earthquakes. Those below M 3 are counted into a low grey
  // profile instead of being drawn one by one, and M 5+ carry their magnitude.
  const yearView = span === '1y', profile = new Path2D(), big = [];
  for (let j = jA; j <= jB; j++) {
    const i = last - j, s = startAbs(i), en = startAbs(i + 1), y = yOf(j, vt);
    const lo = lowerBound(T, s), hi = lowerBound(T, en);
    if (j >= jTop && j <= jBot) inView += cum[hi] - cum[lo];
    const bins = yearView ? new Uint16Array((pw >> 1) + 2) : null;
    for (let e = lo; e < hi; e++) {
      if (!mask[e]) continue;
      const m = MAG[e], x = x0 + pw * (T[e] - s) / (en - s);
      if (yearView && !(m >= 3)) { bins[(x - x0) >> 1]++; continue; }
      wave(Number.isNaN(m) ? faint : strong, e, x, y, amp(m), len(m));
      if (yearView && m >= 5) big.push([m, x, y]);
    }
    if (bins) for (let b = 0; b < bins.length; b++) {
      if (!bins[b]) continue;
      const rise = Math.min(ROWH * 0.42, 1 + 1.5 * Math.log2(1 + bins[b]));
      profile.rect(x0 + b * 2, y - rise, 1.5, rise);
    }
  }
  if (yearView) { ctx.fillStyle = C.muted; ctx.globalAlpha = 0.7; ctx.fill(profile); }
  ctx.lineWidth = 1; ctx.strokeStyle = C.ink;
  ctx.globalAlpha = 0.4; ctx.stroke(faint);
  ctx.globalAlpha = 1; ctx.stroke(strong);

  const focus = S.pinned >= 0 ? S.pinned : S.hover;
  if (focus >= 0 && focus < N && mask[focus]) {
    const { x, y } = posOf(focus, vt);
    const p = new Path2D();
    wave(p, focus, x, y, amp(MAG[focus]), len(MAG[focus]));
    ctx.lineWidth = 2; ctx.strokeStyle = C.accent; ctx.stroke(p);
    ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fillStyle = C.accent; ctx.fill();
  }
  if (big.length) { // the largest first; a label that would cover another is left out
    big.sort((a, b) => b[0] - a[0]);
    ctx.font = `600 10px ${C.font}`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = C.paper; ctx.fillStyle = C.ink;
    const placed = [];
    for (const [m, x, y] of big) {
      const text = fmtDec(m, 1), tw = ctx.measureText(text).width;
      const lx = Math.min(x + 2, x0 + pw - tw - 2), ly = y - Math.min(amp(m) * 0.8, ROWH * 1.3) - 2;
      const box = [lx - 2, ly - 11, lx + tw + 2, ly + 1];
      if (ly < 10 || ly > viewH + 10 || placed.some((q) => box[0] < q[2] && box[2] > q[0] && box[1] < q[3] && box[3] > q[1])) continue;
      placed.push(box);
      ctx.strokeText(text, lx, ly); ctx.fillText(text, lx, ly);
    }
  }
  ctx.restore();

  if (pen) {
    ctx.beginPath(); ctx.arc(pen[0], pen[1], 3.5, 0, Math.PI * 2);
    ctx.fillStyle = C.accent; ctx.fill();
  }

  // which years are on screen (plus a little either side); fetch any we don't have yet
  const tA = startAbs(last - jBot), tB = Math.min(S.END, startAbs(last - jTop + 1)) - 1;
  const waiting = [];
  if (S.META) {
    for (let y = yearOf(startAbs(last - jB)); y <= yearOf(Math.min(S.END, startAbs(last - jA + 1)) - 1); y++) {
      if (S.META.years[y] && !CHUNKS.has(y)) { waiting.push(y); ensureYear(y); }
    }
    $('#range').innerHTML = `<b>${fmtRange(tA, tB)}</b>`;
    const failed = waiting.filter((y) => FAILED.has(y));
    $('#inview').textContent = failed.length ? L.failedY(failed[0])
      : waiting.length ? L.loadingY(waiting[0]) + (waiting.length > 1 ? '…' : '') : L.inView(fmtNum(inView));
  }
  drawRail(tA, tB);
  placeTip(vt);
}

/** The earthquake under a point; slop widens the target (for fingers) and the nearest one wins. */
function hit(mx, my, slop = 0) {
  const vt = vTop(), pw = Math.max(10, W - G - 6);
  const jA = Math.max(0, Math.floor((my - slop + vt - PADT) / ROWH));
  const jB = Math.min(nRows - 1, Math.floor((my + slop + vt - PADT) / ROWH));
  let best = -1, bd = Infinity, bm = -99;
  for (let j = jA; j <= jB; j++) {
    const i = lastRow() - j, s = startAbs(i), en = startAbs(i + 1);
    const dy = Math.max(0, Math.abs(yOf(j, vt) - my) - ROWH / 2);
    for (let e = lowerBound(T, s), hi = lowerBound(T, en); e < hi; e++) {
      if (!mask[e] || (span === '1y' && !(MAG[e] >= 3))) continue; // the Year view's grey profile is not selectable
      const x = G + pw * (T[e] - s) / (en - s);
      const d = dy + Math.max(0, x - 4 - mx, mx - x - len(MAG[e]));
      if (d > slop) continue;
      const m = Number.isNaN(MAG[e]) ? -1 : MAG[e];
      if (d < bd || (d === bd && m > bm)) { bd = d; bm = m; best = e; }
    }
  }
  return best;
}
drum.addEventListener('keydown', (ev) => {
  if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
  ev.preventDefault();
  stepQuake(ev.key === 'ArrowRight' ? 1 : -1);
});

cv.addEventListener('mousemove', (ev) => {
  const r = cv.getBoundingClientRect();
  const mx = ev.clientX - r.left, my = ev.clientY - r.top;
  const e = hit(mx, my);
  if (e !== S.hover) { S.hover = e; schedule(); }
  if (S.pinned >= 0) return;
  if (e >= 0) { showTip(e, false, [mx, my]); placeTip(vTop()); } else hideTip();
});
cv.addEventListener('mouseleave', () => { S.hover = -1; if (S.pinned < 0) hideTip(); schedule(); });
cv.addEventListener('click', (ev) => {
  const r = cv.getBoundingClientRect();
  const finger = ev.pointerType ? ev.pointerType !== 'mouse' : matchMedia('(pointer: coarse)').matches;
  const e = hit(ev.clientX - r.left, ev.clientY - r.top, finger ? 12 : 0);
  if (e >= 0) pin(e); else unpin();
});
