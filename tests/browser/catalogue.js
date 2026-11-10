// Small, fixed catalogue in the same compact wire format as the Python export.
// No archived data or live network access is needed to run the browser suite.
const NOW = new Date('2026-11-10T18:00:00Z');
const seconds = (date) => Date.parse(date) / 1000;
const regions = [
  { lat: 38.4, lon: -9.2 },
  { lat: 38.2, lon: -27 },
  { lat: 32.7, lon: -17 },
];
const events = [
  { id: '19090423-721f', t: seconds('1909-04-23T17:39:32Z'), m: 6, r: 0, place: 'Alcochete' },
  { id: '19690227-1111', t: seconds('1969-02-27T12:00:00Z'), m: 4.5, r: 0, place: 'Older earthquake' },
  { id: '19690228-c63c', t: seconds('1969-02-28T02:40:34Z'), m: 7.8, r: 0, place: 'Azores-Cape St. Vincent Ridge' },
  { id: '19690228-2222', t: seconds('1969-02-28T04:00:00Z'), m: 4.2, r: 0, place: 'Later earthquake' },
  { id: '19800101-95df', t: seconds('1980-01-01T16:42:42Z'), m: 6.9, r: 1, place: 'Azores Islands' },
];
for (let i = 239; i >= 0; i--) {
  const t = NOW.getTime() / 1000 - 3600 - i * 10800;
  const day = new Date(t * 1000).toISOString().slice(0, 10).replaceAll('-', '');
  events.push({ id: `${day}-${i.toString(16).padStart(4, '0')}`, t, m: i === 0 ? 3.2 : i % 11 === 0 ? null : [1.4, 2.4, 3.2, 4.1][i % 4], r: i % 3, place: i === 0 ? 'Newest earthquake' : `Test earthquake ${i}` });
}

const years = {}, counts = {}, chunks = {};
for (const event of events) {
  const year = new Date(event.t * 1000).getUTCFullYear();
  (chunks[year] ||= []).push(event);
  const buckets = counts[year] ||= Array.from({ length: 3 }, () => Array(6).fill(0));
  buckets[event.r][event.m == null ? 0 : event.m < 2 ? 1 : Math.min(5, Math.floor(event.m))]++;
}
const payloads = {};
for (const [year, rows] of Object.entries(chunks)) {
  years[year] = { v: 'smoke-fixture', n: rows.length };
  let previous = Date.UTC(Number(year), 0, 1) / 1000;
  payloads[year] = {
    year: Number(year),
    t: rows.map((e) => { const delta = e.t - previous; previous = e.t; return delta; }),
    id: rows.map((e) => e.id), m: rows.map((e) => e.m == null ? null : Math.round(e.m * 10)),
    mt: rows.map((e) => e.m >= 6 ? 2 : 1), mtypes: ['', 'ML', 'MW'],
    ma: rows.map(() => 1), authors: ['', 'IPMA'],
    r: rows.map((e) => e.r), d: rows.map(() => 10),
    lat: rows.map((e) => Math.round(regions[e.r].lat * 100)),
    lon: rows.map((e) => Math.round(regions[e.r].lon * 100)),
    p: rows.map((_, i) => i), places: rows.map((e) => e.place),
    s: rows.map(() => 1), k: rows.map(() => ''), felt: [], intensity: [],
  };
}
const meta = {
  generated: '2026-11-10T16:00:00Z', first: events[0].t, total: events.length,
  regions: ['continente', 'acores', 'madeira'], years, counts,
  polygons: [
    [[-13, 35], [-6, 35], [-6, 43], [-13, 43]],
    [[-33, 35], [-23, 35], [-23, 42], [-33, 42]],
    [[-19, 29], [-15, 29], [-15, 34], [-19, 34]],
  ],
  largest: events.filter((e) => e.m >= 6).sort((a, b) => b.m - a.m).map((e) => ({ ...e, mt: 'MW' })),
};

module.exports = { NOW, meta, payloads };
