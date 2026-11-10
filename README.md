# Terramotos Portugal

Every recorded earthquake in mainland Portugal, the Azores and Madeira since 1909, drawn as a
seismograph drum: newest line on top, scroll down to go back in time. Switch to the list to browse
individual earthquakes, newest first. Both views load years as needed. New earthquakes appear live.

The map adds three fixed geographic panels using the bundled coastlines, with precise centre
dots, magnitude-scaled outer circles, and a separate scale for each region. It opens on the last
24 hours; the period control
also offers 7 days, 30 days and a year. Entering from a historical drum or list carries its visible
period and selected earthquake across. Shared map links include exact UTC `from` and `to` dates,
so they reopen the same period. Dots can be selected by touch or with the arrow keys.

The panels show Portugal with its neighbours, the main cities and islands, and the plate boundaries
that explain where the earthquakes are. Active faults and volcanoes can be switched on under the
maps, and the choice is remembered. Each panel zooms on its own: the + and − buttons, a pinch,
Ctrl + scroll, or + and − on the keyboard; once zoomed, drag (or Shift + arrows) to move.

That geography is `seismograph/map.json` (25 KB), fetched the first time the map is opened, and
`seismograph/faults.json` (22 KB), fetched only when the faults are switched on. Both are built by
`python3 tools/build_map.py`.

The page is in English and Portuguese, in light and dark. The address bar always holds a link to
the current view (`#v=list` for the list, `s=1d&m=3&r=1` for the line length and filters, then `q=`
for a pinned earthquake or `t=` for a UTC point in time), so any earthquake or moment can be shared.
The timeline, filters and selected earthquake carry across views. Use left/right arrow keys on
the drum or up/down in the list to select earthquakes; Escape closes the details.

## Sources

Only official and primary catalogues, in this order of precedence when several report the same
earthquake (same event = within 30 s and 100 km):

| Source | Covers | Used for |
|---|---|---|
| [IPMA](https://www.ipma.pt/pt/geofisica/sismicidade/) open data | last ~30 days | Portugal's official agency: location, magnitude, felt intensity |
| [ISC Bulletin](https://www.isc.ac.uk/) | 1900 → now | The archive. IPMA's own magnitudes (agency codes LIS, INMG) win wherever IPMA reported one; otherwise Mw, otherwise the ISC's preferred magnitude |
| [EMSC](https://www.seismicportal.eu/) | 1998 → now | Recent events, event pages, and the live feed in the browser |
| [USGS](https://earthquake.usgs.gov/) | 1900 → now | Moment magnitudes (Mw) for large earthquakes |

All four are free to use with attribution, which the page footer gives. The coastlines come
from [Natural Earth](https://www.naturalearthdata.com/) (public domain). The plate boundaries are
from Bird, P. (2003), *An updated digital model of plate boundaries*, as converted by Hugo Ahlenius,
Nordpil ([tectonicplates](https://github.com/fraxen/tectonicplates), Open Data Commons Attribution
License). The active faults are derived from the
[GEM Global Active Faults Database](https://github.com/GEMScienceTools/gem-global-active-faults)
(Styron and Pagani, Global Earthquake Model Foundation) under CC BY-SA 4.0, so
`seismograph/faults.json` stays under that licence. The volcanoes are from the Smithsonian
Institution's [Global Volcanism Program](https://volcano.si.edu), Volcanoes of the World. The
page's About dialog credits all of them.

## How it stays up to date

The page keeps itself current; the scheduled jobs keep the record.

The status shows the last successful data update, with exact UTC times for each source on hover.
After 15 minutes without fresh data it shows “Updates delayed”; losing the internet connection
shows “Offline”. It retries when the connection returns, including after an offline first load.

| When | Where | What it does |
|---|---|---|
| Continuously | the browser | Reads IPMA's feed (the official last ~30 days) every 5 minutes and listens to EMSC's live feed, so new earthquakes show within a minute or two even if no job has run. EMSC's are marked *preliminary*. |
| Every hour | `python3 update.py live` | Saves IPMA's feed + the last 2 days of EMSC |
| Daily | `python3 update.py daily` | + the last 60 days of EMSC and USGS (revisions and deletions) |
| Monthly | `python3 update.py monthly` | + the last 3 years of the ISC Bulletin, which reviews about 2 years behind |
| Once | `python3 update.py backfill` | Everything since 1900 (about an hour from scratch; the ISC is slow) |

IPMA's open data only keeps about 30 days. Anything not saved in that window only comes back
through the ISC about two years later, so the jobs exist to save it in time. A late or skipped run
loses nothing as long as one runs within those 30 days.

A source that is down does not stop the others: the run carries on with what it could fetch and
shows a warning. `python3 update.py check` fails once a source has been failing for more than a
day, which is how a long outage turns a scheduled run red.

GitHub's timer is best effort. The independent [update watchdog](scheduler/README.md) can trigger
the same workflow from Cloudflare when the archive or dataset falls behind, while skipping an
update that is already running. It needs its own deployment and repository-scoped Actions token;
committing these files does not enable it. `node scheduler/check.mjs` checks the live state without
starting a run. Check the archive and dataset timestamps to confirm a fetch; a successful push
deployment only exports the data already stored.

## RSS

Subscribe to [Terramotos Portugal RSS](https://andredelgado.github.io/terramotos/rss.xml) in a feed
reader or another tool. The page also advertises the feed automatically and links to it in the footer.

`seismograph/rss.xml` contains the 100 most recent merged earthquakes, newest first, with no
magnitude filter. Each item links to the selected earthquake and includes its UTC time, magnitude
and scale, region, location, depth, coordinates, sources, and felt intensity when available.
The feed is in Portuguese. Revisions retain the same GUID, including after rebuilding the database
from the archive, so feed readers can recognise an updated earthquake.

Every successful update or `python3 update.py export` rebuilds the feed alongside the site data.
The hourly job publishes it to GitHub Pages; it does not use the browser's live connection.
The feed suggests a 60-minute refresh interval. When hosting elsewhere, pass
`--site-url https://example.org/terramotos/` to set the absolute feed and earthquake links.

## Usage counts

The private dashboard is [terramotos.goatcounter.com](https://terramotos.goatcounter.com/).
The production site sends cookieless counts using GoatCounter's
[documented pixel endpoint](https://www.goatcounter.com/help/pixel); it does not load a third-party
script. The endpoint is the public `goatcounter` meta tag in `seismograph/index.html`, not a secret.

The dashboard's Pages section shows six paths:

| View | Portuguese | English |
|---|---|---|
| Seismograph | `/pt/seismograph` | `/en/seismograph` |
| List | `/pt/list` | `/en/list` |
| Map | `/pt/map` | `/en/map` |

Each combination is sent at most once per page open, after the catalogue loads and whenever the
view or interface language changes. Shared links open directly into the right combination.
Scrolling, filters, selected earthquakes, map dates and live updates do not produce extra counts.
These are view/language usage counts: adding them together does not give unique people.
GoatCounter also applies its own [visit deduplication](https://www.goatcounter.com/help/sessions).

The counter does not read or write cookies or browser storage. Requests omit credentials and
referrers, and do not include the actual page URL, query, hash, screen size or an identifier.
GoatCounter still receives the IP address and normal browser headers needed for the request;
its [privacy policy](https://www.goatcounter.com/help/privacy) describes its processing and optional
data-collection settings. The About dialog links to that policy in both languages.

Do Not Track and Global Privacy Control disable counting. Localhost, private previews, other
GitHub Pages projects, automated browsers and embedded frames are excluded. Hidden or offline
pages wait until visible and online. A blocked counter or failed request never blocks the page.
Counts start with the first production deployment containing this integration.

## Where the data lives

The archive is the database: plain files holding every record each source has given, one
`<source>/YYYY-MM.jsonl` per month, each record tagged with the id of the earthquake it belongs to.
On GitHub it is the `data` branch, committed after every run that changed something.

Everything else is derived from it and can be thrown away:

- `data/quakes.sqlite` is a working copy. With `--archive DIR`, an empty database is rebuilt from
  the archive in a few seconds, with the same earthquake ids (like `19690228-c63c`), so links to
  earthquakes keep working.
- `seismograph/data/` is what the page reads: `meta.json` and one file per year.
- `seismograph/rss.xml` is the RSS feed. It is generated and published with the site, and is not
  committed to the source branch.

Each run replaces a source's records for the time window it re-read, so revised and deleted events
are picked up, then rebuilds the merged earthquakes for the days that changed.

## Running it locally

Python 3.9+ with the standard library only.

```bash
python3 update.py backfill        # first time: builds data/quakes.sqlite and seismograph/data/
python3 update.py live            # then as often as you like
python3 update.py live --archive archive   # the same, also keeping the plain-file archive
python3 -m http.server 8000 --directory seismograph   # open http://localhost:8000
python3 update.py csv portugal_earthquakes.csv        # every earthquake as a CSV
```

## Checks

The backend checks use the Python standard library and need no downloaded catalogue:

```bash
python3 -m unittest discover -s tests -p 'test_*.py'
```

They check the RSS export, merged events, revisions, archive rebuilds, escaping and command-line
export. `.github/workflows/python.yml` runs them on Python 3.9 and 3.12; the update job also runs
them before fetching or publishing data.

For the browser checks, with Node.js 24 LTS and Python 3 installed:

```bash
npm ci
npm run test:analytics
npx playwright install chromium webkit
npm test
```

The suite starts its own server on port 8765 and uses a fixed catalogue and mocked feeds, so it
does not need the downloaded dataset or an internet connection. It covers desktop Chromium,
a 320px Android layout, and iPhone WebKit: links, filters, keyboard and touch selection, themes,
translations, live updates, failed requests, and offline recovery.

`.github/workflows/browser.yml` runs the checks on relevant pushes and pull requests, and keeps
the report and failure traces for seven days. `npm run test:ui` opens the interactive test runner.
The analytics checks run with Node's test runner and mocked requests; they never send test visits
to the real counter.

## Hosting on GitHub Pages

1. Push this folder to a GitHub repository (branch `main`).
2. Settings → Pages → *Build and deployment* → Source: **GitHub Actions**.
3. Actions → *Update earthquakes* → *Run workflow*. With no `data` branch yet, the first run is a
   backfill (about an hour) and creates it.

After that, `.github/workflows/update.yml` runs on its own: hourly, daily and monthly. Each run
checks out the `data` branch, rebuilds the database from it, fetches, commits what changed and
publishes the site. Nothing is kept in caches.

Things to know:
- GitHub runs scheduled jobs on a best-effort basis; delays and skipped runs happen. The page does
  not depend on them to be current.
- On a public repository, GitHub pauses scheduled workflows after 60 days without activity. Any
  commit (or re-enabling the workflow) starts them again.
- Any other static host works the same way: run `update.py --archive DIR` on a schedule, keep
  `DIR` somewhere durable, and serve `seismograph/`.

## Files

- `update.py`: the command line
- `scheduler/`: independent hourly Cloudflare watchdog, local freshness check, and tests
- `tools/build_map.py`: builds `seismograph/map.json` (land, plate boundaries, volcanoes, labels) and
  `seismograph/faults.json` (active faults)
- `quake/sources.py`: readers for IPMA, the ISC, EMSC and USGS
- `quake/store.py`: the database, merging, ids, and the site/CSV export
- `quake/rss.py`: builds the RSS feed from the merged catalogue
- `quake/regions.py`: the three region outlines
- `seismograph/index.html`: the page; it reads `seismograph/data/meta.json` and one file per year
  from `seismograph/data/years/`, loaded as you scroll
- `seismograph/analytics.js`: cookieless counts for the view and language, enabled only in production

## The dataset

The whole catalogue is one download, replaced daily:
[terramotos-portugal.zip](https://github.com/andredelgado/terramotos/releases/download/dataset/terramotos-portugal.zip) (a CSV and a README). [DATA.md](DATA.md) describes the columns,
how records are merged, and the terms: non-commercial use with credit to the four sources.

## Data notes

- Before the 1960s only large earthquakes were recorded, and most records before 1990 have no magnitude.
- Magnitudes are on mixed scales (ML, mb, Ms, Mw). The CSV has a separate `mw` column.
- About 0.5% of events are pairs very close in time and place that the ISC itself lists as separate events.
- Times are UTC.
