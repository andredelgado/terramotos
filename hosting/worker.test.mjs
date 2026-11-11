import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pageAsset } from './catalogue.mjs';
import worker from './worker.mjs';

const ID = '19690228-c63c';
const EVENT = { id: ID, t: Date.parse('1969-02-28T02:40:34Z') / 1000, m: 7.8, mt: 'MW', au: 'IPMA',
  r: 0, d: 10, lat: 38.4, lon: -9.2, place: 'Azores-Cape St. Vincent Ridge', s: 1, k: '', felt: false, inten: null };
const RECORD = { event: EVENT, nearby: { count: 1, events: [{ ...EVENT, id: '19690227-1111', m: 4.5 }] }, stories: {
  pt: { title: '28 de fevereiro de 1969', summary: 'O sismo de 1969.', html: '<p>Texto em português.</p>' },
  en: { title: '28 February 1969', summary: 'The 1969 earthquake.', html: '<p>Text in English.</p>' },
} };
function environment(extra = {}) {
  const entries = {
    '/index.html': '<!doctype html><title>App</title>',
    [pageAsset(ID)]: { [ID]: structuredClone(RECORD) },
    [pageAsset('19690228-2222')]: { '19690228-2222': { event: { ...EVENT, id: '19690228-2222', t: Date.parse('1969-02-28T04:00:00Z') / 1000, m: 4.2, place: 'Later earthquake' }, nearby: { count: 0, events: [] } } },
    ...extra,
  };
  return { ASSETS: { async fetch(request) {
    const path = new URL(request.url).pathname === '/' ? '/index.html' : new URL(request.url).pathname;
    const body = entries[path];
    if (body instanceof Response) return body.clone();
    return body == null ? new Response('Missing', { status: 404 }) :
      new Response(typeof body === 'string' ? body : JSON.stringify(body));
  } } };
}
const fetchPage = (path, env = environment(), options) => worker.fetch(new Request('https://terramotos.com' + path, options), env);

test('Portuguese earthquake HTML includes the story, map, sources, nearby events and permanent links without JavaScript', async () => {
  const response = await fetchPage(`/sismo/${ID}`), html = await response.text();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Language'), 'pt');
  assert.match(html, /<html lang="pt">/);
  assert.match(html, /<h1>28 de fevereiro de 1969<\/h1>/);
  assert.match(html, /Texto em português/);
  assert.match(html, /M 7,8/);
  assert.match(html, /<svg class="map"/);
  assert.match(html, /IPMA/);
  assert.match(html, /href="\/sismo\/19690227-1111"/);
  assert.match(html, /href="https:\/\/terramotos.com\/sismo\/19690228-c63c"/);
  assert.match(html, /hreflang="en" href="https:\/\/terramotos.com\/en\/sismo\/19690228-c63c"/);
  assert.match(html, /href="\/#v=map&from=/);
});

test('English URLs produce English HTML with a Portuguese alternate', async () => {
  const response = await fetchPage(`/en/sismo/${ID}`), html = await response.text();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Language'), 'en');
  assert.match(html, /<h1>28 February 1969<\/h1>/);
  assert.match(html, /Text in English/);
  assert.match(html, /Nearby earthquakes/);
  assert.match(html, /hreflang="pt" href="https:\/\/terramotos.com\/sismo\/19690228-c63c"/);
});

test('an earthquake without a story still has its own complete page', async () => {
  const response = await fetchPage('/en/sismo/19690228-2222'), html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /<h1>M 4.2 · Later earthquake<\/h1>/);
  assert.match(html, /1969-02-28T04:00:00.000Z/);
});

test('catalogue text is escaped instead of becoming HTML', async () => {
  const record = structuredClone(RECORD);
  record.event.place = '<img src=x onerror=bad()> & "Place"';
  const html = await (await fetchPage(`/en/sismo/${ID}`, environment({ [pageAsset(ID)]: { [ID]: record } }))).text();
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x onerror=bad\(\)&gt; &amp; &quot;Place&quot;/);
});

test('prepared nearby events retain their own permanent links across a year boundary', async () => {
  const record = structuredClone(RECORD);
  record.nearby.events[0].id = '19791230-abcd';
  const html = await (await fetchPage(`/en/sismo/${ID}`, environment({ [pageAsset(ID)]: { [ID]: record } }))).text();
  assert.match(html, /href="\/en\/sismo\/19791230-abcd"/);
  assert.match(html, /1 other earthquake/);
});

test('missing and malformed earthquake URLs return a real, uncacheable 404', async () => {
  for (const path of ['/sismo/19690228-dead', '/sismo/19690228-c634', '/sismo/20250101-abcd', '/sismo/not-an-id', '/en/sismo/%3Cscript%3E']) {
    const response = await fetchPage(path);
    assert.equal(response.status, 404, path);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.match(await response.text(), /name="robots" content="noindex"/);
  }
});

test('an unavailable catalogue is a retryable server error rather than a false 404', async (t) => {
  t.mock.method(console, 'error', () => {});
  const response = await fetchPage(`/sismo/${ID}`, environment({ [pageAsset(ID)]: new Response('Unavailable', { status: 503 }) }));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('aliases redirect to a stable canonical ID and www redirects to the apex', async () => {
  const alias = await fetchPage(`/en/sismo/${ID}/28-february-1969`);
  assert.equal(alias.status, 301);
  assert.equal(alias.headers.get('Location'), `https://terramotos.com/en/sismo/${ID}`);
  const www = await worker.fetch(new Request('https://www.terramotos.com/?example=1'), environment());
  assert.equal(www.status, 301);
  assert.equal(www.headers.get('Location'), 'https://terramotos.com/?example=1');
});

test('HEAD keeps the page headers without a body, and writes are rejected', async () => {
  const head = await fetchPage(`/sismo/${ID}`, environment(), { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  const post = await fetchPage(`/sismo/${ID}`, environment(), { method: 'POST' });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('Allow'), 'GET, HEAD');
});

test('the home page is served through the asset binding', async () => {
  assert.match(await (await fetchPage('/')).text(), /<title>App<\/title>/);
});
