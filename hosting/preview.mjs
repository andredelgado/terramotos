// The preview image of one earthquake, shown when its page is shared: a 1200 × 630 PNG with the
// magnitude, place, date and a locator map. The Worker has no image library, so the picture is
// drawn here pixel by pixel, in at most 256 colours, and packed as a PNG by hand.
import { LAND } from '../site/js/content/land.js';
import { translatedPlace } from '../site/js/names.js';
import { I18N } from '../site/js/text.js';
import { FONTS } from './font.mjs';

export const WIDTH = 1200, HEIGHT = 630;
const STRIDE = WIDTH + 1; // every row of a PNG starts with one byte saying how it is filtered
const BLACK = 0x000000, WHITE = 0xffffff, GREY = 0x999999, LAND_GREY = 0x4d4d4d, RED = 0xff453a;
const MARGIN = 72, MAP = { x0: 660, y0: 72, x1: 1128, y1: 558 };

const FACES = Object.fromEntries(Object.entries(FONTS).map(([name, face]) => {
  const binary = atob(face.data), bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return [name, { glyphs: face.glyphs, bytes }];
}));
const FORMATS = Object.fromEntries(['pt', 'en'].map((lang) => [lang, {
  magnitude: new Intl.NumberFormat(I18N[lang].loc, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
  date: new Intl.DateTimeFormat(I18N[lang].loc, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }),
}]));

/** A black picture to draw on. Colours are 0xRRGGBB; opacity runs from 0 to 15. */
function picture() {
  const pixels = new Uint8Array(STRIDE * HEIGHT), colours = [BLACK], slots = new Map([[BLACK, 0]]), ramps = new Map();
  const slot = (rgb) => {
    let i = slots.get(rgb);
    if (i === undefined) {
      if (colours.length === 256) return 0; // cannot happen with the few colours used here
      i = colours.length; colours.push(rgb); slots.set(rgb, i);
    }
    return i;
  };
  // the 16 steps from the colour underneath to the colour being drawn, worked out once per pair
  let lastKey = -1, lastSteps = null; // nearly every pixel drawn is over the same colour as the one before
  const ramp = (rgb, under) => {
    const key = rgb * 256 + under;
    if (key === lastKey) return lastSteps;
    let steps = ramps.get(key);
    if (!steps) {
      const below = colours[under];
      steps = new Uint8Array(16);
      for (let a = 0; a < 16; a++) {
        const mix = (shift) => Math.round(((below >> shift) & 255) * (15 - a) / 15 + ((rgb >> shift) & 255) * a / 15);
        steps[a] = slot(mix(16) << 16 | mix(8) << 8 | mix(0));
      }
      ramps.set(key, steps);
    }
    lastKey = key; lastSteps = steps;
    return steps;
  };
  const blend = (x, y, rgb, opacity) => {
    if (opacity <= 0 || x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return;
    const at = y * STRIDE + 1 + x;
    pixels[at] = ramp(rgb, pixels[at])[Math.min(15, opacity)];
  };
  return {
    pixels, colours,
    /** Fill a closed outline of [x, y] points, kept inside a box. */
    polygon(points, rgb, box) {
      const colour = slot(rgb);
      let top = Infinity, bottom = -Infinity;
      for (const [, y] of points) { top = Math.min(top, y); bottom = Math.max(bottom, y); }
      for (let y = Math.max(box.y0, Math.ceil(top - 0.5)); y <= Math.min(box.y1 - 1, Math.floor(bottom - 0.5)); y++) {
        const crossings = [], line = y + 0.5;
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
          const [ax, ay] = points[i], [bx, by] = points[j];
          if ((ay > line) !== (by > line)) crossings.push(ax + (line - ay) * (bx - ax) / (by - ay));
        }
        crossings.sort((a, b) => a - b);
        for (let i = 0; i + 1 < crossings.length; i += 2) {
          const from = Math.max(box.x0, Math.ceil(crossings[i] - 0.5)), to = Math.min(box.x1 - 1, Math.floor(crossings[i + 1] - 0.5));
          if (to >= from) pixels.fill(colour, y * STRIDE + 1 + from, y * STRIDE + 2 + to);
        }
      }
    },
    /** A filled circle with a smooth edge. */
    circle(cx, cy, radius, rgb, opacity = 15) {
      for (let y = Math.floor(cy - radius - 1); y <= Math.ceil(cy + radius + 1); y++) {
        for (let x = Math.floor(cx - radius - 1); x <= Math.ceil(cx + radius + 1); x++) {
          const inside = Math.max(0, Math.min(1, radius + 0.5 - Math.hypot(x + 0.5 - cx, y + 0.5 - cy)));
          blend(x, y, rgb, Math.round(inside * opacity));
        }
      }
    },
    /** Write text with its left end at x and its baseline at y. */
    text(face, string, x, y, rgb) {
      const { glyphs, bytes } = FACES[face];
      let pen = x;
      for (const ch of string) {
        const glyph = glyphs[ch];
        if (!glyph) continue;
        const [advance, left, top, width, height, start] = glyph, gx = Math.round(pen) + left, gy = y + top;
        for (let row = 0; row < height; row++) {
          for (let col = 0; col < width; col++) {
            const i = start + row * width + col, opacity = (bytes[i >> 1] >> (i & 1 ? 0 : 4)) & 15;
            if (opacity) blend(gx + col, gy + row, rgb, opacity);
          }
        }
        pen += advance;
      }
    },
  };
}
const widthOf = (face, string) => [...string].reduce((sum, ch) => sum + (FACES[face].glyphs[ch]?.[0] || 0), 0);
/** Break text into at most two lines that fit a width, ending with … when some of it is left out. */
function wrap(face, string, width) {
  const lines = [];
  let line = '';
  for (const word of string.split(' ')) {
    const longer = line ? line + ' ' + word : word;
    if (!line || widthOf(face, longer) <= width) { line = longer; continue; }
    lines.push(line); line = word;
  }
  lines.push(line);
  if (lines.length <= 2 && lines.every((l) => widthOf(face, l) <= width)) return lines;
  let last = lines.slice(1).join(' ');
  const first = lines[0];
  while (last && widthOf(face, last + '…') > width) last = last.slice(0, -1).trimEnd();
  return widthOf(face, first) <= width ? [first, last + '…'] : [last + '…'];
}

/** The region's land and the earthquake, placed inside the map box the same way as the small locator map. */
function drawMap(pic, ev) {
  const shapes = LAND.filter(([r]) => r === ev.r).map(([, pts]) => pts);
  let x0 = ev.lon, x1 = ev.lon, y0 = ev.lat, y1 = ev.lat;
  for (const pts of shapes) {
    if (pts[0][1] < 31) continue; // frame the region's land, apart from the remote Selvagens
    for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  x0 -= 0.3; x1 += 0.3; y0 -= 0.3; y1 += 0.3;
  const w = MAP.x1 - MAP.x0, h = MAP.y1 - MAP.y0, c = Math.cos(((y0 + y1) / 2) * Math.PI / 180);
  const k = Math.min(w / ((x1 - x0) * c), h / (y1 - y0)); // pixels per degree of latitude
  const ox = MAP.x0 + (w - (x1 - x0) * c * k) / 2, oy = MAP.y0 + (h - (y1 - y0) * k) / 2;
  const X = (lon) => ox + (lon - x0) * c * k, Y = (lat) => oy + (y1 - lat) * k;
  for (const pts of shapes) {
    const outline = pts.map(([lon, lat]) => [X(lon), Y(lat)]);
    const xs = outline.map(([x]) => x), ys = outline.map(([, y]) => y);
    // an islet of a few pixels is drawn as a dot so that it stays visible
    if (Math.max(...xs) - Math.min(...xs) < 7 && Math.max(...ys) - Math.min(...ys) < 7) {
      if (xs[0] > MAP.x0 && xs[0] < MAP.x1 && ys[0] > MAP.y0 && ys[0] < MAP.y1) pic.circle(xs[0], ys[0], 3.5, LAND_GREY);
    } else pic.polygon(outline, LAND_GREY, MAP);
  }
  const px = Math.max(MAP.x0 + 14, Math.min(MAP.x1 - 14, X(ev.lon))), py = Math.max(MAP.y0 + 14, Math.min(MAP.y1 - 14, Y(ev.lat)));
  pic.circle(px, py, 34, RED, 4);
  pic.circle(px, py, 12, RED);
}

const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function chunk(type, data) {
  const out = new Uint8Array(12 + data.length), view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  let crc = 0xffffffff;
  for (let i = 4; i < 8 + data.length; i++) crc = CRC[(crc ^ out[i]) & 255] ^ (crc >>> 8);
  view.setUint32(8 + data.length, (crc ^ 0xffffffff) >>> 0);
  return out;
}
async function png({ pixels, colours }) {
  const header = new Uint8Array(13), view = new DataView(header.buffer);
  view.setUint32(0, WIDTH); view.setUint32(4, HEIGHT);
  header[8] = 8; header[9] = 3; // eight bits per pixel, each one a colour from the palette
  const palette = new Uint8Array(colours.length * 3);
  colours.forEach((rgb, i) => { palette[i * 3] = rgb >> 16; palette[i * 3 + 1] = (rgb >> 8) & 255; palette[i * 3 + 2] = rgb & 255; });
  const packed = new Uint8Array(await new Response(new Blob([pixels]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  return new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('PLTE', palette),
    chunk('IDAT', packed), chunk('IEND', new Uint8Array(0))]).arrayBuffer();
}

/** The preview image of an earthquake, as the bytes of a PNG. */
export async function previewPNG(ev, lang) {
  const L = I18N[lang], pic = picture(), column = MAP.x0 - 40 - MARGIN;
  drawMap(pic, ev);
  pic.text('small', 'Terramotos Portugal', MARGIN, 102, GREY);
  if (ev.m == null) pic.text('text', L.noMag, MARGIN, 326, WHITE);
  else pic.text('big', 'M ' + FORMATS[lang].magnitude.format(ev.m), MARGIN - 7, 326, WHITE);
  // the country is left out: every earthquake here is in or near Portugal, and the line is short
  const place = wrap('text', (translatedPlace(ev.place, lang) || [L.r0, L.r1, L.r2][ev.r]).replace(/, Portugal$/, ''), column);
  place.forEach((line, i) => pic.text('text', line, MARGIN, 426 + i * 58, WHITE));
  const when = `${FORMATS[lang].date.format(ev.t * 1000)} · ${new Date(ev.t * 1000).toISOString().slice(11, 16)} UTC`;
  pic.text('small', when, MARGIN, 558, GREY);
  return png(pic);
}
