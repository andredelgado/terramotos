import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import build_places  # noqa: E402


class PlacesTests(unittest.TestCase):
    def test_slugs_drop_accents_and_punctuation(self):
        self.assertEqual(build_places.slug("Angra do Heroísmo"), "angra-do-heroismo")
        self.assertEqual(build_places.slug("Montemor-o-Novo"), "montemor-o-novo")
        self.assertEqual(build_places.slug("Évora"), "evora")

    def test_published_places_are_the_308_municipalities_inside_portugal(self):
        places = json.loads((ROOT / "site" / "places.json").read_text(encoding="utf-8"))
        self.assertEqual(len(places), 308)
        self.assertEqual(len({p[0] for p in places}), 308)
        for slug, name, lat, lon, area in places:
            self.assertRegex(slug, r"^[a-z0-9]+(-[a-z0-9]+)*$")
            self.assertTrue(name and area, slug)
            self.assertTrue(32 < lat < 42.3 and -31.5 < lon < -6, slug)
        by_slug = {p[0]: p for p in places}
        self.assertEqual(by_slug["lisboa"][1], "Lisboa")
        self.assertAlmostEqual(by_slug["lisboa"][2], 38.72, delta=0.03)
        self.assertEqual({by_slug["lagoa-faro"][4], by_slug["lagoa-acores"][4]}, {"Faro", "Açores"})


if __name__ == "__main__":
    unittest.main()
