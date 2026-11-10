/* Cookieless view/language counts. No remote script, browser storage, or visitor ID. */
(() => {
  'use strict';
  const endpoint = document.querySelector('meta[name="goatcounter"]')?.content || '';
  const production = location.origin === 'https://andredelgado.github.io' &&
    /^\/terramotos(?:\/(?:index\.html)?)?$/.test(location.pathname);
  const enabled = production && /^https:\/\/[a-z0-9-]+\.goatcounter\.com\/count$/.test(endpoint);
  const views = { drum: 'Seismograph', list: 'List', map: 'Map' };
  const languages = { en: 'English', pt: 'Português' };
  const seen = new Set(), pending = new Map();

  const optedOut = () => navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' || window.doNotTrack === '1';

  function flush() {
    if (!enabled || optedOut() || navigator.webdriver || window.self !== window.top || document.prerendering ||
        document.visibilityState !== 'visible' || navigator.onLine === false) return;
    for (const [path, title] of pending) {
      pending.delete(path); seen.add(path);
      const query = new URLSearchParams({ p: path, t: title, r: '', rnd: String(Date.now()) });
      try {
        // GoatCounter's documented pixel endpoint; no referrer, cookies, URL parameters or screen data.
        fetch(endpoint + '?' + query, {
          method: 'GET', mode: 'no-cors', credentials: 'omit', referrerPolicy: 'no-referrer',
          cache: 'no-store', keepalive: true,
        }).catch(() => {}); // Blockers and network failures must never affect the earthquake views.
      } catch (_) {}
    }
  }

  function count(view, language) {
    if (!enabled || optedOut() || !Object.hasOwn(views, view) || !Object.hasOwn(languages, language)) return;
    const path = '/' + language + '/' + (view === 'drum' ? 'seismograph' : view);
    if (seen.has(path) || pending.has(path)) return;
    pending.set(path, views[view] + ' · ' + languages[language]);
    flush();
  }

  window.terramotosUsage = Object.freeze({ enabled, count });
  window.addEventListener('online', flush);
  document.addEventListener('visibilitychange', flush);
  document.addEventListener('prerenderingchange', flush);
})();
