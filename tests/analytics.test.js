const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');

const source = readFileSync(new URL('../site/analytics.js', `file://${__filename}`), 'utf8');

function browser({ url = 'https://terramotos.com/', endpoint = 'https://terramotos.goatcounter.com/count',
  navigator = {}, hidden = false, prerender = false, frame = false, fetchFailure = false, windowDnt } = {}) {
  const calls = [], listeners = {};
  const context = {
    URLSearchParams, location: new URL(url),
    navigator: { onLine: true, webdriver: false, ...navigator },
    document: {
      visibilityState: hidden ? 'hidden' : 'visible', prerendering: prerender,
      querySelector: () => ({ content: endpoint }),
      addEventListener: (type, listener) => { listeners[type] = listener; },
    },
    addEventListener: (type, listener) => { listeners[type] = listener; },
    fetch: (url, options) => {
      calls.push({ url: new URL(url), options: JSON.parse(JSON.stringify(options)) });
      return fetchFailure ? Promise.reject(new Error('Blocked')) : Promise.resolve({});
    },
    doNotTrack: windowDnt,
  };
  context.window = context; context.self = context; context.top = frame ? {} : context;
  for (const property of ['localStorage', 'sessionStorage', 'indexedDB']) {
    Object.defineProperty(context, property, { get() { throw new Error('Analytics must not access storage'); } });
  }
  Object.defineProperty(context.document, 'cookie', {
    get() { throw new Error('Analytics must not read cookies'); },
    set() { throw new Error('Analytics must not write cookies'); },
  });
  vm.runInNewContext(source, context, { filename: 'analytics.js' });
  return { calls, context, listeners, counter: context.terramotosUsage };
}

test('six fixed view/language paths are counted once per page open', () => {
  const { counter, calls } = browser();
  for (const language of ['pt', 'en']) {
    for (const view of ['drum', 'list', 'map']) {
      counter.count(view, language);
      counter.count(view, language);
    }
  }
  assert.equal(counter.enabled, true);
  assert.deepEqual(calls.map(({ url }) => url.searchParams.get('p')),
    ['/pt/seismograph', '/pt/list', '/pt/map', '/en/seismograph', '/en/list', '/en/map']);
  assert.equal(calls[0].url.searchParams.get('t'), 'Seismograph · Português');
  assert.equal(calls[5].url.searchParams.get('t'), 'Map · English');
});

test('requests omit cookies, referrers, shared links, filters, screen data and persistent storage', () => {
  const { counter, calls } = browser({ url: 'https://terramotos.com/?secret=do-not-send#v=map&q=19690228-c63c&m=3&from=2020-01-01' });
  counter.count('map', 'en');
  const [{ url, options }] = calls;
  assert.equal(url.origin + url.pathname, 'https://terramotos.goatcounter.com/count');
  assert.deepEqual([...url.searchParams.keys()].sort(), ['p', 'r', 'rnd', 't']);
  assert.equal(url.searchParams.get('r'), '');
  assert.equal(url.searchParams.get('p'), '/en/map');
  assert.doesNotMatch(url.href, /secret|19690228|2020-01-01/);
  assert.deepEqual(options, { method: 'GET', mode: 'no-cors', credentials: 'omit', referrerPolicy: 'no-referrer',
    cache: 'no-store', keepalive: true });
});

test('Do Not Track and Global Privacy Control prevent every request', () => {
  for (const preference of [{ navigator: { doNotTrack: '1' } }, { navigator: { globalPrivacyControl: true } }, { windowDnt: '1' }]) {
    const { counter, calls, listeners } = browser(preference);
    counter.count('list', 'en'); listeners.online(); listeners.visibilitychange();
    assert.equal(calls.length, 0);
  }
});

test('only the production app and a configured endpoint can send counts', () => {
  for (const options of [
    { url: 'http://localhost:8000/' }, { url: 'http://127.0.0.1:8765/terramotos/' },
    { url: 'https://terramotos-portugal-preview.light-bay-9610.chatgpt.site/' },
    { url: 'https://andredelgado.github.io/terramotos/' },
    { url: 'https://terramotos.com/sismo/19690228-c63c' },
    { endpoint: '' }, { endpoint: 'http://terramotos.goatcounter.com/count' },
    { endpoint: 'https://terramotos.goatcounter.com.evil.example/count' },
  ]) {
    const { counter, calls } = browser(options);
    counter.count('list', 'en');
    assert.equal(counter.enabled, false);
    assert.equal(calls.length, 0);
  }
  assert.equal(browser({ url: 'https://terramotos.com/index.html' }).counter.enabled, true);
});

test('unrecognised views or languages cannot turn into arbitrary tracked paths', () => {
  const { counter, calls } = browser();
  for (const value of ['__proto__', 'constructor', '/secret', undefined]) {
    counter.count(value, 'en'); counter.count('list', value);
  }
  assert.equal(calls.length, 0);
});

test('hidden, prerendered and offline pages defer counts until usable, without duplicates', () => {
  for (const options of [{ hidden: true }, { prerender: true }, { navigator: { onLine: false } }]) {
    const { counter, context, calls, listeners } = browser(options);
    counter.count('list', 'pt'); counter.count('list', 'pt'); counter.count('map', 'en');
    assert.equal(calls.length, 0);
    context.document.visibilityState = 'visible'; context.document.prerendering = false; context.navigator.onLine = true;
    listeners.online(); listeners.visibilitychange(); listeners.prerenderingchange();
    assert.equal(calls.length, 2);
  }
});

test('automation and embedded frames never send counts', () => {
  for (const options of [{ navigator: { webdriver: true } }, { frame: true }]) {
    const { counter, calls } = browser(options);
    counter.count('map', 'en');
    assert.equal(calls.length, 0);
  }
});

test('blocked requests or an unavailable fetch API cannot interrupt the app', async () => {
  const { counter, calls } = browser({ fetchFailure: true });
  assert.doesNotThrow(() => { counter.count('list', 'en'); counter.count('list', 'en'); counter.count('map', 'en'); });
  assert.equal(calls.length, 2);
  await new Promise(setImmediate);
  const missing = browser();
  missing.context.fetch = undefined;
  assert.doesNotThrow(() => missing.counter.count('list', 'en'));
});
