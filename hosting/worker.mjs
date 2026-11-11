import { eventPath, pageAsset } from './catalogue.mjs';
import { renderError, renderEvent } from './render.mjs';

const SITE_URL = 'https://terramotos.com';
const HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Language': 'pt',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

async function asset(env, path) {
  return env.ASSETS.fetch(new Request('https://assets.local' + path));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === 'www.terramotos.com') return Response.redirect(SITE_URL + url.pathname + url.search, 301);
    const match = /^\/(en\/)?sismo\/(\d{8}-[a-f0-9]{4,32})(?:\/[^/]*)?$/.exec(url.pathname);
    const lang = url.pathname.startsWith('/en/') ? 'en' : 'pt';
    const html = (body, status = 200) => new Response(request.method === 'HEAD' ? null : body, {
      status, headers: { ...HEADERS, 'Content-Language': lang, 'Cache-Control': status === 200 ? 'public, max-age=300' : 'no-store' },
    });
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    if (!match) {
      if (url.pathname.startsWith('/sismo/') || url.pathname.startsWith('/en/sismo/')) return html(renderError(lang, 404), 404);
      return env.ASSETS.fetch(request);
    }
    const id = match[2];
    try {
      const response = await asset(env, pageAsset(id));
      if (response.status === 404) return html(renderError(lang, 404), 404);
      if (!response.ok) throw new Error(`Page data unavailable (${response.status})`);
      const record = (await response.json())[id];
      if (!record) return html(renderError(lang, 404), 404);
      const canonicalPath = eventPath(id, lang);
      if (url.pathname !== canonicalPath) return Response.redirect(SITE_URL + canonicalPath, 301);
      if (request.method === 'HEAD') return html('');
      const stories = record.stories, story = stories?.[lang] || stories?.pt || stories?.en;
      return html(renderEvent({ event: record.event, nearby: record.nearby, story,
        storyHTML: story?.html || '', lang, siteURL: SITE_URL }));
    } catch (error) {
      console.error(JSON.stringify({ event: 'earthquake_page_failed', id, message: error.message }));
      return html(renderError(lang, 503), 503);
    }
  },
};
