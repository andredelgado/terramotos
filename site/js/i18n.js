// The current language, and formatting of numbers, dates, places and agencies in it.
import { I18N } from './text.js';
import { pref } from './util.js';

// agency codes used by the ISC, EMSC and USGS for whoever measured the magnitude
const AGENCY = { LIS: 'IPMA', INMG: 'IPMA', IPMA: 'IPMA', IGIL: 'Instituto Dom Luiz', PDA: 'Universidade dos Açores',
  ADH: 'Observatório Afonso Chaves', SVSA: 'SVSA (Azores monitoring)', MDD: 'IGN', IGN: 'IGN',
  SFS: 'Observatorio de San Fernando', TOL: 'Observatorio de Toledo', CNRM: 'CNRST (Morocco)', SPGM: 'SPG (Morocco)',
  RBA: 'Université Mohammed V', EMSC: 'EMSC', CSEM: 'EMSC', ISC: 'ISC', ISCGEM: 'ISC-GEM', ISCGEMSUP: 'ISC-GEM',
  EVBIB: 'ISC Event Bibliography', US: 'USGS', USGS: 'USGS', NEIC: 'USGS', NEIS: 'USGS', USCGS: 'US Coast and Geodetic Survey',
  GCMT: 'Global CMT', HRVD: 'Global CMT', IDC: 'CTBTO', EIDC: 'CTBTO', GFZ: 'GFZ', ZUR_RMT: 'ETH Zürich', LDG: 'CEA (France)',
  ROM: 'INGV', MOS: 'Russian Academy of Sciences', UPP: 'Uppsala University', KEW: 'Kew Observatory', BER: 'Univ. Bergen',
  AUST: 'Geoscience Australia', PAS: 'Caltech', 'P&S': 'Pacheco & Sykes', ISS: 'ISS' };
// some magnitudes carry two codes, like MDD;NEIC
export const agencyName = (a) => [...new Set(a.split(';').map((c) => AGENCY[c.trim().toUpperCase()] || c.trim()))].join(' / ');
// the catalogues name places in English; these are the Portuguese forms
const PLACE_PT = { 'azores islands': 'Açores', 'azores islands, portugal': 'Açores', 'azores islands region': 'Região dos Açores',
  'madeira islands region': 'Região da Madeira', 'madeira islands, portugal region': 'Região da Madeira',
  'canary islands region': 'Região das Canárias', 'canary islands, spain region': 'Região das Canárias',
  'azores-cape st. vincent ridge': 'Crista Açores–Cabo de São Vicente', 'west of gibraltar': 'Oeste de Gibraltar',
  'strait of gibraltar': 'Estreito de Gibraltar', 'north atlantic ocean': 'Atlântico Norte', spain: 'Espanha' };
const COUNTRY_PT = { Portugal: 'Portugal', Spain: 'Espanha', Morocco: 'Marrocos' };
export function placeName(p) {
  if (!p || lang !== 'pt') return p;
  const known = PLACE_PT[p.toLowerCase()];
  if (known) return known;
  const m = /^(\d+) km ([NSEW]+) of (.+), (Portugal|Spain|Morocco)$/.exec(p); // "53 km S of Olhão, Portugal"
  return m ? `${m[1]} km a ${m[2].replace(/W/g, 'O')} de ${m[3]}, ${COUNTRY_PT[m[4]]}` : p;
}

export let lang = pref('seis.lang');
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
