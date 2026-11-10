import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkUpdates } from './watchdog.mjs';

const NOW = Date.parse('2026-11-10T20:43:00Z');
const iso = time => new Date(time).toISOString();

function fixture({ now = NOW, fresh = now - 10 * 60000, published = now - 60000, runs = [], jobs = {},
  failure, failureStatus = 403, releaseMissing = false, dispatchStatus = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const path = new URL(url).pathname;
    if (failure && path.includes(failure)) return new Response('Do not print this response body', { status: failureStatus });
    if (options.method === 'POST') {
      return dispatchStatus === 204 ? new Response(null, { status: 204 }) :
        Response.json({ html_url: 'https://github.com/andredelgado/terramotos/actions/runs/123' }, { status: dispatchStatus });
    }
    if (path.endsWith('/runs')) return Response.json({ workflow_runs: runs });
    if (path.endsWith('/state.json')) return Response.json({ fresh_at: typeof fresh === 'number' ? iso(fresh) : fresh });
    if (path.endsWith('/releases/tags/dataset')) return releaseMissing ? new Response(null, { status: 404 }) :
      Response.json({ assets: [{ name: 'terramotos-portugal.zip', updated_at: typeof published === 'number' ? iso(published) : published }] });
    const run = /\/runs\/(\d+)\/jobs/.exec(path);
    if (run) return Response.json({ jobs: jobs[run[1]] || [] });
    throw new Error('Unexpected request: ' + url);
  };
  return { calls, run: options => checkUpdates({ token: 'test-only-token', now, fetchImpl, ...options }) };
}

test('fresh data skips the dispatch and keeps the credential on GitHub API requests only', async () => {
  const { run, calls } = fixture();
  assert.equal((await run({ dispatch: true })).action, 'skip');
  assert.equal(calls.filter(call => call.options.method === 'POST').length, 0);
  for (const { url, options } of calls) {
    assert.equal(options.redirect, 'manual');
    assert.equal(Boolean(options.headers.Authorization), new URL(url).hostname === 'api.github.com');
  }
});

test('a stale archive dispatches live on main and records GitHub acceptance', async () => {
  for (const dispatchStatus of [200, 204]) {
    const { run, calls } = fixture({ fresh: NOW - 45 * 60000, dispatchStatus });
    const result = await run({ dispatch: true });
    assert.equal(result.action, 'dispatched'); assert.equal(result.mode, 'live');
    const posts = calls.filter(call => call.options.method === 'POST');
    assert.equal(posts.length, 1);
    assert.equal(posts[0].url, 'https://api.github.com/repos/andredelgado/terramotos/actions/workflows/update.yml/dispatches');
    assert.deepEqual(JSON.parse(posts[0].options.body), { ref: 'main', inputs: { mode: 'live' } });
  }
});

test('Workers-compatible manual redirects fail closed for reads and dispatches', async () => {
  for (const failure of ['/runs', '/state.json', '/dispatches']) {
    const { run, calls } = fixture({ failure, failureStatus: 302, fresh: NOW - 7200000 });
    await assert.rejects(run({ dispatch: true }), /HTTP 302/);
    assert.ok(calls.every(call => call.options.redirect === 'manual'));
    assert.ok(calls.every(call => ['api.github.com', 'raw.githubusercontent.com'].includes(new URL(call.url).hostname)));
  }
});

test('the daily fallback checks the dataset asset rather than a successful export run', async () => {
  const { run } = fixture({ published: NOW - 86400000, runs: [{ status: 'completed', conclusion: 'success', event: 'push' }] });
  assert.equal((await run()).mode, 'daily');
  assert.equal((await fixture({ releaseMissing: true }).run()).mode, 'daily');
});

test('daily catch-up waits until 04:00 UTC and supersedes live when due', async () => {
  const now = Date.parse('2026-11-11T03:43:00Z');
  assert.equal((await fixture({ now, published: now - 86400000 }).run()).action, 'skip');
  assert.equal((await fixture({ published: NOW - 86400000, fresh: NOW - 7200000 }).run()).mode, 'daily');
});

test('an active or queued update prevents duplicate dispatches before reading freshness', async () => {
  for (const status of ['queued', 'in_progress', 'waiting', 'pending', 'requested']) {
    const { run, calls } = fixture({ runs: [{ status, html_url: 'https://github.com/run/123' }], fresh: NOW - 7200000 });
    const result = await run({ dispatch: true });
    assert.equal(result.action, 'skip'); assert.equal(result.run, 'https://github.com/run/123');
    assert.equal(calls.length, 1);
  }
});

test('monthly catch-up begins on day 2 at 05:00 UTC and takes precedence over daily', async () => {
  const now = Date.parse('2026-12-02T05:43:00Z');
  assert.equal((await fixture({ now, published: now - 86400000 }).run()).mode, 'monthly');
  assert.equal((await fixture({ now: now - 3600000 }).run()).action, 'skip');
  assert.equal((await fixture({ now: now + 86400000 }).run()).action, 'skip');
});

test('a successful monthly or backfill step prevents another monthly run all that day', async () => {
  const now = Date.parse('2026-12-02T20:43:00Z');
  for (const mode of ['monthly', 'backfill']) {
    const { run } = fixture({ now,
      runs: [{ id: 123, status: 'completed', conclusion: 'success', event: 'workflow_dispatch', updated_at: '2026-12-02T06:00:00Z' }],
      jobs: { 123: [{ conclusion: 'success', steps: [{ name: 'Update (' + mode + ')', conclusion: 'success' }] }] },
    });
    assert.equal((await run()).action, 'skip');
  }
});

test('a live run or failed monthly step does not hide a missing monthly update', async () => {
  const now = Date.parse('2026-12-02T20:43:00Z');
  for (const step of [{ name: 'Update (live)', conclusion: 'success' }, { name: 'Update (monthly)', conclusion: 'failure' }]) {
    const { run } = fixture({ now,
      runs: [{ id: 123, status: 'completed', conclusion: 'success', event: 'workflow_dispatch', updated_at: iso(now - 60000) }],
      jobs: { 123: [{ conclusion: 'success', steps: [step] }] },
    });
    assert.equal((await run()).mode, 'monthly');
  }
});

test('checks are read-only by default, including when data is stale', async () => {
  const { run, calls } = fixture({ fresh: NOW - 7200000 });
  assert.equal((await run()).action, 'would_dispatch');
  assert.equal(calls.some(call => call.options.method === 'POST'), false);
});

test('invalid data, expired credentials and rate limits fail without blind dispatches or response-body leaks', async () => {
  for (const options of [{ fresh: 'invalid' }, { fresh: NOW + 7200000 }, { published: 'invalid' },
    { failure: '/runs' }, { failure: '/state.json' }, { failure: '/releases/tags/dataset' }]) {
    const { run, calls } = fixture(options);
    await assert.rejects(run({ dispatch: true }), error => !/Do not print/.test(error.message));
    assert.equal(calls.some(call => call.options.method === 'POST'), false);
  }
  await assert.rejects(fixture({ fresh: NOW - 7200000 }).run({ dispatch: true, token: undefined }), /GITHUB_TOKEN/);
  await assert.rejects(fixture({ fresh: NOW - 7200000, dispatchStatus: 403 }).run({ dispatch: true }), /dispatch failed: HTTP 403/);
});

test('monthly history verification stays below the free-plan subrequest budget', async () => {
  const now = Date.parse('2026-12-02T20:43:00Z');
  const runs = Array.from({ length: 40 }, (_, id) => ({ id, status: 'completed', conclusion: 'success',
    event: 'workflow_dispatch', updated_at: iso(now - 60000) }));
  const { run, calls } = fixture({ now, runs });
  assert.equal((await run({ dispatch: true })).mode, 'monthly');
  assert.equal(calls.length, 44);
  const overflowing = fixture({ now, runs: [...runs, { ...runs[0], id: 50 }] });
  await assert.rejects(overflowing.run({ dispatch: true }), /Too many runs/);
});
