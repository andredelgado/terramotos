#!/usr/bin/env python3
"""
Keep the Portuguese earthquake catalogue up to date and write the site's data files.

  python3 update.py backfill   everything since 1900 (ISC is slow: about an hour from scratch)
  python3 update.py live       IPMA's feed + the last 2 days of EMSC        (every few minutes)
  python3 update.py daily      live + the last 60 days of EMSC and USGS     (once a day)
  python3 update.py monthly    daily + the last 3 years of ISC and USGS     (once a month)
  python3 update.py export     only rewrite the site files
  python3 update.py csv FILE   write every earthquake to a CSV file
  python3 update.py check      fail if a source has been failing for more than a day

Options: --db data/quakes.sqlite  --site seismograph  --cache cache (raw downloads, backfill only)
         --archive DIR  plain-file copy of every source record (off by default). Written after each
                        update; when the database is empty it is rebuilt from these files first,
                        with the same earthquake ids, so the database is only ever a cache.

A source that fails does not stop the others: the run carries on, warns, and remembers since when
that source has been failing. Only a backfill's history downloads are all-or-nothing.

Sources and precedence: IPMA (official, last ~30 days), ISC Bulletin (1900 on, IPMA's magnitudes
where IPMA reported them), EMSC (1998 on), USGS (1900 on, moment magnitudes). Standard library only.
"""
import argparse
import datetime as dt
import os
import sys
import time

from quake import sources
from quake.rss import SITE_URL
from quake.store import Store, year_start

DAY = 86400


def log(*a):
    print(*a, file=sys.stderr)


def now():
    return time.time()


def this_year():
    return dt.datetime.now(dt.timezone.utc).year


SOURCES = ("ipma", "emsc", "usgs", "isc")
FAILING_TOO_LONG = DAY


def stamp(store):
    store.set("fresh_at", dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))


class Run:
    """One update. Each source is attempted on its own, so one being down does not stop the rest."""

    def __init__(self, store):
        self.store = store
        self.ok, self.failed = set(), {}

    def attempt(self, source, what, fn):
        """Run one fetch-and-store step; on failure undo it, note the source and carry on."""
        log(what + "…")
        dirty = len(self.store.dirty)
        try:
            fn()
            self.store.db.commit()
            self.ok.add(source)
        except Exception as e:  # network, parsing, an unexpected payload: all mean "not this time"
            self.store.db.rollback()
            del self.store.dirty[dirty:]
            self.failed[source] = f"{type(e).__name__}: {e}"
            log(f"  {source} failed: {self.failed[source]}")

    def finish(self):
        """Remember since when each failing source has failed. Returns False if nothing worked."""
        now_iso = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        for source in self.ok | set(self.failed):
            key = f"failing_{source}"
            if source in self.failed:
                since = self.store.get(key) or now_iso
                self.store.set(key, since)
                print(f"::warning title={source.upper()} failed::{self.failed[source]} (failing since {since})")
            else:
                self.store.set(key, "")
        self.store.db.commit()
        return bool(self.ok - set(self.failed)) or not self.failed


def check(store):
    """Exit status for the end of a scheduled run: 1 if a source has been failing for too long."""
    bad = 0
    for source in SOURCES:
        since = store.get(f"failing_{source}")
        if not since:
            continue
        age = now() - dt.datetime.strptime(since, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=dt.timezone.utc).timestamp()
        if age > FAILING_TOO_LONG:
            print(f"::error title={source.upper()} is down::{source} has failed on every run since {since}")
            bad = 1
        else:
            log(f"{source} has been failing since {since}")
    return bad


def run_live(run):
    store = run.store

    def ipma():
        recs, (t0, t1) = sources.ipma()
        store.replace("ipma", t0, t1, recs)

    def emsc():
        t0, t1 = now() - 2 * DAY, now() + 3600
        store.replace("emsc", t0, t1, sources.emsc(t0, t1))

    run.attempt("ipma", "IPMA", ipma)
    run.attempt("emsc", "EMSC, last 2 days", emsc)
    if run.ok & {"ipma", "emsc"}:
        stamp(store)
        store.db.commit()


def run_daily(run):
    run_live(run)
    store = run.store
    t0, t1 = now() - 60 * DAY, now() + 3600
    run.attempt("emsc", "EMSC, last 60 days", lambda: store.replace("emsc", t0, t1, sources.emsc(t0, t1)))
    run.attempt("usgs", "USGS, last 60 days", lambda: store.replace("usgs", t0, t1, sources.usgs(t0, t1)))


def run_monthly(run):
    run_daily(run)
    store = run.store
    y = this_year()
    for year in range(y - 2, y + 1):  # the ISC reviews about two years behind
        run.attempt("isc", f"ISC {year}", lambda year=year: store.replace(
            "isc", year_start(year), year_start(year + 1), sources.isc(year, year)))
    t0, t1 = year_start(y - 2), now() + 3600
    run.attempt("usgs", "USGS, last 3 years", lambda: store.replace("usgs", t0, t1, sources.usgs(t0, t1)))


def run_backfill(run, cache):
    # the history must be complete, so any failure here stops the backfill
    store = run.store
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

    store.db.commit()
    run.ok.update(("isc", "usgs"))
    run_live(run)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("mode", choices=["backfill", "live", "daily", "monthly", "export", "csv", "check"])
    ap.add_argument("file", nargs="?", help="output file for csv")
    ap.add_argument("--db", default=os.path.join("data", "quakes.sqlite"))
    ap.add_argument("--site", default="seismograph")
    ap.add_argument("--site-url", default=SITE_URL, help="public site URL used for RSS links")
    ap.add_argument("--cache", default="cache", help="raw downloads kept between backfills")
    ap.add_argument("--archive", help="folder holding a plain-file copy of every source record")
    a = ap.parse_args()

    store = Store(a.db)
    try:
        if a.archive and store.is_empty():
            started = now()
            log("Rebuilding the database from the archive…")
            if store.import_archive(a.archive):
                store.rebuild_dirty()
                store.db.commit()
                log(f"  done in {now() - started:.0f}s")
        if a.mode == "csv":
            store.export_csv(a.file or "portugal_earthquakes.csv")
            log(f"wrote {a.file or 'portugal_earthquakes.csv'}")
            return
        if a.mode == "check":
            sys.exit(check(store))
        if a.mode != "export":
            started = now()
            run = Run(store)
            {"backfill": lambda: run_backfill(run, a.cache), "live": lambda: run_live(run),
             "daily": lambda: run_daily(run), "monthly": lambda: run_monthly(run)}[a.mode]()
            log("Rebuilding changed days…")
            spans = store.rebuild_dirty()
            store.db.commit()
            log(f"  {len(spans)} span(s) rebuilt in {now() - started:.0f}s")
            if not run.finish():
                sys.exit("every source failed; nothing to publish")
            if a.archive:
                store.export_archive(a.archive)
        store.export_site(a.site, a.site_url)
        store.db.commit()
    finally:
        store.close()


if __name__ == "__main__":
    main()
