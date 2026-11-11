// Place translations and catalogue agency names, shared by the app and the page server.
const AGENCY = { LIS: 'IPMA', INMG: 'IPMA', IPMA: 'IPMA', IGIL: 'Instituto Dom Luiz', PDA: 'Universidade dos Açores',
  ADH: 'Observatório Afonso Chaves', SVSA: 'SVSA (Azores monitoring)', MDD: 'IGN', IGN: 'IGN',
  SFS: 'Observatorio de San Fernando', TOL: 'Observatorio de Toledo', CNRM: 'CNRST (Morocco)', SPGM: 'SPG (Morocco)',
  RBA: 'Université Mohammed V', EMSC: 'EMSC', CSEM: 'EMSC', ISC: 'ISC', ISCGEM: 'ISC-GEM', ISCGEMSUP: 'ISC-GEM',
  EVBIB: 'ISC Event Bibliography', US: 'USGS', USGS: 'USGS', NEIC: 'USGS', NEIS: 'USGS', USCGS: 'US Coast and Geodetic Survey',
  GCMT: 'Global CMT', HRVD: 'Global CMT', IDC: 'CTBTO', EIDC: 'CTBTO', GFZ: 'GFZ', ZUR_RMT: 'ETH Zürich', LDG: 'CEA (France)',
  ROM: 'INGV', MOS: 'Russian Academy of Sciences', UPP: 'Uppsala University', KEW: 'Kew Observatory', BER: 'Univ. Bergen',
  AUST: 'Geoscience Australia', PAS: 'Caltech', 'P&S': 'Pacheco & Sykes', ISS: 'ISS' };
export const agencyName = (a) => [...new Set(a.split(';').map((c) => AGENCY[c.trim().toUpperCase()] || c.trim()))].join(' / ');
const PLACE_PT = { 'azores islands': 'Açores', 'azores islands, portugal': 'Açores', 'azores islands region': 'Região dos Açores',
  'madeira islands region': 'Região da Madeira', 'madeira islands, portugal region': 'Região da Madeira',
  'canary islands region': 'Região das Canárias', 'canary islands, spain region': 'Região das Canárias',
  'azores-cape st. vincent ridge': 'Crista Açores–Cabo de São Vicente', 'west of gibraltar': 'Oeste de Gibraltar',
  'strait of gibraltar': 'Estreito de Gibraltar', 'north atlantic ocean': 'Atlântico Norte', spain: 'Espanha' };
const COUNTRY_PT = { Portugal: 'Portugal', Spain: 'Espanha', Morocco: 'Marrocos' };
export function translatedPlace(p, lang) {
  if (!p || lang !== 'pt') return p;
  const known = PLACE_PT[p.toLowerCase()];
  if (known) return known;
  const m = /^(\d+) km ([NSEW]+) of (.+), (Portugal|Spain|Morocco)$/.exec(p);
  return m ? `${m[1]} km a ${m[2].replace(/W/g, 'O')} de ${m[3]}, ${COUNTRY_PT[m[4]]}` : p;
}
