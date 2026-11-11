export const eventPath = (id, lang = 'pt') => `${lang === 'en' ? '/en' : ''}/sismo/${id}`;
export const pageAsset = (id) => `/pages/${id.slice(0, 6)}-${parseInt(id.split('-')[1].slice(-4), 16) % 8}.json`;

export function sourceLink(key) {
  const id = encodeURIComponent(key.slice(2));
  if (key.startsWith('e:')) return [`https://www.seismicportal.eu/eventdetails.html?unid=${id}`, 'EMSC'];
  if (key.startsWith('i:')) return [`https://www.isc.ac.uk/cgi-bin/web-db-run?event_id=${id}&out_format=ISF2&request=COMPREHENSIVE`, 'ISC'];
  if (key.startsWith('u:')) return [`https://earthquake.usgs.gov/earthquakes/eventpage/${id}`, 'USGS'];
  return ['https://www.ipma.pt/pt/geofisica/sismicidade/', 'IPMA'];
}
