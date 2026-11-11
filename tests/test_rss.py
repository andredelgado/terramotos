import datetime as dt
from email.utils import parsedate_to_datetime
from html import unescape
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET

from quake.rss import ATOM, ITEM_LIMIT, SITE_URL, write_rss
from quake.store import FIELDS, Store

ROOT = Path(__file__).resolve().parents[1]
START = dt.datetime(2020, 1, 1, tzinfo=dt.timezone.utc).timestamp()


def record(sid="one", **changes):
    row = dict.fromkeys(FIELDS)
    row.update(sid=sid, time=START, lat=38.1, lon=-28.2, depth=10, mag=2.3,
               mag_type="ML", mag_author="IPMA", place="São Jorge", region="acores")
    row.update(changes)
    return row


class FeedTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.site = Path(self.folder.name) / "site"
        self.store = Store(":memory:")
        self.addCleanup(self.store.close)

    def replace(self, source, records):
        self.store.replace(source, START - 60, START + 86400, records)
        self.store.rebuild_dirty()

    def export(self):
        self.store.export_site(self.site)
        return ET.parse(self.site / "rss.xml").getroot()

    def test_export_limits_and_orders_merged_earthquakes_with_utc_dates(self):
        records = [record(str(i), time=START + 120 * i) for i in range(ITEM_LIMIT + 5)]
        self.replace("ipma", records)
        root = self.export()
        self.assertEqual(root.attrib, {"version": "2.0"})
        channel = root.find("channel")
        self.assertEqual(channel.findtext("title"), "Terramotos Portugal")
        self.assertEqual(channel.findtext("link"), "https://terramotos.com/")
        self.assertTrue(channel.findtext("description"))
        self.assertEqual(channel.findtext("language"), "pt-PT")
        self.assertEqual(channel.findtext("ttl"), "60")
        self.assertEqual(channel.find(f"{{{ATOM}}}link").attrib,
                         {"href": SITE_URL + "rss.xml", "rel": "self", "type": "application/rss+xml"})
        self.assertEqual(parsedate_to_datetime(channel.findtext("lastBuildDate")).utcoffset(), dt.timedelta(0))
        items = channel.findall("item")
        self.assertEqual(len(items), ITEM_LIMIT)
        self.assertEqual([parsedate_to_datetime(item.findtext("pubDate")).timestamp() for item in items],
                         [row["time"] for row in reversed(records[5:])])
        self.assertEqual(len({item.findtext("guid") for item in items}), ITEM_LIMIT)
        for item in items:
            self.assertEqual(item.find("guid").attrib, {"isPermaLink": "true"})
            self.assertEqual(item.findtext("guid"), item.findtext("link"))
            self.assertTrue(item.findtext("link").startswith(SITE_URL + "sismo/20200101-"))

    def test_sources_merge_and_revisions_reuse_the_guid_even_after_archive_rebuild(self):
        self.replace("ipma", [record()])
        self.replace("emsc", [record("emsc-id", time=START + 5, mag=2.4, mag_author="EMSC")])
        items = self.export().findall("channel/item")
        self.assertEqual(len(items), 1)
        original_guid = items[0].findtext("guid")
        self.assertIn("IPMA, EMSC", items[0].findtext("description"))
        self.replace("ipma", [record(time=START + 2, mag=2.6, place="Revised place")])
        item = self.export().find("channel/item")
        self.assertEqual(item.findtext("guid"), original_guid)
        self.assertEqual(item.findtext("title"), "M 2.6 · Revised place")
        archive = Path(self.folder.name) / "archive"
        self.store.export_archive(archive)
        restored = Store(":memory:")
        self.addCleanup(restored.close)
        restored.import_archive(archive)
        restored.rebuild_dirty()
        restored.export_site(self.site)
        self.assertEqual(ET.parse(self.site / "rss.xml").findtext("channel/item/guid"), original_guid)
        self.replace("ipma", [])
        self.replace("emsc", [])
        self.replace("ipma", [record("replacement", time=START + 600)])
        self.assertNotEqual(self.export().findtext("channel/item/guid"), original_guid)

    def test_unicode_html_escaping_and_optional_measurements(self):
        place = 'São Jorge & Faial <img src="x" onerror="bad()">'
        self.replace("ipma", [record(place=place, mag=0, depth=0, felt=1, intensity="III–IV")])
        item = self.export().find("channel/item")
        self.assertEqual(item.findtext("title"), "M 0.0 · " + place)
        description = item.findtext("description")
        self.assertNotIn("<img", description)
        self.assertIn(place, unescape(description))
        for detail in ("Profundidade: 0.0 km", "Coordenadas: 38.1000, -28.2000", "Intensidade: III–IV",
                       "Sentido pela população", "Magnitude: 0.0 ML", "Fontes: IPMA"):
            self.assertIn(detail, description)
        self.replace("ipma", [record(place="", mag=None, depth=None, felt=None, intensity=None)])
        item = self.export().find("channel/item")
        self.assertEqual(item.findtext("title"), "Magnitude não disponível · Açores")
        self.assertEqual(item.findtext("category"), "Açores")
        for missing in ("Profundidade:", "Intensidade:", "Sentido pela população"):
            self.assertNotIn(missing, item.findtext("description"))

    def test_export_command_generates_feed_at_custom_destination_and_base_url(self):
        database = Path(self.folder.name) / "catalogue.sqlite"
        store = Store(database)
        store.replace("ipma", START, START + 60, [record()])
        store.rebuild_dirty()
        store.close()
        result = subprocess.run([sys.executable, str(ROOT / "update.py"), "export", "--db", str(database),
                                 "--site", str(self.site), "--site-url", "https://example.org/earthquakes"],
                                cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        channel = ET.parse(self.site / "rss.xml").find("channel")
        self.assertEqual(channel.findtext("link"), "https://example.org/earthquakes/")
        self.assertTrue(channel.findtext("item/link").startswith("https://example.org/earthquakes/sismo/"))
        self.assertEqual(channel.find(f"{{{ATOM}}}link").get("href"), "https://example.org/earthquakes/rss.xml")
        self.assertTrue((self.site / "data" / "meta.json").is_file())

    def test_failed_write_preserves_previous_feed_and_removes_temporary_file(self):
        self.replace("ipma", [record()])
        self.export()
        previous = (self.site / "rss.xml").read_bytes()
        with patch("quake.rss.os.replace", side_effect=OSError("disk unavailable")):
            with self.assertRaises(OSError):
                self.export()
        self.assertEqual((self.site / "rss.xml").read_bytes(), previous)
        self.assertEqual(sorted(path.name for path in self.site.iterdir()), ["data", "rss.xml"])

    def test_empty_feed_remains_valid(self):
        path = Path(self.folder.name) / "empty.xml"
        write_rss(path, [])
        channel = ET.parse(path).find("channel")
        self.assertTrue(channel.findtext("title"))
        self.assertEqual(channel.findall("item"), [])


if __name__ == "__main__":
    unittest.main()
