"""Readers for the four catalogues. Each returns raw records (dicts) inside the regions.

Record keys: source, sid, time (UTC epoch seconds), lat, lon, depth (km), mag, mag_type,
mag_author, mw, place, intensity, felt, etype, url, region.

Every query covers a whole time window for the whole regional box, so the caller can treat
the result as the complete list for that source and window (and drop records that vanished).
"""
import calendar
import datetime as dt
import json
import os
import re
import urllib.parse
import xml.etree.ElementTree as ET

from .net import fetch
from .regions import BOX, region_of

NON_EARTHQUAKE = {"explosion", "quarry blast", "mining explosion", "chemical explosion",
                  "nuclear explosion", "rock burst", "sonic boom", "not existing", "other event"}
IPMA_AGENCIES = {"LIS", "INMG", "IPMA"}  # IPMA's codes in the ISC Bulletin (INMG = its former name)


def parse_time(s):
    """ISO 8601 UTC with any number of fractional digits -> epoch seconds (float)."""
    m = re.match(r"(\d{4})-(\d\d)-(\d\d)[T ](\d\d):(\d\d):(\d\d)(?:\.(\d+))?", s)
    if not m:
        raise ValueError(f"bad time {s!r}")
    y, mo, d, h, mi, sec, frac = m.groups()
    whole = calendar.timegm((int(y), int(mo), int(d), int(h), int(mi), int(sec)))
    return whole + (float("0." + frac) if frac else 0.0)


def iso(t):
    return dt.datetime.fromtimestamp(t, dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")


def year_start(y):
    return float(calendar.timegm((y, 1, 1, 0, 0, 0)))


def _record(**kw):
    rec = {"depth": None, "mag": None, "mag_type": None, "mag_author": None, "mw": None, "place": "",
           "intensity": None, "felt": None, "etype": "earthquake", "url": ""}
    rec.update(kw)
    return rec


# ---------------------------------------------------------------- IPMA open data

def ipma():
    """IPMA's rolling ~30-day feed (area 3 = Azores, area 7 = mainland + Madeira).

    Returns (records, window) where window is the time span the feed covers."""
    out, earliest = [], None
    for area in (3, 7):
        data = json.loads(fetch(f"https://api.ipma.pt/open-data/observation/seismic/{area}.json", timeout=60) or b"{}")
        rows = data.get("data")
        if not isinstance(rows, list):
            raise RuntimeError(f"IPMA area {area}: unexpected payload")
        for d in rows:
            try:
                lat, lon, t = float(d["lat"]), float(d["lon"]), parse_time(d["time"])  # times are UTC
            except (TypeError, ValueError, KeyError):
                continue
            earliest = t if earliest is None else min(earliest, t)
            region = region_of(lat, lon)
            if not region:
                continue
            try:
                m = float(d.get("magnitud"))
            except (TypeError, ValueError):
                m = None
            if m is not None and m <= -9:  # -99 = not computed yet
                m = None
            mt = (d.get("magType") or "").strip()
            if mt and not mt.upper().startswith("M"):
                mt = "M" + mt
            sid = d.get("sismoId") or dt.datetime.fromtimestamp(t, dt.timezone.utc).strftime("%Y%m%d%H%M%S")
            out.append(_record(
                source="ipma", sid=sid, time=t, lat=lat, lon=lon, depth=d.get("depth"),
                mag=m, mag_type=mt or None, mag_author="IPMA" if m is not None else None,
                place=re.sub(r"\s+", " ", d.get("obsRegion") or "").strip(),
                intensity=d.get("degree") or None,
                felt=None if d.get("sensed") is None else int(bool(d.get("sensed"))),
                region=region,
            ))
    now = dt.datetime.now(dt.timezone.utc).timestamp()
    return out, (earliest if earliest is not None else now, now + 3600)


# ---------------------------------------------------------------- ISC Bulletin (QuakeML)

Q = "{http://quakeml.org/xmlns/bed/1.2}"


def isc(y0, y1, cache_dir=None):
    """ISC events from Jan 1 of y0 to the end of y1. Slow: tens of seconds per year."""
    params = dict(BOX, starttime=f"{y0}-01-01T00:00:00", endtime=f"{y1 + 1}-01-01T00:00:00",
                  includeallmagnitudes="true")
    url = "https://www.isc.ac.uk/fdsnws/event/1/query?" + urllib.parse.urlencode(params)
    path = os.path.join(cache_dir, f"isc-{y0}-{y1}-pt.xml") if cache_dir else None
    body = fetch(url, path, timeout=900)
    if body.strip() and body.rfind(b"quakeml>") < 0:  # cut short in transit: one more try
        if path:
            os.remove(path)
        body = fetch(url, path, timeout=900)
        if body.rfind(b"quakeml>") < 0:
            raise RuntimeError(f"ISC {y0}-{y1}: incomplete response")
    if not body.strip():
        return []
    body = body[: body.rfind(b"quakeml>") + len(b"quakeml>")]  # ISC sometimes appends a stray byte
    out = []
    for ev in ET.fromstring(body).iter(Q + "event"):
        rec = _isc_record(ev)
        if rec:
            out.append(rec)
    return out


def _txt(el, path):
    x = el.find(path)
    return x.text.strip() if x is not None and x.text else None


def _isc_record(ev):
    etype = _txt(ev, Q + "type") or "earthquake"
    if etype in NON_EARTHQUAKE:
        return None
    origins = {o.get("publicID"): o for o in ev.findall(Q + "origin")}
    origin = origins.get(_txt(ev, Q + "preferredOriginID")) or next(iter(origins.values()), None)
    if origin is None:
        return None
    lat = float(_txt(origin, f"{Q}latitude/{Q}value"))
    lon = float(_txt(origin, f"{Q}longitude/{Q}value"))
    region = region_of(lat, lon)
    if not region:
        return None
    depth = _txt(origin, f"{Q}depth/{Q}value")

    mags = list(ev.findall(Q + "magnitude"))
    author = lambda m: (_txt(m, f"{Q}creationInfo/{Q}author") or "").upper()
    kind = lambda m: _txt(m, Q + "type") or ""
    value = lambda m: float(_txt(m, f"{Q}mag/{Q}value"))
    mws = [m for m in mags if kind(m).lower().startswith("mw")]
    ipma_mags = [m for m in mags if author(m) in IPMA_AGENCIES]
    if ipma_mags:  # IPMA's own value, local magnitude first as IPMA publishes it
        mag = next((m for m in ipma_mags if kind(m).upper().startswith("ML")), ipma_mags[0])
    elif mws:      # else moment magnitude, the standard for large earthquakes
        mag = max(mws, key=value)
    else:          # else the ISC's preferred one
        pref = _txt(ev, Q + "preferredMagnitudeID")
        mag = next((m for m in mags if m.get("publicID") == pref), mags[0] if mags else None)

    eid = (ev.get("publicID") or "").rsplit("=", 1)[-1].rsplit("/", 1)[-1]
    return _record(
        source="isc", sid=eid, time=parse_time(_txt(origin, f"{Q}time/{Q}value")), lat=lat, lon=lon,
        depth=round(float(depth) / 1000, 1) if depth else None,  # QuakeML depth is metres
        mag=value(mag) if mag is not None else None,
        mag_type=(kind(mag) or None) if mag is not None else None,
        mag_author=(author(mag) or None) if mag is not None else None,
        mw=max(value(m) for m in mws) if mws else None,
        place=_txt(ev, f"{Q}description/{Q}text") or "", etype=etype, region=region,
        url=f"https://www.isc.ac.uk/cgi-bin/web-db-run?event_id={eid}&out_format=ISF2&request=COMPREHENSIVE",
    )


# ---------------------------------------------------------------- EMSC

def emsc(t0, t1, cache_path=None):
    """EMSC events with t0 <= time < t1 (EMSC's catalogue starts in 1998)."""
    params = dict(BOX, format="text", starttime=iso(t0), endtime=iso(t1), limit=50000)
    url = "https://www.seismicportal.eu/fdsnws/event/1/query?" + urllib.parse.urlencode(params)
    body = fetch(url, cache_path, timeout=300).decode("utf-8", "replace")
    out = []
    for line in body.splitlines():
        if not line or line.startswith("#"):
            continue
        f = line.split("|")
        if len(f) < 13:
            continue
        lat, lon = float(f[2]), float(f[3])
        region = region_of(lat, lon)
        if not region:
            continue
        m = float(f[10]) if f[10].strip() else None
        out.append(_record(
            source="emsc", sid=f[0], time=parse_time(f[1]), lat=lat, lon=lon,
            depth=float(f[4]) if f[4].strip() else None,
            mag=m, mag_type=f[9].strip() or None, mag_author=(f[11].strip() or None) if m is not None else None,
            place=f[12].strip().title(), region=region,
            url=f"https://www.seismicportal.eu/eventdetails.html?unid={f[0]}",
        ))
    return out


# ---------------------------------------------------------------- USGS

def usgs(t0, t1, cache_path=None):
    """USGS ComCat events with t0 <= time < t1."""
    params = dict(BOX, format="geojson", starttime=iso(t0), endtime=iso(t1), orderby="time-asc", limit=20000)
    url = "https://earthquake.usgs.gov/fdsnws/event/1/query?" + urllib.parse.urlencode(params)
    data = json.loads(fetch(url, cache_path) or b'{"features":[]}')
    if len(data["features"]) >= 20000:
        raise RuntimeError("USGS: window too large, split it")
    out = []
    for f in data["features"]:
        p = f["properties"]
        lon, lat, depth = f["geometry"]["coordinates"]
        region = region_of(lat, lon)
        if not region or p.get("type") in NON_EARTHQUAKE:
            continue
        is_mw = (p.get("magType") or "").lower().startswith("mw")
        out.append(_record(
            source="usgs", sid=f["id"], time=p["time"] / 1000, lat=lat, lon=lon, depth=depth,
            mag=p.get("mag"), mag_type=p.get("magType"), mag_author=(p.get("net") or "").upper() or None,
            mw=p.get("mag") if is_mw else None,
            place=p.get("place") or "", etype=p.get("type") or "earthquake", region=region, url=p.get("url") or "",
        ))
    return out
