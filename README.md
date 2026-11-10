# Terramotos Portugal

Every recorded earthquake in mainland Portugal, the Azores and Madeira since 1909, drawn as a
seismograph drum: newest line on top, scroll down to go back in time. New earthquakes appear live.

The page is in English and Portuguese, in light and dark. The address bar always holds a link to
the current view (`#s=1d&m=3&r=1` for the line length and filters, then `q=` for a pinned
earthquake or `t=` for a point in time), so any earthquake or moment can be shared.

## Sources

Only official and primary catalogues, in this order of precedence when several report the same
earthquake (same event = within 30 s and 100 km):

| Source | Covers | Used for |
|---|---|---|
| [IPMA](https://www.ipma.pt/pt/geofisica/sismicidade/) open data | last ~30 days | Portugal's official agency: location, magnitude, felt intensity |
| [ISC Bulletin](https://www.isc.ac.uk/) | 1900 → now | The archive. IPMA's own magnitudes (agency codes LIS, INMG) win wherever IPMA reported one; otherwise Mw, otherwise the ISC's preferred magnitude |
| [EMSC](https://www.seismicportal.eu/) | 1998 → now | Recent events, event pages, and the live feed in the browser |
| [USGS](https://earthquake.usgs.gov/) | 1900 → now | Moment magnitudes (Mw) for large earthquakes |

All four are free to use with attribution, which the page footer gives. The coastlines on the
small map come from [Natural Earth](https://www.naturalearthdata.com/) (public domain), simplified
and stored in the page itself.

## How it stays up to date

| When | Command | What it does |
|---|---|---|
| In the browser, continuously | — | The page listens to EMSC's live feed and shows new earthquakes within a minute or two, marked *preliminary*. It checks `data/meta.json` every 2 minutes and swaps in the stored version when it appears. |
| Every 10 minutes | `python3 update.py live` | IPMA's feed + the last 2 days of EMSC |
| Daily | `python3 update.py daily` | + the last 60 days of EMSC and USGS (revisions and deletions) |
| Monthly | `python3 update.py monthly` | + the last 3 years of the ISC Bulletin, which reviews about 2 years behind |
| Once | `python3 update.py backfill` | Everything since 1900 (about an hour from scratch; the ISC is slow) |

IPMA's open data only keeps about 30 days. Anything not saved in that window only comes back
through the ISC about two years later, so the 10-minute job matters.

The database (`data/quakes.sqlite`) keeps every source's raw records. Each run replaces a source's
records for the time window it re-read, so revised and deleted events are picked up, then rebuilds
the merged earthquakes for the days that changed. Earthquake ids (like `19690228-c63c`) stay the
same across rebuilds.

## Running it locally

Python 3.9+ with the standard library only.

```bash
python3 update.py backfill        # first time: builds data/quakes.sqlite and seismograph/data/
python3 update.py live            # then as often as you like
python3 -m http.server 8000 --directory seismograph   # open http://localhost:8000
python3 update.py csv portugal_earthquakes.csv        # every earthquake as a CSV
```

## Hosting on GitHub Pages

1. Push this folder to a GitHub repository (branch `main`).
2. Settings → Pages → *Build and deployment* → Source: **GitHub Actions**.
3. Actions → *Update earthquakes* → *Run workflow* → mode **backfill** (the first run takes about an hour).

After that, `.github/workflows/update.yml` runs on its own: every 10 minutes, daily and monthly.
The database lives in the Actions cache; if it ever expires, the next run rebuilds it with a backfill.

Things to know:
- GitHub runs scheduled jobs on a best-effort basis; delays of 5–30 minutes happen. The live feed
  in the browser covers the gap.
- On a public repository, GitHub pauses scheduled workflows after 60 days without a commit. Any
  commit (or re-enabling the workflow) starts them again.
- Any other static host works the same way: run `update.py` on a schedule and serve `seismograph/`.

## Files

- `update.py`: the command line
- `quake/sources.py`: readers for IPMA, the ISC, EMSC and USGS
- `quake/store.py`: the database, merging, ids, and the site/CSV export
- `quake/regions.py`: the three region outlines
- `seismograph/index.html`: the page; it reads `seismograph/data/meta.json` and one file per year
  from `seismograph/data/years/`, loaded as you scroll

## Data notes

- Before the 1960s only large earthquakes were recorded, and most records before 1990 have no magnitude.
- Magnitudes are on mixed scales (ML, mb, Ms, Mw). The CSV has a separate `mw` column.
- About 0.5% of events are pairs very close in time and place that the ISC itself lists as separate events.
- Times are UTC.
