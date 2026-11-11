import { SOURCES } from '../site/js/config.js';
import { locatorSVG } from '../site/js/locator.js';
import { agencyName, translatedPlace } from '../site/js/names.js';
import { I18N } from '../site/js/text.js';
import { esc } from '../site/js/util.js';
import { eventPath, sourceLink } from './catalogue.mjs';

const CSS = `
:root{color-scheme:light dark;--bg:#fff;--fg:#111;--muted:#666;--line:#dedede;--land:#ededed;--red:#df2029}
@media(prefers-color-scheme:dark){:root{--bg:#000;--fg:#eee;--muted:#999;--line:#292929;--land:#1c1c1c}}
:root[data-theme=light]{color-scheme:light;--bg:#fff;--fg:#111;--muted:#666;--line:#dedede;--land:#ededed}
:root[data-theme=dark]{color-scheme:dark;--bg:#000;--fg:#eee;--muted:#999;--line:#292929;--land:#1c1c1c}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.65 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
a{color:inherit;text-underline-offset:3px}a:hover{text-decoration-thickness:2px}button{font:inherit;color:inherit;cursor:pointer;background:transparent;border:1px solid var(--line);border-radius:5px;padding:3px 10px}
header,main,footer{width:min(740px,100% - 40px);margin:auto}header{display:flex;align-items:center;gap:16px;padding:22px 0;border-bottom:1px solid var(--line)}header>a:first-child{font-weight:650;text-decoration:none;margin-right:auto}header nav{display:flex;gap:16px;align-items:center}
main{padding:42px 0 36px}h1{font-size:clamp(28px,5vw,42px);letter-spacing:-.035em;line-height:1.15;margin:10px 0 18px}h2{font-size:20px;margin:36px 0 12px}h3{font-size:18px;margin-top:30px}.meta,.facts,footer{color:var(--muted);font-size:14px}.magnitude{font-variant-numeric:tabular-nums;font-size:24px;font-weight:650}.facts{border-block:1px solid var(--line);padding:14px 0;margin:28px 0}.facts p{margin:4px 0}.map{display:block;width:100%;height:220px;margin:28px 0}.land{fill:var(--land);stroke:var(--line);stroke-width:.6}.ring{fill:var(--red);opacity:.15}.dot{fill:var(--red)}.links,main nav{display:flex;flex-wrap:wrap;gap:12px 24px;margin:28px 0}.nearby,.events,.years,.plain{list-style:none;padding:0;margin:0}.nearby li,.events li,.plain li{border-bottom:1px solid var(--line)}.nearby a,.events a,.plain a{text-decoration:none;display:block;padding:12px 0}.nearby span,.events span{display:block;color:var(--muted);font-size:14px}.nearby a:hover b,.events a:hover b,.plain a:hover,.years a:hover span{text-decoration:underline}.lede{color:var(--muted);margin:0 0 8px}.meta a{text-decoration:none}.meta a:hover{text-decoration:underline}.years{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:0 28px}.years a{display:flex;justify-content:space-between;align-items:baseline;gap:12px;text-decoration:none;padding:9px 0;border-bottom:1px solid var(--line);font-variant-numeric:tabular-nums}.years small{color:var(--muted)}details{margin:20px 0}summary{cursor:pointer;color:var(--muted)}details ul{list-style:none;padding:0;margin:12px 0;columns:2 220px;font-size:14px;font-variant-numeric:tabular-nums}details a{display:block;padding:4px 0;text-decoration:none}details a:hover{text-decoration:underline}footer{border-top:1px solid var(--line);padding:20px 0 35px}blockquote{border-left:2px solid var(--line);padding-left:18px;margin-left:0}
@media(max-width:480px){header,main,footer{width:calc(100% - 32px)}header{gap:10px;font-size:14px}header nav{gap:10px}main{padding-top:28px}}
`;
const THEME = `try{const t=localStorage.getItem('seis.theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t;localStorage.setItem('seis.lang',document.documentElement.lang)}catch(_){}
document.addEventListener('click',e=>{if(!e.target.closest('#theme'))return;const r=document.documentElement;const dark=r.dataset.theme?r.dataset.theme==='dark':matchMedia('(prefers-color-scheme:dark)').matches;r.dataset.theme=dark?'light':'dark';try{localStorage.setItem('seis.theme',r.dataset.theme)}catch(_){}});`;
const FORMATS = Object.fromEntries(['pt', 'en'].map((lang) => [lang, {
  one: new Intl.NumberFormat(I18N[lang].loc, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
  two: new Intl.NumberFormat(I18N[lang].loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  date: new Intl.DateTimeFormat(I18N[lang].loc, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }),
}]));

/** The page every static document shares: head, header with language and theme, and the credits. */
export function documentHTML({ lang, title, description, canonical, alternate, body, image = 'https://terramotos.com/share.png', noindex = false, type = 'article', head = '' }) {
  const L = I18N[lang];
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)} · Terramotos Portugal</title><meta name="description" content="${esc(description)}">
${noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${esc(canonical)}"><link rel="alternate" hreflang="${lang}" href="${esc(canonical)}"><link rel="alternate" hreflang="${lang === 'pt' ? 'en' : 'pt'}" href="${esc(alternate)}">`}
<meta property="og:type" content="${type}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(canonical)}"><meta property="og:image" content="${esc(image)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="alternate" type="application/rss+xml" title="Terramotos Portugal" href="/rss.xml"><style>${CSS}</style><script>${THEME}</script>${head}</head><body>
<header><a href="${lang === 'pt' ? '/' : '/en/'}">Terramotos Portugal</a><nav>${alternate ? `<a href="${esc(alternate)}" lang="${lang === 'pt' ? 'en' : 'pt'}">${L.other}</a>` : ''}<button id="theme" type="button" aria-label="${L.aTheme}">◐</button></nav></header>
<main>${body}</main><footer>${lang === 'pt' ? 'Dados de' : 'Data from'} <a href="https://www.ipma.pt/pt/geofisica/sismicidade/">IPMA</a>, <a href="https://www.isc.ac.uk/iscbulletin/">ISC</a>, <a href="https://www.seismicportal.eu/">EMSC</a> ${lang === 'pt' ? 'e' : 'and'} <a href="https://earthquake.usgs.gov/">USGS</a>. ${L.utc}.</footer></body></html>`;
}

export function renderEvent({ event: ev, nearby, story, storyHTML, lang, siteURL }) {
  const L = I18N[lang], region = [L.r0, L.r1, L.r2][ev.r];
  const number = (n, digits = 1) => (digits === 2 ? FORMATS[lang].two : FORMATS[lang].one).format(n);
  const magnitude = (e) => e.m == null ? L.noMag : `M ${number(e.m)}`;
  const date = (t) => FORMATS[lang].date.format(t * 1000);
  const time = (t) => new Date(t * 1000).toISOString().slice(11, 19);
  const place = translatedPlace(ev.place, lang) || region;
  const label = lang === 'pt' ? 'Sismo' : 'Earthquake';
  const when = `${date(ev.t)}, ${time(ev.t)} UTC`;
  const sources = SOURCES.filter(([bit]) => ev.s & bit).map(([, name]) => name).join(' · ');
  const name = [label + (ev.m == null ? '' : ' ' + magnitude(ev)), place, when].join(' · ');
  const title = story?.title || name + (ev.sameTime ? ' · ' + ev.id.split('-')[1] : '');
  const description = [story?.summary, name, ev.d == null ? null : L.deep(number(ev.d)),
    sources && L.source + ' ' + sources].filter(Boolean).join('. ') + '.';
  const canonical = siteURL + eventPath(ev.id, lang), alternate = siteURL + eventPath(ev.id, lang === 'pt' ? 'en' : 'pt');
  const source = sourceLink(ev.k || ''), iso = (t) => new Date(t * 1000).toISOString();
  const fact = [region, ev.d == null ? null : L.deep(number(ev.d)), `${number(ev.lat, 2)}°, ${number(ev.lon, 2)}°`].filter(Boolean).join(' · ');
  const nearbyHTML = nearby.events.map((e) => `<li><a href="${eventPath(e.id, lang)}"><b>${esc(magnitude(e))}</b> · ${esc(date(e.t))} · ${time(e.t).slice(0, 5)} UTC<span>${esc(translatedPlace(e.place, lang) || [L.r0, L.r1, L.r2][e.r])}</span></a></li>`).join('');
  const body = `<p class="meta">${esc(region)} · <time datetime="${iso(ev.t)}">${esc(date(ev.t))}, ${time(ev.t)} UTC</time></p><h1>${esc(title)}</h1>
<p class="magnitude">${esc(magnitude(ev))}${ev.m != null && ev.mt ? ` <small>${esc(ev.mt)}</small>` : ''}</p>
${storyHTML || ''}${locatorSVG(ev, L.aMap)}<div class="facts"><p>${esc(place)}</p><p>${esc(fact)}</p>
${ev.inten || ev.felt ? `<p>${esc(ev.inten ? L.feltI(ev.inten) : L.felt)}</p>` : ''}
${ev.m != null && ev.au ? `<p>${esc(L.magBy(agencyName(ev.au)))}</p>` : ''}<p>${L.source} ${esc(sources)}</p></div>
<nav class="links"><a href="${lang === 'pt' ? '/' : '/en/'}#s=1d&q=${ev.id}">${L.onDrum}</a><a href="${lang === 'pt' ? '/' : '/en/'}#v=map&from=${iso(ev.t - 86400)}&to=${iso(ev.t + 30 * 86400)}&q=${ev.id}">${L.onMap}</a><a href="${lang === 'pt' ? '/' : '/en/'}#v=list&q=${ev.id}">${L.onList}</a><a href="${lang === 'pt' ? '/arquivo/' : '/en/archive/'}${iso(ev.t).slice(0, 4)}/">${lang === 'pt' ? 'Arquivo' : 'Archive'} · ${iso(ev.t).slice(0, 4)}</a><a href="${esc(source[0])}" rel="noopener">${esc(source[1])} ↗</a></nav>
<h2>${L.nearTitle}</h2><p>${nearby.count ? esc(L.near(nearby.count)) + (nearby.count > nearby.events.length ? ' ' + esc(L.nearMore(nearby.events.length)) : '') : L.nearNone}</p>${nearbyHTML ? `<ul class="nearby">${nearbyHTML}</ul>` : ''}`;
  return documentHTML({ lang, title, description, canonical, alternate, body, image: canonical + '.png' });
}

/** The page for an address that does not exist, served by Cloudflare for any unknown path. */
export function renderNotFound(lang) {
  const pt = lang === 'pt', title = pt ? 'Página não encontrada' : 'Page not found';
  return documentHTML({ lang, title, description: title, canonical: '', alternate: '', noindex: true,
    body: `<h1>${title}</h1><p class="lede">${pt ? 'Este endereço não existe, ou deixou de existir.' : 'This address does not exist, or no longer does.'}</p>` +
      `<nav><a href="${pt ? '/' : '/en/'}">${pt ? 'Ir para o sismógrafo' : 'Go to the seismograph'}</a>` +
      `<a href="${pt ? '/arquivo/' : '/en/archive/'}">${pt ? 'Arquivo de sismos' : 'Earthquake archive'}</a></nav>` });
}

export function renderError(lang, status) {
  const title = status === 404 ? I18N[lang].pageMissing : lang === 'pt' ? 'Não foi possível carregar o sismo.' : 'Could not load this earthquake.';
  return documentHTML({ lang, title, description: title, canonical: '', alternate: '', noindex: true,
    body: `<h1>${esc(title)}</h1><p><a href="${lang === 'pt' ? '/' : '/en/'}">${lang === 'pt' ? 'Voltar ao sismógrafo' : 'Back to the seismograph'}</a></p>` });
}
