// The same small locator map is used by the app and the server-rendered earthquake pages.
import { LAND } from './content/land.js';
import { esc } from './util.js';

export function locatorSVG(ev, label) {
  const shapes = LAND.filter(([r]) => r === ev.r).map(([, pts]) => pts);
  let x0 = ev.lon, x1 = ev.lon, y0 = ev.lat, y1 = ev.lat;
  for (const pts of shapes) {
    if (pts[0][1] < 31) continue; // frame the region's land, apart from the remote Selvagens
    for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  x0 -= 0.3; x1 += 0.3; y0 -= 0.3; y1 += 0.3;
  const mw = 240, mh = 132, pad = 8, c = Math.cos(((y0 + y1) / 2) * Math.PI / 180);
  const k = Math.min((mw - 2 * pad) / ((x1 - x0) * c), (mh - 2 * pad) / (y1 - y0));
  const ox = (mw - (x1 - x0) * c * k) / 2, oy = (mh - (y1 - y0) * k) / 2;
  const X = (lon) => ox + (lon - x0) * c * k, Y = (lat) => oy + (y1 - lat) * k;
  const f = (n) => n.toFixed(1);
  let land = '';
  for (const pts of shapes) {
    const xs = pts.map(([lo]) => X(lo)), ys = pts.map(([, la]) => Y(la));
    if (Math.max(...xs) - Math.min(...xs) < 2.5 && Math.max(...ys) - Math.min(...ys) < 2.5) land += `<circle cx="${f(xs[0])}" cy="${f(ys[0])}" r="1.2"/>`;
    else land += `<path d="M${xs.map((x, i) => `${f(x)} ${f(ys[i])}`).join('L')}Z"/>`;
  }
  const px = f(Math.max(5, Math.min(mw - 5, X(ev.lon)))), py = f(Math.max(5, Math.min(mh - 5, Y(ev.lat))));
  return `<svg class="map" viewBox="0 0 ${mw} ${mh}" role="img" aria-label="${esc(label)}"><g class="land">${land}</g>` +
    `<circle class="ring" cx="${px}" cy="${py}" r="8"/><circle class="dot" cx="${px}" cy="${py}" r="3"/></svg>`;
}
