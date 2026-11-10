# External update watchdog

This Worker supplies an hourly trigger independently of GitHub's scheduler. It calls the existing
`andredelgado/terramotos` workflow on `main`; fetching, archiving and publishing still run in GitHub
Actions. The site stays on GitHub Pages. No public Worker URL or database is needed.

Cloudflare invokes it at minute 43 of every hour, in UTC. It checks:

1. Whether an update is already queued or running. If so, it skips this invocation.
2. The archive's `state.json` and the dataset ZIP's actual publication timestamp.
3. On the 2nd, from 05:00 UTC, whether a monthly/backfill job succeeded that UTC day. If one has
   not, it dispatches `monthly`, retrying on the next hourly invocation if needed.
4. From 04:00 UTC, whether the ZIP has been published that UTC day. If not, it dispatches `daily`.
5. Otherwise, whether the archive is at least 45 minutes old. If so, it dispatches `live`.

This gives GitHub's 03:23 daily and 04:47 monthly schedules time to run first. Monthly takes
precedence over daily, and daily over live. A push that only exports the page does not count as
a data update. API failures fail visibly instead of starting a blind update. GitHub's existing
concurrency group continues to prevent overlapping update jobs.

## Check locally

Node.js 24 LTS is recommended. The check and tests need no third-party packages:

```bash
node scheduler/check.mjs                 # read-only; never dispatches
node --test scheduler/watchdog.test.mjs
node scheduler/check.mjs --dispatch      # dispatch only if needed; uses your existing gh login
```

Tests mock every network call. The local CLI keeps the GitHub token in the process, without
printing it or passing it as a command-line argument. The cloud deployment uses a separate,
repository-scoped token.

## Activate on Cloudflare

The files alone do not activate a schedule. Use a permanent Cloudflare account:

```bash
cd scheduler
npm ci
npx wrangler login
```

On a new Cloudflare account, open **Workers & Pages** once to initialize its free `workers.dev`
namespace. Cloudflare requires this account setup for Cron Triggers even though this Worker's
public HTTP and preview routes are disabled. The deployed account's namespace is
`andredelgado.workers.dev`.

Create a [fine-grained GitHub token](https://github.com/settings/personal-access-tokens/new)
limited to **andredelgado/terramotos**, with **Actions: read and write**. Contents write permission
is not needed. Enter it in a local `scheduler/.secrets.production.json` file (ignored by git):

```json
{"GITHUB_TOKEN": "YOUR_REPOSITORY_SCOPED_TOKEN"}
```

Deploy the code, secret and schedule together:

```bash
npm run deploy -- --secrets-file .secrets.production.json
```

If multiple accounts are available, set `account_id` in `wrangler.jsonc` to the intended account
before deploying. A deployment without the required secret is rejected. Subsequent deployments
preserve the secret, so `npm run deploy` is sufficient once it is configured.

To rotate the GitHub token before it expires, replace its value in the ignored local secret file
and deploy again with `--secrets-file .secrets.production.json`.

## Confirm it is running

In Cloudflare, open **Workers & Pages → terramotos-update-watchdog → Triggers** and confirm the
hourly Cron Trigger. Open **Observability → Logs** after the next invocation. Each invocation logs
`earthquake-watchdog` with a `skip` or `dispatched` action and its reason; errors log
`earthquake-watchdog-failed`. Logs and traces are enabled. Cloudflare notes that Cron Trigger changes
can take [up to 15 minutes to propagate](https://developers.cloudflare.com/workers/configuration/cron-triggers/).

A dispatch returns the GitHub run link. Confirm that run's update and dataset steps, the `data`
branch commit time, and the dataset asset timestamp. External runs have the `workflow_dispatch`
event; GitHub's native timer has the `schedule` event. A successful deployment or export alone does
not confirm that fresh records were fetched.

To disable the external trigger, set `triggers.crons` to `[]` and deploy. GitHub's native schedules
are left in place.
