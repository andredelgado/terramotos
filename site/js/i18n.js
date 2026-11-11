// The current language, and formatting of numbers, dates, places and agencies in it.
import { I18N } from './text.js';
import { pref } from './util.js';
import { translatedPlace } from './names.js';
export { agencyName } from './names.js';

export const placeName = (p) => translatedPlace(p, lang);

export let lang = document.documentElement.hasAttribute('data-home') ? document.documentElement.lang : pref('seis.lang');
if (lang !== 'pt' && lang !== 'en') lang = /^pt/i.test(navigator.language || '') ? 'pt' : 'en';
export let L = I18N[lang], MON = L.months, REGION = [L.r0, L.r1, L.r2];
export const fmtNum = (n) => n.toLocaleString(L.loc);
export const fmtDec = (n, d) => n.toLocaleString(L.loc, { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmtDate = (t) => { const d = new Date(t * 1000); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
export const fmtTime = (t) => new Date(t * 1000).toISOString().slice(11, 19);
export function ago(t) {
  const s = Math.max(0, Date.now() / 1000 - t);
  if (s < 90) return L.now;
  if (s < 5400) return L.minAgo(Math.round(s / 60));
  if (s < 172800) return L.hAgo(Math.round(s / 3600));
  return L.dAgo(Math.round(s / 86400));
}
export function setLang(code) { lang = code; L = I18N[lang]; MON = L.months; REGION = [L.r0, L.r1, L.r2]; }
