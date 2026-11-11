#!/usr/bin/env python3
"""Package the static app for Cloudflare; the Worker renders earthquake HTML from these assets."""
import argparse
import hashlib
import json
import math
from bisect import bisect_left, bisect_right
from collections import defaultdict
import datetime as dt
from pathlib import Path
import shutil
import subprocess
import xml.etree.ElementTree as ET
from site_archive import LANGS, browse_links, home_path, stamp, write_archive, write_landings

ROOT = Path(__file__).resolve().parents[1]
SITE_URL = "https://terramotos.com"
SITEMAP = "http://www.sitemaps.org/schemas/sitemap/0.9"
NEAR_SECONDS = 7 * 86400


def page_assets(source, destination, meta):
    """Prepare one small lookup per month/bucket, including each earthquake's nearby events.

    Eight buckets per month bounds file sizes in busy months. Even a completely populated century
    uses fewer than 10,000 assets. The Worker needs one asset read and does no spatial search.
    """
    events = []
    for year in sorted(meta["years"]):
        p = json.loads((source / "data/years" / f"{year}.json").read_text(encoding="utf-8"))
        time = dt.datetime(int(year), 1, 1, tzinfo=dt.timezone.utc).timestamp()
        felt, intensity = set(p["felt"]), dict(p["intensity"])
        for i, event_id in enumerate(p["id"]):
            time += p["t"][i]
            events.append({"id": event_id, "t": time, "m": None if p["m"][i] is None else p["m"][i] / 10,
                           "mt": p["mtypes"][p["mt"][i]], "au": p["authors"][p["ma"][i]],
                           "r": p["r"][i], "d": p["d"][i], "lat": p["lat"][i] / 100, "lon": p["lon"][i] / 100,
                           "place": p["places"][p["p"][i]], "s": p["s"][i], "k": p["k"][i],
                           "felt": i in felt, "inten": intensity.get(i)})
    events.sort(key=lambda event: (event["t"], event["id"]))
    times = [event["t"] for event in events]
    for i in range(1, len(events)):
        if times[i] == times[i - 1]:
            events[i]["sameTime"] = events[i - 1]["sameTime"] = True
    text_index = {entry["id"]: entry for entry in json.loads((source / "content/index.json").read_text(encoding="utf-8"))}
    buckets = defaultdict(dict)
    for event in events:
        a, b = bisect_left(times, event["t"] - NEAR_SECONDS), bisect_right(times, event["t"] + NEAR_SECONDS)
        near = []
        for i in range(a, b):
            other = events[i]
            if other is event or abs(event["lat"] - other["lat"]) > 0.45:
                continue
            radians = math.pi / 180
            dlat, dlon = (event["lat"] - other["lat"]) * radians, (event["lon"] - other["lon"]) * radians
            h = math.sin(dlat / 2) ** 2 + math.cos(event["lat"] * radians) * math.cos(other["lat"] * radians) * math.sin(dlon / 2) ** 2
            if 12742 * math.asin(min(1, math.sqrt(h))) <= 50:
                near.append(other)
        near.sort(key=lambda other: (-(other["m"] if other["m"] is not None else -math.inf), other["t"], other["id"]))
        short = [{key: other[key] for key in ["id", "t", "m", "r", "place"]} for other in near[:8]]
        record = {"event": event, "nearby": {"count": len(near), "events": short}}
        entry = text_index.get(event["id"])
        if entry:
            record["stories"] = {language: {**entry[language], "html": (source / "content" / f"{event['id']}.{language}.html").read_text(encoding="utf-8")}
                                 for language in ["pt", "en"] if language in entry}
        bucket = f"{event['id'][:6]}-{int(event['id'].split('-')[1][-4:], 16) % 8}.json"
        buckets[bucket][event["id"]] = record
    folder = destination / "pages"
    folder.mkdir()
    for name, entries in sorted(buckets.items()):
        (folder / name).write_text(json.dumps(entries, ensure_ascii=False, separators=(",", ":"), sort_keys=True), encoding="utf-8")
    return events, [text_index[event["id"]] for event in events if event["id"] in text_index]


def build(source, destination):
    """Write a self-contained public asset directory. Never modify the source site/."""
    source, destination = Path(source), Path(destination)
    if source.resolve() == destination.resolve() or destination.resolve() in source.resolve().parents or source.resolve() in destination.resolve().parents:
        raise ValueError("The build destination must be separate from the source site")
    meta = json.loads((source / "data/meta.json").read_text(encoding="utf-8"))
    if not meta.get("total"):
        raise ValueError("No catalogue to publish: run update.py export first")
    if destination.exists():
        shutil.rmtree(destination)
    shutil.copytree(source, destination)

    # All imports remain relative inside this directory, so one version applies to the whole graph.
    code = sorted((source / "js").rglob("*.js")) + [source / "app.css"]
    version = hashlib.sha256(b"".join(path.read_bytes() for path in code)).hexdigest()[:12]
    (destination / "js").rename(destination / f"js-{version}")
    index = (destination / "index.html").read_text(encoding="utf-8")
    index = index.replace('"js/', f'"/js-{version}/').replace('"app.css"', f'"/app.css?v={version}"')
    for asset in ("rss.xml", "favicon.svg", "analytics.js"):
        index = index.replace(f'"{asset}"', f'"/{asset}"')
    events, stories = page_assets(source, destination, meta)
    payload = {"template": index, "origin": SITE_URL, "total": len(events), "firstYear": stamp(events[0]).year,
               "recent": events[-6:][::-1], "stories": stories, "generated": meta.get("generated"),
               "navigation": {lang: browse_links(lang) for lang in LANGS}}
    homes = subprocess.run(["node", str(ROOT / "tools/render_home.mjs")], input=json.dumps(payload),
                           stdout=subprocess.PIPE, text=True, check=True)
    for lang, html in json.loads(homes.stdout).items():
        path = destination / home_path(lang).strip("/")
        path.mkdir(exist_ok=True)
        (path / "index.html").write_text(html, encoding="utf-8")
    archive_paths = write_archive(destination, events, stories, SITE_URL)
    landing_paths = write_landings(destination, events, meta.get("generated"), SITE_URL)

    # Split below the sitemap protocol's 50,000-URL limit. These are a handful of assets, not
    # one static HTML file per earthquake (which would exceed the Workers Free asset limit).
    ids = [event["id"] for event in events]
    ET.register_namespace("", SITEMAP)
    sitemap_index = ET.Element(f"{{{SITEMAP}}}sitemapindex")
    for language, prefix in (("pt", ""), ("en", "/en")):
        for start in range(0, len(ids), 45000):
            name = f"sitemap-{language}-{start // 45000 + 1}.xml"
            urls = ET.Element(f"{{{SITEMAP}}}urlset")
            for event_id in ids[start:start + 45000]:
                entry = ET.SubElement(urls, f"{{{SITEMAP}}}url")
                ET.SubElement(entry, f"{{{SITEMAP}}}loc").text = f"{SITE_URL}{prefix}/sismo/{event_id}"
            ET.ElementTree(urls).write(destination / name, encoding="utf-8", xml_declaration=True)
            sitemap = ET.SubElement(sitemap_index, f"{{{SITEMAP}}}sitemap")
            ET.SubElement(sitemap, f"{{{SITEMAP}}}loc").text = SITE_URL + "/" + name
    archive_map = ET.Element(f"{{{SITEMAP}}}urlset")
    for path in ["/", "/en/", *archive_paths, *landing_paths]:
        entry = ET.SubElement(archive_map, f"{{{SITEMAP}}}url")
        ET.SubElement(entry, f"{{{SITEMAP}}}loc").text = SITE_URL + path
    ET.ElementTree(archive_map).write(destination / "sitemap-archive.xml", encoding="utf-8", xml_declaration=True)
    sitemap = ET.SubElement(sitemap_index, f"{{{SITEMAP}}}sitemap")
    ET.SubElement(sitemap, f"{{{SITEMAP}}}loc").text = SITE_URL + "/sitemap-archive.xml"
    ET.ElementTree(sitemap_index).write(destination / "sitemap.xml", encoding="utf-8", xml_declaration=True)
    (destination / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {SITE_URL}/sitemap.xml\n", encoding="utf-8")
    (destination / "_headers").write_text(
        "/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n"
        f"/js-{version}/*\n  Cache-Control: public, max-age=31536000, immutable\n"
        "/app.css\n  Cache-Control: public, max-age=31536000, immutable\n"
        "/content/*\n  X-Robots-Tag: noindex\n"
        "/data/*\n  Cache-Control: public, max-age=300, must-revalidate\n", encoding="utf-8")
    files = [path for path in destination.rglob("*") if path.is_file()]
    if len(files) > 20000 or any(path.stat().st_size > 25 * 1024 * 1024 for path in files):
        raise ValueError("The build exceeds the Workers Free static asset limits")
    return len(ids), len(files)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=ROOT / "site")
    parser.add_argument("--out", type=Path, default=ROOT / "dist/cloudflare")
    args = parser.parse_args()
    events, files = build(args.source, args.out)
    print(f"Cloudflare: {events} earthquakes, {files} static assets in {args.out}")


if __name__ == "__main__":
    main()
