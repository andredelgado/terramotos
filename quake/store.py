"""SQLite store: raw records per source, merged earthquakes with permanent ids, site export.

Tables
  raw    one row per source record, replaced window by window as sources are re-read
  event  merged earthquakes, rebuilt for any window whose raw records changed
  link   which event each raw record belongs to; keeps event ids stable across rebuilds
  state  small key/value facts (when the data was last refreshed)
"""
import bisect
import calendar
import csv
import datetime as dt
import hashlib
import json
import math
import os
import sqlite3
import sys
import time as _time

from .regions import NAMES, REGIONS
from .rss import ITEM_LIMIT, SITE_URL, write_rss

PRECEDENCE = ["ipma", "isc", "emsc", "usgs"]  # earlier wins for location and magnitude
SOURCE_BITS = {"ipma": 1, "isc": 2, "emsc": 4, "usgs": 8}
IPMA_AUTHORS = {"IPMA", "LIS", "INMG"}  # IPMA, and its codes in the ISC Bulletin
MATCH_SECONDS = 30
MATCH_KM = 100
# Before the global standard network (1964) locations were rough: the ISC and USGS can place
# the same earthquake 150+ km apart, so early events match more loosely.
EARLY_UNTIL = float(calendar.timegm((1964, 1, 1, 0, 0, 0)))
EARLY_SECONDS = 60
EARLY_KM = 250
DAY = 86400.0

FIELDS = ["time", "lat", "lon", "depth", "mag", "mag_type", "mag_author", "mw", "place",
          "intensity", "felt", "etype", "url", "region"]

SCHEMA = """
CREATE TABLE IF NOT EXISTS raw (
  source TEXT NOT NULL, sid TEXT NOT NULL, time REAL NOT NULL, lat REAL, lon REAL, depth REAL,
  mag REAL, mag_type TEXT, mag_author TEXT, mw REAL, place TEXT, intensity TEXT, felt INTEGER,
  etype TEXT, url TEXT, region TEXT, seen REAL,
  PRIMARY KEY (source, sid));
CREATE INDEX IF NOT EXISTS raw_time ON raw(time);
CREATE TABLE IF NOT EXISTS link (source TEXT NOT NULL, sid TEXT NOT NULL, event TEXT NOT NULL,
  PRIMARY KEY (source, sid));
CREATE INDEX IF NOT EXISTS link_event ON link(event);
CREATE TABLE IF NOT EXISTS event (
  id TEXT PRIMARY KEY, time REAL NOT NULL, lat REAL, lon REAL, depth REAL, mag REAL, mag_type TEXT,
  mag_author TEXT, mw REAL, region TEXT, place TEXT, intensity TEXT, felt INTEGER, sources TEXT, link TEXT);
CREATE INDEX IF NOT EXISTS event_time ON event(time);
CREATE TABLE IF NOT EXISTS state (k TEXT PRIMARY KEY, v TEXT);
"""


def log(*a):
    print(*a, file=sys.stderr)


def km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a["lat"], a["lon"], b["lat"], b["lon"]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(min(1.0, h)))


def year_of(t):
    return dt.datetime.fromtimestamp(t, dt.timezone.utc).year


def year_start(y):
    return float(calendar.timegm((y, 1, 1, 0, 0, 0)))


class Store:
    def __init__(self, path):
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        self.db = sqlite3.connect(path)
        self.db.row_factory = sqlite3.Row
        self.db.executescript(SCHEMA)
        self.dirty = []  # (t0, t1) windows whose events must be rebuilt

    def close(self):
        self.db.commit()
        self.db.close()

    def get(self, k, default=None):
        row = self.db.execute("SELECT v FROM state WHERE k=?", (k,)).fetchone()
        return row["v"] if row else default

    def set(self, k, v):
        self.db.execute("INSERT OR REPLACE INTO state VALUES (?, ?)", (k, str(v)))

    # ------------------------------------------------------------ raw records

    def replace(self, source, t0, t1, records, min_keep=0.5):
        """Make `records` the complete set for `source` in [t0, t1).

        Records that vanished from the source are deleted, unless the new set is suspiciously
        small (under `min_keep` of what was stored), which usually means a partial response."""
        records = [r for r in records if t0 <= r["time"] < t1]
        old = {row["sid"]: tuple(row[f] for f in FIELDS) for row in self.db.execute(
            f"SELECT sid, {', '.join(FIELDS)} FROM raw WHERE source=? AND time>=? AND time<?", (source, t0, t1))}
        new = {r["sid"]: r for r in records}
        gone = [sid for sid in old if sid not in new]
        if gone and len(old) >= 20 and len(new) < min_keep * len(old):
            log(f"  {source}: only {len(new)} of {len(old)} records came back for this window; keeping the old ones")
            gone = []
        changed = [r for sid, r in new.items() if old.get(sid) != tuple(r[f] for f in FIELDS)]
        now = _time.time()
        self.db.executemany("DELETE FROM raw WHERE source=? AND sid=?", [(source, sid) for sid in gone])
        self.db.executemany(
            f"INSERT OR REPLACE INTO raw (source, sid, {', '.join(FIELDS)}, seen) VALUES (?, ?, {', '.join('?' * len(FIELDS))}, ?)",
            [(source, r["sid"], *[r[f] for f in FIELDS], now) for r in changed])
        self.db.executemany("UPDATE raw SET seen=? WHERE source=? AND sid=?",
                            [(now, source, sid) for sid in new if sid in old])
        if gone or changed:
            times = ([old[sid][0] for sid in gone] + [r["time"] for r in changed]
                     + [old[r["sid"]][0] for r in changed if r["sid"] in old])  # where it was before a move
            self.dirty.append((min(times), max(times) + 1))
        log(f"  {source}: {len(new)} records, {len(changed)} new or changed, {len(gone)} removed")
        return len(changed) + len(gone)

    # ------------------------------------------------------------ archive

    def is_empty(self):
        return self.db.execute("SELECT 1 FROM raw LIMIT 1").fetchone() is None

    def export_archive(self, folder):
        """Write everything that cannot be derived again to plain files under `folder`:

          <source>/YYYY-MM.jsonl  every raw record, with the id of the earthquake it belongs to
          state.json              the small facts in the state table

        Only files whose content changed are rewritten. The database can be rebuilt from these
        files alone (import_archive), with the same earthquake ids."""
        files = {}
        cols = ", ".join("r." + f for f in FIELDS)
        for row in self.db.execute(
                f"SELECT r.source, r.sid, {cols}, l.event FROM raw r "
                "LEFT JOIN link l ON l.source=r.source AND l.sid=r.sid ORDER BY r.source, r.time, r.sid"):
            month = dt.datetime.fromtimestamp(row["time"], dt.timezone.utc).strftime("%Y-%m")
            rec = {k: row[k] for k in ("sid", *FIELDS, "event") if row[k] is not None}
            files.setdefault(os.path.join(row["source"], month + ".jsonl"), []).append(
                json.dumps(rec, ensure_ascii=False, sort_keys=True))
        bodies = {name: "\n".join(lines) + "\n" for name, lines in files.items()}
        state = {r["k"]: r["v"] for r in self.db.execute("SELECT k, v FROM state ORDER BY k") if r["v"] != ""}
        bodies["state.json"] = json.dumps(state, indent=1, sort_keys=True) + "\n"
        written = 0
        for name, body in bodies.items():
            path = os.path.join(folder, name)
            old = None
            if os.path.exists(path):
                with open(path, encoding="utf-8") as f:
                    old = f.read()
            if old != body:
                os.makedirs(os.path.dirname(path), exist_ok=True)
                with open(path, "w", encoding="utf-8") as f:
                    f.write(body)
                written += 1
        for source in SOURCE_BITS:  # months that no longer hold any record
            sub = os.path.join(folder, source)
            for name in os.listdir(sub) if os.path.isdir(sub) else []:
                if name.endswith(".jsonl") and os.path.join(source, name) not in bodies:
                    os.remove(os.path.join(sub, name))
        log(f"  archive: {sum(map(len, files.values()))} records in {len(files)} files, {written} rewritten")

    def import_archive(self, folder):
        """Fill an empty database from the files export_archive wrote. Returns the record count.

        The caller rebuilds the earthquakes afterwards (rebuild_dirty); they keep their ids."""
        raws, links, now = [], [], _time.time()
        for source in SOURCE_BITS:
            sub = os.path.join(folder, source)
            for name in sorted(os.listdir(sub)) if os.path.isdir(sub) else []:
                if not name.endswith(".jsonl"):
                    continue
                with open(os.path.join(sub, name), encoding="utf-8") as f:
                    for line in f:
                        if not line.strip():
                            continue
                        rec = json.loads(line)
                        raws.append((source, rec["sid"], *[rec.get(k) for k in FIELDS], now))
                        if rec.get("event"):
                            links.append((source, rec["sid"], rec["event"]))
        if not raws:
            return 0
        self.db.executemany(
            f"INSERT INTO raw (source, sid, {', '.join(FIELDS)}, seen) VALUES (?, ?, {', '.join('?' * len(FIELDS))}, ?)", raws)
        self.db.executemany("INSERT INTO link VALUES (?, ?, ?)", links)
        path = os.path.join(folder, "state.json")
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                for k, v in json.load(f).items():
                    self.set(k, v)
        t = FIELDS.index("time") + 2
        self.dirty.append((min(r[t] for r in raws), max(r[t] for r in raws) + 1))
        log(f"  archive: restored {len(raws)} records")
        return len(raws)

    # ------------------------------------------------------------ merging

    def rebuild_dirty(self):
        """Rebuild events in every dirty window, widened to whole UTC days."""
        spans = sorted((math.floor(a / DAY) * DAY, math.ceil(b / DAY) * DAY + DAY) for a, b in self.dirty)
        merged = []
        for a, b in spans:
            if merged and a <= merged[-1][1]:
                merged[-1][1] = max(merged[-1][1], b)
            else:
                merged.append([a, b])
        for a, b in merged:
            self.rebuild(a, b)
        self.dirty = []
        return merged

    def rebuild(self, t0, t1):
        margin = EARLY_SECONDS + 1
        rows = [dict(r) for r in self.db.execute(
            "SELECT * FROM raw WHERE time>=? AND time<? ORDER BY time", (t0 - margin, t1 + margin))]
        clusters = [c for c in cluster(rows) if t0 <= c[0]["time"] < t1]
        links = {}
        for r in self.db.execute(
                "SELECT l.source, l.sid, l.event FROM link l JOIN raw r ON r.source=l.source AND r.sid=l.sid "
                "WHERE r.time>=? AND r.time<?", (t0 - margin, t1 + margin)):
            links[(r["source"], r["sid"])] = r["event"]

        self.db.execute("DELETE FROM event WHERE time>=? AND time<?", (t0, t1))
        used, events, link_rows = set(), [], []
        for members in clusters:
            known = sorted({links[(m["source"], m["sid"])] for m in members if (m["source"], m["sid"]) in links})
            eid = next((x for x in known if x not in used), None) or self._new_id(members[0], used)
            used.add(eid)
            events.append(build_event(eid, members))
            link_rows += [(m["source"], m["sid"], eid) for m in members]
        self.db.executemany("DELETE FROM event WHERE id=?", [(e[0],) for e in events])  # ids that moved in time
        self.db.executemany(f"INSERT INTO event VALUES ({', '.join('?' * 15)})", events)
        self.db.executemany("INSERT OR REPLACE INTO link VALUES (?, ?, ?)", link_rows)
        log(f"  rebuilt {dt.datetime.fromtimestamp(t0, dt.timezone.utc):%Y-%m-%d} .. "
            f"{dt.datetime.fromtimestamp(t1, dt.timezone.utc):%Y-%m-%d}: {len(events)} earthquakes")

    def _new_id(self, first, used):
        """Readable, stable id: the date plus a short hash of the founding record."""
        day = dt.datetime.fromtimestamp(first["time"], dt.timezone.utc).strftime("%Y%m%d")
        h = hashlib.sha1(f"{first['source']}:{first['sid']}".encode()).hexdigest()
        for n in range(4, 41):
            eid = f"{day}-{h[:n]}"
            if eid not in used and not self.db.execute("SELECT 1 FROM link WHERE event=? LIMIT 1", (eid,)).fetchone():
                return eid
        raise RuntimeError("could not make a unique id")

    # ------------------------------------------------------------ export

    def export_site(self, site_dir, site_url=SITE_URL):
        """Write data/years/YYYY.json (only when changed), data/meta.json and rss.xml."""
        data_dir = os.path.join(site_dir, "data")
        years_dir = os.path.join(data_dir, "years")
        os.makedirs(years_dir, exist_ok=True)
        first = self.db.execute("SELECT MIN(time) t FROM event").fetchone()["t"]
        if first is None:
            raise RuntimeError("no earthquakes in the database; run a backfill first")
        y0, y1 = year_of(first), dt.datetime.now(dt.timezone.utc).year
        years, counts = {}, {}
        for y in range(y0, y1 + 1):
            rows = self.db.execute("SELECT * FROM event WHERE time>=? AND time<? ORDER BY time, id",
                                   (year_start(y), year_start(y + 1))).fetchall()
            body = json.dumps(pack(rows, y), separators=(",", ":"), ensure_ascii=False)
            path = os.path.join(years_dir, f"{y}.json")
            old = None
            if os.path.exists(path):
                with open(path, encoding="utf-8") as f:
                    old = f.read()
            if old != body:
                with open(path, "w", encoding="utf-8") as f:
                    f.write(body)
            years[str(y)] = {"v": hashlib.sha1(body.encode()).hexdigest()[:12], "n": len(rows)}
            c = [[0] * 6 for _ in NAMES]
            for r in rows:
                c[NAMES.index(r["region"])][bucket(r["mag"])] += 1
            counts[str(y)] = c
        for name in os.listdir(years_dir):  # years no longer covered
            if name.endswith(".json") and not (y0 <= int(name[:4]) <= y1):
                os.remove(os.path.join(years_dir, name))

        largest = [{"id": r["id"], "t": round(r["time"]), "m": round(r["mag"], 1), "mt": r["mag_type"] or "",
                    "place": r["place"] or "", "r": NAMES.index(r["region"])}
                   for r in self.db.execute("SELECT * FROM event WHERE mag IS NOT NULL ORDER BY mag DESC, time LIMIT 12")]
        meta = {
            "generated": self.get("fresh_at") or dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "first": round(first), "total": sum(v["n"] for v in years.values()),
            "regions": NAMES, "polygons": [REGIONS[n] for n in NAMES],
            "buckets": "counts per region: no magnitude, <2, 2-3, 3-4, 4-5, 5+",
            "years": years, "counts": counts, "largest": largest,
        }
        with open(os.path.join(data_dir, "meta.json"), "w", encoding="utf-8") as f:
            json.dump(meta, f, separators=(",", ":"), ensure_ascii=False)
        events = self.db.execute("SELECT * FROM event ORDER BY time DESC, id DESC LIMIT ?", (ITEM_LIMIT,))
        write_rss(os.path.join(site_dir, "rss.xml"), events, site_url)
        log(f"  site: {meta['total']} earthquakes in {len(years)} year files, data as of {meta['generated']}")

    def export_csv(self, path):
        cols = ["id", "time_utc", "latitude", "longitude", "depth_km", "magnitude", "mag_type", "mag_author", "mw",
                "region", "place", "intensity", "felt", "sources", "source_ids"]
        with open(path, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(cols)
            for r in self.db.execute("SELECT * FROM event ORDER BY time, id"):
                ids = ";".join(f"{x['source']}:{x['sid']}" for x in self.db.execute(
                    "SELECT source, sid FROM link WHERE event=? ORDER BY source", (r["id"],)))
                t = dt.datetime.fromtimestamp(r["time"], dt.timezone.utc)
                w.writerow([r["id"], t.strftime("%Y-%m-%dT%H:%M:%S.") + f"{t.microsecond // 1000:03d}Z",
                            round(r["lat"], 4), round(r["lon"], 4), _num(r["depth"]), _num(r["mag"], 2),
                            r["mag_type"] or "", r["mag_author"] or "", _num(r["mw"], 2), r["region"], r["place"] or "",
                            r["intensity"] or "", "" if r["felt"] is None else r["felt"], r["sources"], ids])


def _num(x, nd=1):
    return "" if x is None else round(x, nd)


def bucket(m):
    if m is None:
        return 0
    return 1 if m < 2 else 2 if m < 3 else 3 if m < 4 else 4 if m < 5 else 5


def cluster(rows):
    """Group raw records into earthquakes. Sources are taken in precedence order; each record
    joins the closest unclaimed group within MATCH_SECONDS and MATCH_KM (looser before 1964),
    else starts its own."""
    by_src = {s: [] for s in PRECEDENCE}
    for r in rows:
        by_src.setdefault(r["source"], []).append(r)
    groups = []
    for src in by_src:
        recs = by_src[src]
        if not recs:
            continue
        groups.sort(key=lambda g: g[0]["time"])
        times = [g[0]["time"] for g in groups]
        taken, fresh = set(), []
        for r in recs:
            early = r["time"] < EARLY_UNTIL
            win, max_km = (EARLY_SECONDS, EARLY_KM) if early else (MATCH_SECONDS, MATCH_KM)
            best = None
            i = bisect.bisect_left(times, r["time"] - win)
            while i < len(times) and times[i] <= r["time"] + win:
                if i not in taken:
                    d = km(groups[i][0], r)
                    if d <= max_km:
                        score = abs(times[i] - r["time"]) / win + d / max_km
                        if best is None or score < best[0]:
                            best = (score, i)
                i += 1
            if best is None:
                fresh.append([r])
            else:
                taken.add(best[1])
                groups[best[1]].append(r)
        groups += fresh
    return groups


def build_event(eid, members):
    """One event row from a group; members are in precedence order (first = primary)."""
    p = members[0]
    first = lambda key: next((m[key] for m in members if m[key] not in (None, "")), None)
    with_mag = [m for m in members if m["mag"] is not None]
    # magnitude: IPMA's own, else a moment magnitude, else the highest-precedence source's
    mag_from = (next((m for m in with_mag if (m["mag_author"] or "").upper() in IPMA_AUTHORS), None)
                or next((m for m in with_mag if (m["mag_type"] or "").lower().startswith("mw")), None)
                or (with_mag[0] if with_mag else None))
    sources = []
    for m in members:
        if m["source"] not in sources:
            sources.append(m["source"])
    link = ""
    for src, prefix in (("emsc", "e:"), ("isc", "i:"), ("usgs", "u:")):
        hit = next((m for m in members if m["source"] == src), None)
        if hit:
            link = prefix + hit["sid"]
            break
    return (eid, p["time"], p["lat"], p["lon"], first("depth"),
            mag_from["mag"] if mag_from else None, mag_from["mag_type"] if mag_from else None,
            mag_from["mag_author"] if mag_from else None, first("mw"), p["region"], first("place") or "",
            first("intensity"), first("felt"), ";".join(sources), link)


def pack(rows, year):
    """Columnar, compact form of one year's events for the page."""
    dicts = {"places": {}, "mtypes": {}, "authors": {}}

    def idx(name, s):
        d = dicts[name]
        s = s or ""
        if s not in d:
            d[s] = len(d)
        return d[s]

    out = {k: [] for k in ("id", "t", "m", "mt", "ma", "r", "d", "lat", "lon", "p", "s", "k")}
    felt, intensity = [], []
    prev = int(year_start(year))
    for i, r in enumerate(rows):
        t = int(round(r["time"]))
        out["id"].append(r["id"])
        out["t"].append(t - prev)
        prev = t
        out["m"].append(None if r["mag"] is None else round(r["mag"] * 10))
        out["mt"].append(idx("mtypes", r["mag_type"]))
        out["ma"].append(idx("authors", r["mag_author"]))
        out["r"].append(NAMES.index(r["region"]))
        out["d"].append(None if r["depth"] is None else round(r["depth"]))
        out["lat"].append(round(r["lat"] * 100))
        out["lon"].append(round(r["lon"] * 100))
        out["p"].append(idx("places", r["place"]))
        out["s"].append(sum(SOURCE_BITS[s] for s in r["sources"].split(";") if s in SOURCE_BITS))
        out["k"].append(r["link"] or "")
        if r["felt"]:
            felt.append(i)
        if r["intensity"]:
            intensity.append([i, r["intensity"]])
    out.update({name: list(d) for name, d in dicts.items()})
    out.update({"year": year, "felt": felt, "intensity": intensity})
    return out
