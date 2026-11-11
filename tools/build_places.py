#!/usr/bin/env python3
"""
Build site/places.json: the towns a visitor can choose in "Near a place".

  python3 tools/build_places.py

The places are Portugal's 308 municipalities, each placed at its seat, from GeoNames (https://www.geonames.org,
CC BY 4.0), downloaded once into cache/. Standard library only.

places.json: [[slug, name, lat, lon, area], …] sorted by name. slug is what goes in a link
(near=lisboa); area is the district or island group, shown beside the name and used to tell
apart towns that share one (Lagoa in Faro and Lagoa in the Azores).
"""
import io
import json
import os
import re
import unicodedata
import urllib.request
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "cache", "geonames-PT.zip")
OUT = os.path.join(ROOT, "site", "places.json")
SOURCE = "https://download.geonames.org/export/dump/PT.zip"
SEATS = ("PPLC", "PPLA", "PPLA2", "PPLA3")  # places marked as the seat of something, best first
NAMES = {"Lisbon": "Lisboa", "Azores": "Açores"}  # GeoNames uses the English form for these


def slug(text):
    plain = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", plain.lower()).strip("-")


def rows():
    if not os.path.exists(CACHE):
        os.makedirs(os.path.dirname(CACHE), exist_ok=True)
        request = urllib.request.Request(SOURCE, headers={"User-Agent": "build_places.py"})
        with urllib.request.urlopen(request, timeout=120) as response, open(CACHE, "wb") as f:
            f.write(response.read())
    with zipfile.ZipFile(CACHE) as archive, archive.open("PT.txt") as f:
        for line in io.TextIOWrapper(f, encoding="utf-8"):
            yield line.rstrip("\n").split("\t")


def main():
    areas, towns, municipalities = {}, {}, []
    for r in rows():
        name, lat, lon, kind, admin1, admin2, population = r[1], float(r[4]), float(r[5]), r[7], r[10], r[11], int(r[14] or 0)
        name = NAMES.get(name, name)
        name = re.sub(r" Municipality$", "", name)
        name = re.sub(r"([ -])(D[aeo]s?|E|A|O|À)(?=[ -])", lambda m: m.group(0).lower(), name)  # "Lajes Das Flores"
        if kind == "ADM1":
            areas[admin1] = re.sub(r"^Distrito d[eao]s? ", "", name)
        elif kind == "ADM2":
            municipalities.append((name, lat, lon, admin1, admin2))
        elif r[6] == "P":
            towns.setdefault(admin2, []).append((name, lat, lon, kind, population))
    # a municipality is placed at its seat: the town marked as one, else the town that shares its
    # name, else its largest town; only without any town does it fall back to its middle
    found = []
    for name, lat, lon, admin1, admin2 in municipalities:
        inside = towns.get(admin2, [])
        rank = lambda t: (SEATS.index(t[3]) if t[3] in SEATS else len(SEATS), slug(t[0]) != slug(name), -t[4])
        seat = min(inside, key=rank) if inside else None
        found.append((name, seat[1] if seat else lat, seat[2] if seat else lon, areas.get(admin1, "")))
    names = {}
    for place in found:
        names.setdefault(slug(place[0]), []).append(place)
    places = []
    for base, same in names.items():
        for name, lat, lon, area in same:
            places.append([base if len(same) == 1 else f"{base}-{slug(area)}", name, round(lat, 3), round(lon, 3), area])
    if len({p[0] for p in places}) != len(places):
        raise SystemExit("two places ended up with the same slug")
    places.sort(key=lambda p: (slug(p[1]), p[0]))
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(places, f, ensure_ascii=False, separators=(",", ":"))
    print(f"site/places.json: {len(places)} places, {os.path.getsize(OUT) // 1024} KB")


if __name__ == "__main__":
    main()
