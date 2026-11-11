// The timeline down the side.
import { railBox, rctx } from './dom.js';
import { base, centerTime, dpr, scrollToTime, setVTop, startAbs } from './drum.js';
import { moveMapTo } from './map/period.js';
import { S } from './state.js';
import { firstYear, yearCounts, yearMax } from './store.js';
import { C } from './theme.js';
import { yearOf } from './util.js';
import { view } from './views.js';

export function drawRail(tA, tB) {
  const rw = railBox.clientWidth, rh = railBox.clientHeight;
  if (!rw || !rh) return;
  rctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  rctx.fillStyle = C.paper; rctx.fillRect(0, 0, rw, rh);
  const t0 = startAbs(base), spanT = S.END - t0;
  const tY = (t) => ((S.END - t) / spanT) * rh;
  const y1 = yearOf(S.END);
  const labelW = rw < 50 ? 18 : 24;
  const barMax = rw - labelW - 2;

  rctx.fillStyle = C.trace;
  for (let k = 0; k < yearCounts.length; k++) {
    const c = yearCounts[k]; if (!c) continue;
    const y = firstYear + k;
    const ya = tY(Math.min(S.END, Date.UTC(y + 1, 0, 1) / 1000)), yb = tY(Math.max(t0, Date.UTC(y, 0, 1) / 1000));
    const w = Math.max(1.5, (Math.log1p(c) / Math.log1p(yearMax)) * barMax);
    rctx.fillRect(rw - w, ya, w, Math.max(1, yb - ya - 0.5));
  }

  // decade ticks
  const pxPerDecade = (10 * 365.25 * 86400 / spanT) * rh;
  const step = pxPerDecade < 18 ? 20 : 10;
  rctx.font = `${rw < 50 ? 9 : 10}px ${C.font}`; rctx.textAlign = 'left'; rctx.textBaseline = 'bottom';
  rctx.fillStyle = C.muted; rctx.strokeStyle = C.grid; rctx.lineWidth = 1;
  for (let d = Math.ceil(firstYear / step) * step; d <= y1; d += step) {
    const y = Math.round(tY(Date.UTC(d, 0, 1) / 1000)) + 0.5;
    rctx.beginPath(); rctx.moveTo(0, y); rctx.lineTo(rw, y); rctx.stroke();
    rctx.fillText(rw < 50 ? `'${String(d).slice(2)}` : String(d), 1, y - 1);
  }

  // where the drum is looking
  const a = tY(tB), b = tY(tA);
  const h = Math.max(3, b - a);
  rctx.fillStyle = C.ink; rctx.globalAlpha = 0.1; rctx.fillRect(0, a, rw, h);
  rctx.globalAlpha = 1; rctx.strokeStyle = C.ink; rctx.lineWidth = 1;
  rctx.strokeRect(0.5, Math.round(a) + 0.5, rw - 1, Math.round(h));
  railBox.setAttribute('aria-valuemin', String(firstYear));
  railBox.setAttribute('aria-valuemax', String(y1));
  railBox.setAttribute('aria-valuenow', String(yearOf(tB)));
}

/* ---------- rail ---------- */
let railDrag = false;
function railJump(ev) {
  const r = railBox.getBoundingClientRect();
  const f = Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height));
  S.mapContextDirty = true;
  const t = S.END - f * (S.END - startAbs(base));
  if (view === 'map') moveMapTo(t); else scrollToTime(t, 'center');
}
railBox.addEventListener('pointerdown', (ev) => { railDrag = true; railBox.setPointerCapture(ev.pointerId); railJump(ev); });
railBox.addEventListener('pointermove', (ev) => { if (railDrag) railJump(ev); });
railBox.addEventListener('pointerup', () => { railDrag = false; });
railBox.addEventListener('pointercancel', () => { railDrag = false; });
railBox.addEventListener('keydown', (ev) => {
  const yr = 365.25 * 86400, c = centerTime();
  const d = { ArrowUp: yr, ArrowDown: -yr, PageUp: 10 * yr, PageDown: -10 * yr }[ev.key];
  if (d) { ev.preventDefault(); S.mapContextDirty = true; if (view === 'map') moveMapTo(Math.min(S.END, c + d)); else scrollToTime(Math.min(S.END, c + d), 'center'); }
  if (ev.key === 'Home') { ev.preventDefault(); setVTop(0); }
  if (ev.key === 'End') { ev.preventDefault(); setVTop(Infinity); }
});
