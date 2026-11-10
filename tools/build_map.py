#!/usr/bin/env python3
"""
Build seismograph/map.json, the geography the map view draws: land, plate boundaries and labels.

  python3 tools/build_map.py

Sources (downloaded once into cache/):
- Land and borders: Natural Earth 1:10m countries (public domain), https://www.naturalearthdata.com
- Plate boundaries: Bird, P. (2003), An updated digital model of plate boundaries, Geochemistry
  Geophysics Geosystems 4(3), 1027 (PB2002), as converted by Hugo Ahlenius, Nordpil
  (https://github.com/fraxen/tectonicplates, Open Data Commons Attribution License 1.0)

Everything is clipped to one box around the three regions and simplified. Standard library only.

Output:
  land    [[portugal, [lon, lat, lon, lat, …]], …]  closed rings; portugal is 1 or 0
  plates  [[lon, lat, lon, lat, …], …]              open lines
  labels  [[kind, lon, lat, english, portuguese], …] kind: "city", "island" or "country"
"""
import json
import math
import os
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "cache")
OUT = os.path.join(ROOT, "seismograph", "map.json")
COUNTRIES = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson"
PLATES = "https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_boundaries.json"

# wide enough for what a panel shows beyond its region on a wide screen
WEST, EAST, SOUTH, NORTH = -46.0, 3.0, 25.0, 47.0

# most important first: the page leaves out a label that would overlap an earlier one
LABELS = [
    ["city", -9.14, 38.72, "Lisbon", "Lisboa"], ["city", -8.61, 41.15, "Porto", "Porto"],
    ["city", -7.93, 37.02, "Faro", "Faro"], ["city", -8.43, 40.21, "Coimbra", "Coimbra"],
    ["city", -7.91, 38.57, "Évora", "Évora"],
    ["country", -6.25, 40.0, "Spain", "Espanha"], ["country", -5.95, 35.4, "Morocco", "Marrocos"],
    ["island", -25.50, 37.78, "São Miguel", "São Miguel"], ["island", -27.22, 38.72, "Terceira", "Terceira"],
    ["island", -28.33, 38.47, "Pico", "Pico"], ["island", -31.20, 39.44, "Flores", "Flores"],
    ["island", -25.10, 36.97, "Santa Maria", "Santa Maria"], ["island", -28.70, 38.58, "Faial", "Faial"],
    ["island", -28.05, 38.65, "São Jorge", "São Jorge"], ["island", -28.02, 39.05, "Graciosa", "Graciosa"],
    ["island", -31.11, 39.70, "Corvo", "Corvo"],
    ["island", -16.96, 32.75, "Madeira", "Madeira"], ["island", -16.34, 33.07, "Porto Santo", "Porto Santo"],
    ["island", -16.50, 32.52, "Desertas", "Desertas"], ["island", -15.90, 30.10, "Selvagens", "Selvagens"],
]


def download(url, name):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        print(f"downloading {name}…", file=sys.stderr)
        req = urllib.request.Request(url, headers={"User-Agent": "terramotos-map-build"})
        with urllib.request.urlopen(req, timeout=300) as r, open(path + ".part", "wb") as f:
            f.write(r.read())
        os.replace(path + ".part", path)
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def clip_ring(ring):
    """Sutherland–Hodgman: the part of a closed ring inside the box."""
    def clip(points, inside, cross):
        out = []
        for i, p in enumerate(points):
            q = points[i - 1]
            if inside(p):
                if not inside(q):
                    out.append(cross(q, p))
                out.append(p)
            elif inside(q):
                out.append(cross(q, p))
        return out

    def at_x(x):
        return lambda a, b: (x, a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]))

    def at_y(y):
        return lambda a, b: (a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]), y)

    pts = ring[:-1] if ring[0] == ring[-1] else ring
    for inside, cross in ((lambda p: p[0] >= WEST, at_x(WEST)), (lambda p: p[0] <= EAST, at_x(EAST)),
                          (lambda p: p[1] >= SOUTH, at_y(SOUTH)), (lambda p: p[1] <= NORTH, at_y(NORTH))):
        if not pts:
            return []
        pts = clip(pts, inside, cross)
    return pts


def clip_line(line):
    """The runs of a line that touch the box (whole segments, so nothing is cut short)."""
    inside = [WEST <= x <= EAST and SOUTH <= y <= NORTH for x, y in line]
    runs, run = [], []
    for i, p in enumerate(line):
        near = inside[i] or (i > 0 and inside[i - 1]) or (i + 1 < len(line) and inside[i + 1])
        if near:
            run.append(p)
        elif run:
            runs.append(run)
            run = []
    if run:
        runs.append(run)
    return [r for r in runs if len(r) > 1]


def simplify(points, eps):
    """Douglas–Peucker on an open line, without recursion."""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        (x1, y1), (x2, y2) = points[a], points[b]
        dx, dy = x2 - x1, y2 - y1
        norm = math.hypot(dx, dy) or 1e-12
        best, at = 0.0, -1
        for i in range(a + 1, b):
            d = abs(dy * (points[i][0] - x1) - dx * (points[i][1] - y1)) / norm
            if d > best:
                best, at = d, i
        if best > eps:
            keep[at] = True
            stack += [(a, at), (at, b)]
    return [p for p, k in zip(points, keep) if k]


def simplify_ring(ring, eps):
    far = max(range(len(ring)), key=lambda i: math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]))
    return simplify(ring[:far + 1], eps)[:-1] + simplify(ring[far:] + ring[:1], eps)[:-1]


def flat(points, digits):
    return [round(v, digits) for p in points for v in p]


def main():
    land = []
    for feature in download(COUNTRIES, "ne_10m_admin_0_countries.geojson")["features"]:
        portugal = feature["properties"].get("ADM0_A3") == "PRT"
        geom = feature["geometry"]
        polygons = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
        for polygon in polygons:
            ring = clip_ring([(p[0], p[1]) for p in polygon[0]])
            if len(ring) < 3:
                continue
            xs, ys = [p[0] for p in ring], [p[1] for p in ring]
            size = math.hypot(max(xs) - min(xs), max(ys) - min(ys))
            if not portugal and size < 0.05:  # specks of other countries
                continue
            ring = simplify_ring(ring, 0.004 if portugal else 0.02)
            if len(ring) < 3:  # an islet: keep it as a small triangle so it still shows
                ring = [(min(xs), min(ys)), (max(xs), min(ys)), ((min(xs) + max(xs)) / 2, max(ys))]
            land.append([1 if portugal else 0, flat(ring, 3 if portugal else 2)])
    land.sort(key=lambda item: (item[0], -len(item[1])))  # Portugal last, so it is drawn on top

    plates = []
    for feature in download(PLATES, "PB2002_boundaries.json")["features"]:
        geom = feature["geometry"]
        lines = geom["coordinates"] if geom["type"] == "MultiLineString" else [geom["coordinates"]]
        for line in lines:
            for run in clip_line([(p[0], p[1]) for p in line]):
                plates.append(flat(simplify(run, 0.01), 2))

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"land": land, "plates": plates, "labels": LABELS}, f, separators=(",", ":"), ensure_ascii=False)
    points = sum(len(item[1]) for item in land) // 2
    print(f"wrote {OUT}: {len(land)} land rings ({points} points, {sum(i[0] for i in land)} in Portugal), "
          f"{len(plates)} plate lines, {os.path.getsize(OUT)} bytes", file=sys.stderr)


if __name__ == "__main__":
    main()
