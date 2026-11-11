# Terramotos Portugal

Every recorded earthquake in mainland Portugal, the Azores and Madeira since 1909, drawn as a
seismograph drum: newest line on top, scroll down to go back in time. Switch to the list to browse
individual earthquakes, newest first. Both views load years as needed. New earthquakes appear live.

The map adds three fixed geographic panels using the bundled coastlines, with precise centre
dots, magnitude-scaled outer circles, and a separate scale for each region. It opens on the last
24 hours; the period control
also offers 7 days, 30 days and a year. Entering from a historical drum or list carries its visible
period and selected earthquake across. Rolling map periods keep a stable address (`#v=map` for
24 hours, `#v=map&period=7d` for a week). The earthquake card's Copy link button captures exact
UTC `from` and `to` dates so the recipient reopens the same period, while the original map keeps
rolling. Historical map addresses also retain their exact dates. Dots can be selected by touch
or with the arrow keys.

The panels show Portugal with its neighbours, the main cities and islands, and the plate boundaries
that explain where the earthquakes are. Active faults and volcanoes can be switched on under the
maps, and the choice is remembered. Each panel zooms on its own: the + and − buttons, a pinch,
Ctrl + scroll, or + and − on the keyboard; once zoomed, drag (or Shift + arrows) to move.

The map's period runs from 24 hours to the whole record ("All"). The play button under the maps
fills the period in through time; the playhead is paced half by time and half by earthquakes, so
quiet decades pass quickly. Earthquakes can be coloured by depth or by age (`c=depth`, `c=age`),
on one hue from light to dark. On a crowded panel only the larger earthquakes keep their circle.

With a year per line, the seismograph draws earthquakes below magnitude 3 as a low grey profile
and writes the magnitude on those of 5 or more.

**Statistics** (`#v=stats`, `sp=10y|1y|30d` for the period) counts what the magnitude and region
filters match: earthquakes and energy per year, month or day, the spread of magnitudes and the
busiest days. Bars and days open on the seismograph. Energy is an estimate, log E = 1.5 M + 4.8.

**Near a place** (`#near=<town>&km=<25|50|100|200>`): the pin button in the header keeps only the
earthquakes within a distance of a town, in every view, and the card then shows how far each one
is from it. The towns are Portugal's 308 municipalities, in `site/places.json`. "Use my location"
picks the nearest town in the browser; the position itself is never stored, sent or put in a link.
Distances need every year's data, so choosing a town fetches the whole catalogue (about 5 MB
before compression).

**Earthquake pages** (`/sismo/<id>` and `/en/sismo/<id>`): every earthquake in the catalogue has a page with its
details, a locator map, the other earthquakes within 50 km in the week before and after, and links
that open the seismograph, the map and the list at that earthquake. It opens from the card
("Details"). An earthquake with a text of its own is a **story**: the text is a Markdown file in
`content/quakes/`, one per language, and those earthquakes are listed in the Jump menu.
On the published homepage, **Browse catalogue** links to the six most recent
catalogued earthquakes, the stories, and the [archive by year](https://terramotos.com/en/archive/)
([Português](https://terramotos.com/arquivo/)). The archive lists every event in UTC order, 100
per page; a list of date ranges on the first page of each year links directly to its other pages.
These links work without JavaScript. See [content/README.md](content/README.md) for the story format.

That geography is `site/map.json` (25 KB), fetched the first time the map is opened, and
`site/faults.json` (22 KB), fetched only when the faults are switched on. Both are built by
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

Earthquake data follows the source-specific terms in [DATA.md](DATA.md), with attribution in the
page footer. The coastlines come
from [Natural Earth](https://www.naturalearthdata.com/) (public domain). The town locations in
`site/places.json` are from [GeoNames](https://www.geonames.org/) (CC BY 4.0). The plate boundaries are
from Bird, P. (2003), *An updated digital model of plate boundaries*, as converted by Hugo Ahlenius,
Nordpil ([tectonicplates](https://github.com/fraxen/tectonicplates), Open Data Commons Attribution
License). The active faults are derived from the
[GEM Global Active Faults Database](https://github.com/GEMScienceTools/gem-global-active-faults)
(Styron and Pagani, Global Earthquake Model Foundation) under CC BY-SA 4.0, so
`site/faults.json` stays under that licence. The volcanoes are from the Smithsonian
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

Subscribe to [Terramotos Portugal RSS](https://terramotos.com/rss.xml) in a feed
reader or another tool. The page also advertises the feed automatically and links to it in the footer.

`site/rss.xml` contains the 100 most recent merged earthquakes, newest first, with no
magnitude filter. Each item links to the earthquake's permanent page and includes its UTC time, magnitude
and scale, region, location, depth, coordinates, sources, and felt intensity when available.
The feed is in Portuguese. Revisions retain the same GUID, including after rebuilding the database
from the archive, so feed readers can recognise an updated earthquake.

Every successful update or `python3 update.py export` rebuilds the feed alongside the site data.
The hourly job publishes it to Cloudflare; it does not use the browser's live connection.
The feed suggests a 60-minute refresh interval. When hosting elsewhere, pass
`--site-url https://example.org/terramotos/` to set the absolute feed and earthquake links.

## Usage counts

The private dashboard is [terramotos.goatcounter.com](https://terramotos.goatcounter.com/).
The production site sends cookieless counts using GoatCounter's
[documented pixel endpoint](https://www.goatcounter.com/help/pixel); it does not load a third-party
script. The endpoint is the public `goatcounter` meta tag in `site/index.html`, not a secret.

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
- `site/data/` is what the page reads: `meta.json` and one file per year.
- `site/rss.xml` is the RSS feed. It is generated and published with the site, and is not
  committed to the source branch.

Each run replaces a source's records for the time window it re-read, so revised and deleted events
are picked up, then rebuilds the merged earthquakes for the days that changed.

## Running it locally

Python 3.9+ with the standard library only.

```bash
python3 update.py backfill        # first time: builds data/quakes.sqlite and site/data/
python3 update.py live            # then as often as you like
python3 update.py live --archive archive   # the same, also keeping the plain-file archive
python3 -m http.server 8000 --directory site   # open http://localhost:8000
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
npm run lint
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

## Hosting on Cloudflare

The production address is `https://terramotos.com/`. The `terramotos-portugal` Worker serves the
app and renders one complete HTML page for each earthquake at `/sismo/<id>` (Portuguese) and
`/en/sismo/<id>` (English). These addresses keep the permanent catalogue id even if a magnitude
or place name is revised. The pages share the app's locator map, place translations and Markdown
story text. They include canonical and language-alternate links and per-earthquake preview text.
Each page also has its own preview image for link previews, at the page's address plus `.png`
(magnitude, place, date and a locator map, in the page's language). The Worker draws it on
request in `hosting/preview.mjs`, with no image library, and Cloudflare keeps it for a day. The
letter shapes come from `hosting/font.mjs`, generated from the Inter font by
`node tools/build_font.mjs`; rerun that only to change the sizes or the characters.

```bash
npm ci
python3 update.py export --archive archive
npm run build
npm run dev:hosting
```

`tools/build_site.py` writes `dist/cloudflare/`: the static app with versioned modules, prepared
earthquake data, the RSS feed and split sitemaps. The build renders Portuguese at `/` and English
at `/en/`, with links to the year archive, three regional pages, and the dataset methodology in each
language. Nearby earthquakes are calculated during the build, so a page request makes one asset lookup instead of searching the
catalogue. Data is grouped into eight files per month to stay within the Workers Free asset count
and file-size limits. The Worker is checked with `npm run test:hosting`; `npm run deploy` builds
and publishes through the pinned Wrangler version.

The hourly/daily/monthly update job publishes to Cloudflare. It uses encrypted repository secret
`CLOUDFLARE_API_TOKEN`, scoped to **Individual Workers Editor** on **terramotos-portugal** only.
The public account id is set in `wrangler.jsonc`. All requests reach the Worker first so both
alternate hostnames can redirect static files as well as event pages.
Domain connections are configured once in Cloudflare; routine deployments
do not alter DNS or require DNS permissions. Renew the deployment token before its expiry.

Each run checks out the `data` branch, rebuilds the database, fetches new records, commits what
changed and publishes the site. With no archive yet, the first run backfills the catalogue.
GitHub's schedules are best effort; the independent Cloudflare watchdog described above covers
missed updates. The app also reads the live feeds between deployments.

## Files

- `update.py`: the command line
- `scheduler/`: independent hourly Cloudflare watchdog, local freshness check, and tests
- `hosting/`: the Cloudflare earthquake-page server and its checks
- `wrangler.jsonc`: the site Worker's account, asset binding and routing configuration
- `tools/build_site.py`: prepares the Cloudflare assets, page data and sitemaps
- `tools/build_places.py`: builds `site/places.json`, the towns for "Near a place"
- `tools/build_map.py`: builds `site/map.json` (land, plate boundaries, volcanoes, labels) and
  `site/faults.json` (active faults)
- `quake/sources.py`: readers for IPMA, the ISC, EMSC and USGS
- `quake/store.py`: the database, merging, ids, and the site/CSV export
- `quake/rss.py`: builds the RSS feed from the merged catalogue
- `quake/regions.py`: the three region outlines
- `site/index.html`: the page's markup; it reads `site/data/meta.json` and one file per year
  from `site/data/years/`, loaded as you scroll
- `site/app.css`: the styles, with the light and dark colours as variables at the top
- `site/js/`: the page's code as native ES modules, with no framework.
  `main.js` is the entry point. `state.js` holds the state that more than one module changes;
  everything else is imported by name. One module per concern: `store.js` (the catalogue in
  memory), `feeds.js` (IPMA, EMSC and the site's own data), `drum.js`, `list.js`, `stats.js` and
  `map/` (the views), `card.js`, `selection.js`, `url.js`, `controls.js`, `views.js`, `theme.js`,
  `page.js` (the earthquake page), `near.js` (the near-a-place filter), `i18n.js` with `text.js` (every string, in both languages),
  and `content/land.js` (the locator coastlines). Each file starts with a line saying what it is for.
  `npm run lint` checks that every name is imported and that no module writes to another's
  variables. When the site is published, the workflow gives `js/` and `app.css` an address that
  changes with their content, so browsers never mix old and new files.
- `content/quakes/`: the stories, as Markdown; `tools/build_content.py` turns them into
  `site/content/` (an index and one HTML fragment per text)
- `site/analytics.js`: cookieless counts for the view and language, enabled only in production

## The dataset

The whole catalogue is one download, replaced daily:
[terramotos-portugal.zip](https://github.com/andredelgado/terramotos/releases/download/dataset/terramotos-portugal.zip) (a CSV and a README). [DATA.md](DATA.md) describes the columns,
how records are merged, and the terms: non-commercial use with credit to the four sources.

## Data notes

- Before the 1960s only large earthquakes were recorded, and most records before 1990 have no magnitude.
- Magnitudes are on mixed scales (ML, mb, Ms, Mw). The CSV has a separate `mw` column.
- About 0.5% of events are pairs very close in time and place that the ISC itself lists as separate events.
- Times are UTC.

## Licence

The project's original source code and documentation are licensed under the
[MIT Licence](LICENSE), copyright © 2026 André Delgado.

Data and third-party components retain their separate terms:

- The earthquake catalogue, archive, generated JSON, CSV downloads and RSS feed follow the
  [dataset terms](DATA.md).
- Map data in `site/map.json` and the embedded coastlines follow the source terms listed
  under [Sources](#sources). `site/faults.json` remains under
  [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), with credit to the GEM Global
  Active Faults Database.
- Third-party dependencies retain their own licences and notices.
