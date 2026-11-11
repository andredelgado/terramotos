// Constants: endpoints, timings, sizes and the fixed lists.
export const ORIGIN = Date.UTC(1900, 0, 1) / 1000; // a Monday, so week rows start on Mondays
export const MAXH = 8e6;                            // cap on the scrollable height (browser limits)
export const EMSC_WS = 'wss://www.seismicportal.eu/standing_order/websocket';
export const IPMA_FEED = 'https://api.ipma.pt/open-data/observation/seismic/'; // + area: 3 = Azores, 7 = mainland and Madeira
export const IPMA_POLL = 300000;                    // ms between reads of IPMA's feed
export const META_POLL = 120000;                    // ms between checks for new site data
export const MATCH_S = 30, MATCH_KM = 100;
// shift: magnitude units taken off before sizing a wave; stretch: wave length factor.
// Longer lines pack more earthquakes, so small ones shrink to ticks and big ones still stand out.
export const SPANS = {
  '3h': { u: 10800, shift: 0, stretch: 1 },
  '1d': { u: 86400, shift: 0.4, stretch: 0.75 },
  '1w': { u: 604800, shift: 1, stretch: 0.45 },
  '1mo': { shift: 1.6, stretch: 0.28 },
  '1y': { shift: 2.4, stretch: 0.14 },
};
export const SOURCES = [[1, 'IPMA'], [2, 'ISC'], [4, 'EMSC'], [8, 'USGS']];
export const PADT = 30, PADB = 30; // retain an explicit destination through asynchronous loads and resizes
// the same earthquakes as a table: 'drum' or 'list'
export const VIEWS = ['list', 'map', 'stats'];

/* ---------- maps: fixed regional frames, using the bundled coastlines ---------- */
export const MAP_PERIODS = { '24h': 86400, '7d': 7 * 86400, '30d': 30 * 86400, '1y': 365 * 86400 };
export const MAP_BOUNDS = [[-13.2, -5.8, 35.2, 42.4], [-33, -23.4, 35.4, 41.4], [-18.4, -15.1, 29.4, 34.1]];
export const MAX_ZOOM = 12;

/* ---------- list view: every matching earthquake as a table, newest first ---------- */
// Only the rows on screen exist in the page. Each year is a block of rows: its earthquakes when
// the year is loaded, or as many rows as META says it has (fetched once the block is on screen).
export const LROW = 48, LHEAD = 40;

/* ---------- statistics: the earthquakes that match the filters, counted over a period ---------- */
export const STAT_PERIODS = { all: 0, '10y': 3652.5 * 86400, '1y': 365 * 86400, '30d': 30 * 86400 };
