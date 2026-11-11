// Build the icons that cannot be SVG: site/apple-touch-icon.png (home-screen shortcuts) and
// site/favicon.ico (browsers and tools that ask for /favicon.ico). Both are the favicon's wave,
// white on black. Usage: node tools/build_icons.mjs   (only when the icon changes)
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'site');
const WAVE = 'M2 16h6l2-4 2 9 2.5-15 2.5 21 2.5-16 2 8 2-4h6.5'; // the path in favicon.svg
const browser = await chromium.launch();
async function png(size, padding) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<body style="margin:0;background:#000"><svg width="${size}" height="${size}" viewBox="${-padding} ${-padding} ${32 + 2 * padding} ${32 + 2 * padding}">` +
    `<path d="${WAVE}" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`);
  const bytes = await page.screenshot({ type: 'png' });
  await page.close();
  return bytes;
}
fs.writeFileSync(path.join(SITE, 'apple-touch-icon.png'), await png(180, 5));
// an .ico file may simply wrap one PNG: a 6-byte header, one 16-byte entry, then the image
const small = await png(48, 3), header = Buffer.alloc(22);
header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
header[6] = 48; header[7] = 48; header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12);
header.writeUInt32LE(small.length, 14); header.writeUInt32LE(22, 18);
fs.writeFileSync(path.join(SITE, 'favicon.ico'), Buffer.concat([header, small]));
await browser.close();
console.log('site/apple-touch-icon.png, site/favicon.ico');
