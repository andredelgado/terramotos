// Render the initial document with the same translations and place names as the interactive app.
import { readFileSync } from 'node:fs';
import { sourceLink } from '../hosting/catalogue.mjs';
import { translatedPlace } from '../site/js/names.js';
import { I18N } from '../site/js/text.js';
import { esc, eventHref } from '../site/js/util.js';

const data = JSON.parse(readFileSync(0, 'utf8'));
function render(lang) {
  const L = I18N[lang], pt = lang === 'pt', alt = pt ? 'en' : 'pt';
  const url = data.origin + (pt ? '/' : '/en/');
  const title = pt ? 'Últimos sismos em Portugal, Açores e Madeira' : 'Latest earthquakes in Portugal, the Azores and Madeira';
  const description = pt
    ? 'Consulte os sismos recentes no continente, nos Açores e na Madeira. Explore o mapa e o arquivo desde ' + data.firstYear + ', com registos do IPMA, ISC, EMSC e USGS.'
    : 'See recent earthquakes in mainland Portugal, the Azores and Madeira. Explore the map and historical archive since ' + data.firstYear + ', with records from IPMA, ISC, EMSC and USGS.';
  const regions = [L.r0, L.r1, L.r2];
  function facts(e) {
    const mag = e.m == null ? L.noMag : 'M ' + e.m.toLocaleString(L.loc, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const date = new Date(e.t * 1000).toISOString();
    const time = '<time datetime="' + date + '">' + date.slice(0, 19).replace('T', ' ') + ' UTC</time>';
    return [mag, esc(translatedPlace(e.place, lang) || regions[e.r]), time].join(' · ');
  }
  const latest = data.recent[0];
  const link = (e) => eventHref(e.id, lang);
  const recent = data.recent.map(e => {
    const [src, agency] = sourceLink(e.k || '');
    return '<li><a href="' + link(e) + '">' + facts(e) + '</a><small>' + regions[e.r] + ' · <a href="' + esc(src) + '">' + agency + '</a></small></li>';
  }).join('');
  const labels = (key) => {
    if (typeof L[key] !== 'string') throw new Error('Unknown homepage label ' + key);
    return esc(L[key]);
  };
  // data-i18n marks text-only elements. Translate attributes separately to preserve SVG children.
  return data.template.replace('<html lang="en">', '<html lang="' + lang + '" data-home>')
    .replace(/(<[^>]*\sdata-i18n="([^"]+)"[^>]*>)[^<]*/g, (_, start, key) => start + labels(key))
    .replace(/<[^>]*\sdata-i18n-aria="[^"]+"[^>]*>/g, tag => {
      const key = tag.match(/data-i18n-aria="([^"]+)"/)[1];
      return tag.replace(/\saria-label="[^"]*"/, '').replace(/>$/, ' aria-label="' + labels(key) + '">');
    })
    .replace(/<title>.*?<\/title>/, '<title>' + title + ' | Terramotos Portugal</title>')
    .replace(/(<meta (?:name="description"|property="og:description") content=")[^"]*/g, '$1' + description)
    .replace(/(property="og:title" content=")[^"]*/, '$1' + title + ' | Terramotos Portugal')
    .replace(/(property="og:url" content=")[^"]*/, '$1' + url)
    .replace(/<link rel="canonical"[^>]+>/, '<link rel="canonical" href="' + url + '">\n' +
      '<link rel="alternate" hreflang="pt" href="' + data.origin + '/">\n<link rel="alternate" hreflang="en" href="' + data.origin + '/en/">')
    .replace(/<a class="icon" id="lang"[^>]*>[^<]*<\/a>/, '<a class="icon" id="lang" href="' + (pt ? '/en/' : '/') + '" lang="' + alt + '" hreflang="' + alt + '" aria-label="' + L.other + ' · ' + L.aLang + '">' + L.other + '</a>')
    .replace('<span id="count"></span>', '<span id="count">' + data.total.toLocaleString(L.loc) + '</span>')
    .replace('<!-- latest-event -->', () => '<a class="latest" href="' + link(latest) + '"><span class="k">' + L.latest + '</span> ' + facts(latest) + '</a>')
    .replace('<!-- year-archive -->', () => data.navigation[lang])
    .replace('<!-- recent-events -->', () => '<section><h2>' + (pt ? 'Sismos recentes' : 'Recent earthquakes') + '</h2><ul class="recent">' + recent + '</ul></section>')
    .replace('<!-- historical-stories -->', () => data.stories.map(e => '<li><a href="' + link(e) + '">' + esc((e[lang] || e.pt || e.en).title) + '</a></li>').join(''))
    .replace('<!-- updated -->', () => data.generated ? '<p>' + (pt ? 'Catálogo atualizado em ' : 'Catalogue updated on ') + '<time datetime="' + esc(data.generated) + '">' + esc(data.generated.slice(0, 19).replace('T', ' ')) + ' UTC</time></p>' : '');
}
process.stdout.write(JSON.stringify({ pt: render('pt'), en: render('en') }));
