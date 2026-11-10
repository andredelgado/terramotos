"""The three Portuguese regions, as coarse [lon, lat] polygons drawn for this catalogue.

- continente: the land border with Spain (Minho, Douro, Tejo, Guadiana), then out to sea far
  enough for the Gorringe bank, the Horseshoe plain and the Gulf of Cadiz margin up to the
  Guadiana meridian.
- acores: the islands with about 1.5 degrees of sea around them (Terceira rift, Gloria fault).
- madeira: Madeira, Porto Santo, the Desertas and the Selvagens.

The page gets the same polygons through meta.json, so the live feed is filtered the same way.
"""

REGIONS = {
    "continente": [(-13.0, 42.2), (-8.85, 42.2), (-8.15, 42.15), (-7.2, 41.9), (-6.55, 41.95),
                   (-6.2, 41.6), (-6.8, 41.05), (-6.8, 40.3), (-7.0, 39.65), (-7.0, 38.9),
                   (-7.25, 38.2), (-7.25, 38.0), (-7.45, 37.55), (-7.4, 37.15), (-7.4, 35.4),
                   (-13.0, 35.4)],
    "acores": [(-32.8, 41.2), (-23.6, 41.2), (-23.6, 35.6), (-32.8, 35.6)],
    "madeira": [(-18.2, 33.9), (-15.3, 33.9), (-15.3, 29.6), (-18.2, 29.6)],
}
NAMES = list(REGIONS)  # index order used in the site files

_pts = [p for poly in REGIONS.values() for p in poly]
# One box around all three regions for FDSN queries; events are then filtered by polygon.
BOX = {"minlatitude": min(p[1] for p in _pts), "maxlatitude": max(p[1] for p in _pts),
       "minlongitude": min(p[0] for p in _pts), "maxlongitude": max(p[0] for p in _pts)}


def region_of(lat, lon):
    """Name of the region containing the point, or None."""
    for name, poly in REGIONS.items():
        inside = False
        j = len(poly) - 1
        for i in range(len(poly)):
            xi, yi = poly[i]
            xj, yj = poly[j]
            if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
                inside = not inside
            j = i
        if inside:
            return name
    return None
