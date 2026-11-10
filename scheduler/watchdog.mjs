// Runs outside GitHub's scheduler. All dispatches target the existing workflow on main.
const REPO = 'andredelgado/terramotos';
const WORKFLOW = 'actions/workflows/update.yml';
const API = 'https://api.github.com/repos/' + REPO + '/';
const ARCHIVE = 'https://raw.githubusercontent.com/' + REPO + '/data/state.json';
const HOUR = 3600000;

export async function checkUpdates({ token, now = Date.now(), dispatch = false, fetchImpl = fetch } = {}) {
  if (!Number.isFinite(now)) throw new Error('Invalid check time');
  const date = new Date(now), today = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'terramotos-update-watchdog',
    'X-GitHub-Api-Version': '2026-03-10' };
  if (token) headers.Authorization = 'Bearer ' + token;

  async function json(path, { missing = false } = {}) {
    // Workers supports manual/follow redirects. Reject non-2xx responses without forwarding credentials.
    const response = await fetchImpl(API + path, { headers, redirect: 'manual' });
    if (missing && response.status === 404) return null;
    if (!response.ok) throw new Error('GitHub read failed: HTTP ' + response.status);
    return response.json();
  }

  const activity = await json(WORKFLOW + '/runs?branch=main&per_page=100');
  if (!Array.isArray(activity.workflow_runs)) throw new Error('Invalid workflow history');
  const busy = activity.workflow_runs.find(run => run.status !== 'completed');
  if (busy) return { action: 'skip', reason: 'An update is already queued or running', run: busy.html_url };

  const archive = await fetchImpl(ARCHIVE, { headers: { 'Cache-Control': 'no-cache' }, redirect: 'manual' });
  if (!archive.ok) throw new Error('Archive read failed: HTTP ' + archive.status);
  const state = await archive.json(), fresh = Date.parse(state.fresh_at);
  if (!Number.isFinite(fresh) || fresh > now + HOUR) throw new Error('Invalid archive freshness timestamp');

  const release = await json('releases/tags/dataset', { missing: true });
  const asset = release?.assets?.find(asset => asset.name === 'terramotos-portugal.zip');
  const published = asset ? Date.parse(asset.updated_at) : 0;
  if (!Number.isFinite(published)) throw new Error('Invalid dataset freshness timestamp');

  let mode, reason;
  // Retry throughout the due day if a source or a previous workflow failed.
  if (date.getUTCDate() === 2 && date.getUTCHours() >= 5) {
    const candidates = activity.workflow_runs.filter(run => run.event !== 'push' && run.conclusion === 'success' &&
      Date.parse(run.updated_at) >= today);
    if (candidates.length > 40) throw new Error('Too many runs to safely verify the monthly update');
    let monthly = false;
    for (const run of candidates) {
      if (!Number.isSafeInteger(run.id)) throw new Error('Invalid workflow run ID');
      const jobs = await json('actions/runs/' + run.id + '/jobs?per_page=100');
      if (!Array.isArray(jobs.jobs)) throw new Error('Invalid workflow job history');
      if (jobs.jobs.some(job => job.conclusion === 'success' && job.steps?.some(step =>
        /^Update \((monthly|backfill)\)$/.test(step.name) && step.conclusion === 'success'))) {
        monthly = true; break;
      }
    }
    if (!monthly) { mode = 'monthly'; reason = 'No successful monthly update today'; }
  }
  if (!mode && date.getUTCHours() >= 4 && published < today) {
    mode = 'daily'; reason = 'The dataset has not been published today';
  }
  if (!mode && now - fresh >= 45 * 60000) {
    mode = 'live'; reason = 'The archive is at least 45 minutes old';
  }
  if (!mode) return { action: 'skip', reason: 'Archive and dataset are fresh', freshAt: state.fresh_at };
  if (!dispatch) return { action: 'would_dispatch', mode, reason };
  if (!token) throw new Error('GITHUB_TOKEN is required to dispatch an update');

  const response = await fetchImpl(API + WORKFLOW + '/dispatches', { method: 'POST', redirect: 'manual',
    headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: 'main', inputs: { mode } }) });
  if (!response.ok) throw new Error('GitHub dispatch failed: HTTP ' + response.status);
  const result = response.status === 204 ? {} : await response.json();
  return { action: 'dispatched', mode, reason, run: result.html_url };
}

export default {
  async scheduled(controller, env) {
    try {
      if (!env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN secret is missing');
      const result = await checkUpdates({ token: env.GITHUB_TOKEN, now: controller.scheduledTime, dispatch: true });
      console.log(JSON.stringify({ event: 'earthquake-watchdog', ...result }));
    } catch (error) {
      console.error(JSON.stringify({ event: 'earthquake-watchdog-failed', message: error.message }));
      throw error;
    }
  },
};
