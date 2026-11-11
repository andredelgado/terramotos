// Colours read from the stylesheet for the canvases, and the light/dark switch.
import { $ } from './dom.js';
import { schedule } from './drum.js';
import { pref } from './util.js';

export let C = {};

/* ---------- colours ---------- */
export function readColors() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  C = { paper: v('--bg'), ink: v('--fg'), trace: v('--trace'), grid: v('--grid'),
        muted: v('--muted'), accent: v('--accent'), font: v('--font'), ramp: [1, 2, 3, 4, 5].map((i) => v('--s' + i)) };
  const tc = document.querySelector('meta[name="theme-color"]');
  if (tc) tc.content = C.paper;
}
const recolor = () => { readColors(); schedule(); };
$('#theme').addEventListener('click', () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  pref('seis.theme', root.dataset.theme);
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', recolor);
new MutationObserver(recolor).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
