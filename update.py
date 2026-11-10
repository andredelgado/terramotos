#!/usr/bin/env python3
"""
Keep the Portuguese earthquake catalogue up to date and write the site's data files.

  python3 update.py backfill   everything since 1900 (ISC is slow: about an hour from scratch)
  python3 update.py live       IPMA's feed + the last 2 days of EMSC        (every few minutes)
  python3 update.py daily      live + the last 60 days of EMSC and USGS     (once a day)
  python3 update.py monthly    daily + the last 3 years of ISC and USGS     (once a month)
  python3 update.py export     only rewrite the site files
  python3 update.py csv FILE   write every earthquake to a CSV file

Options: --db data/quakes.sqlite  --site seismograph  --cache cache (raw downloads, backfill only)

Sources and precedence: IPMA (official, last ~30 days), ISC Bulletin (1900 on, IPMA's magnitudes
where IPMA reported them), EMSC (1998 on), USGS (1900 on, moment magnitudes). Standard library only.
"""
import argparse
import datetime as dt
import os
import sys
import time

from quake import sources
from quake.store import Store, year_start

DAY = 86400


def log(*a):
    print(*a, file=sys.stderr)


def now():
    return time.time()


def this_year():
    return dt.datetime.now(dt.timezone.utc).year


def stamp(store):
    store.set("fresh_at", dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))


def run_live(store):
    log("IPMA…")
    recs, (t0, t1) = sources.ipma()
    store.replace("ipma", t0, t1, recs)
    log("EMSC, last 2 days…")
    t0, t1 = now() - 2 * DAY, now() + 3600
    store.replace("emsc", t0, t1, sources.emsc(t0, t1))
    stamp(store)


def run_daily(store):
    run_live(store)
    t0, t1 = now() - 60 * DAY, now() + 3600
    log("EMSC, last 60 days…")
    store.replace("emsc", t0, t1, sources.emsc(t0, t1))
    log("USGS, last 60 days…")
    store.replace("usgs", t0, t1, sources.usgs(t0, t1))


def run_monthly(store):
    run_daily(store)
    y = this_year()
    for year in range(y - 2, y + 1):  # the ISC reviews about two years behind
        log(f"ISC {year}…")
        store.replace("isc", year_start(year), year_start(year + 1), sources.isc(year, year))
    log("USGS, last 3 years…")
    t0, t1 = year_start(y - 2), now() + 3600
    store.replace("usgs", t0, t1, sources.usgs(t0, t1))


def run_backfill(store, cache):
    y = this_year()
    cached = lambda last, name: os.path.join(cache, name) if last < y else None  # never cache the current year

    log("ISC (one request per year from 1960)…")
    chunks = [(1900, 1949), (1950, 1959)] + [(k, k) for k in range(1960, y + 1)]
    for y0, y1 in chunks:
        recs = sources.isc(y0, y1, cache if y1 < y else None)
        store.replace("isc", year_start(y0), year_start(y1 + 1), recs)
        store.db.commit()

    log("EMSC (from 1998)…")
    for k in range(1998, y + 1):
        t0, t1 = year_start(k), year_start(k + 1)
        store.replace("emsc", t0, t1, sources.emsc(t0, t1, cached(k, f"emsc-{k}-pt.txt")))
    store.db.commit()

    log("USGS…")
    for y0, y1 in ((1900, 1997), (1998, y)):
        t0, t1 = year_start(y0), year_start(y1 + 1)
        store.replace("usgs", t0, t1, sources.usgs(t0, t1, cached(y1, f"usgs-{y0}-{y1}-pt.json")))

    run_live(store)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("mode", choices=["backfill", "live", "daily", "monthly", "export", "csv"])
    ap.add_argument("file", nargs="?", help="output file for csv")
    ap.add_argument("--db", default=os.path.join("data", "quakes.sqlite"))
    ap.add_argument("--site", default="seismograph")
    ap.add_argument("--cache", default="cache", help="raw downloads kept between backfills")
    a = ap.parse_args()

    store = Store(a.db)
    try:
        if a.mode == "csv":
            store.export_csv(a.file or "portugal_earthquakes.csv")
            log(f"wrote {a.file or 'portugal_earthquakes.csv'}")
            return
        if a.mode != "export":
            started = now()
            {"backfill": lambda: run_backfill(store, a.cache), "live": lambda: run_live(store),
             "daily": lambda: run_daily(store), "monthly": lambda: run_monthly(store)}[a.mode]()
            log("Rebuilding changed days…")
            spans = store.rebuild_dirty()
            store.db.commit()
            log(f"  {len(spans)} span(s) rebuilt in {now() - started:.0f}s")
        store.export_site(a.site)
        store.db.commit()
    finally:
        store.close()


if __name__ == "__main__":
    main()
