from pathlib import Path
import json
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import build_site


class SiteBuildTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.source = Path(self.folder.name) / "site"
        self.output = Path(self.folder.name) / "dist"
        (self.source / "data/years").mkdir(parents=True)
        (self.source / "js").mkdir()
        (self.source / "content").mkdir()
        (self.source / "content/index.json").write_text("[]", encoding="utf-8")
        (self.source / "index.html").write_text('<link href="app.css"><script src="js/main.js"></script><link rel="canonical" href="https://terramotos.com/"></head>', encoding="utf-8")
        (self.source / "app.css").write_text("body{color:black}", encoding="utf-8")
        (self.source / "js/main.js").write_text("import './child.js';", encoding="utf-8")
        (self.source / "js/child.js").write_text("// child", encoding="utf-8")
        (self.source / "data/meta.json").write_text(json.dumps({"total": 1, "years": {"2020": {"n": 1}}}), encoding="utf-8")
        self.packed = {"year": 2020, "id": ["20200101-abcd"], "t": [0], "m": [23], "mt": [1], "mtypes": ["", "ML"],
                       "ma": [1], "authors": ["", "IPMA"], "r": [0], "d": [10], "lat": [3840], "lon": [-920],
                       "p": [0], "places": ["Test"], "s": [1], "k": [""], "felt": [], "intensity": []}
        (self.source / "data/years/2020.json").write_text(json.dumps(self.packed), encoding="utf-8")
        (self.source / "rss.xml").write_text('''<rss xmlns:atom="http://www.w3.org/2005/Atom"><channel>
<link>https://terramotos.com/</link><atom:link href="https://terramotos.com/rss.xml"/>
<item><link>https://terramotos.com/sismo/20200101-abcd</link><guid isPermaLink="true">https://terramotos.com/sismo/20200101-abcd</guid></item></channel></rss>''', encoding="utf-8")

    def test_build_prepares_pages_and_sitemaps_without_changing_source_or_feed(self):
        source_index = (self.source / "index.html").read_bytes()
        count, assets = build_site.build(self.source, self.output)
        self.assertEqual(count, 1)
        self.assertLess(assets, 20000)
        self.assertEqual((self.source / "index.html").read_bytes(), source_index)
        index = (self.output / "index.html").read_text(encoding="utf-8")
        self.assertIn('rel="canonical" href="https://terramotos.com/"', index)
        self.assertEqual((self.output / "rss.xml").read_bytes(), (self.source / "rss.xml").read_bytes())
        feed = ET.parse(self.output / "rss.xml").getroot()
        self.assertEqual(feed.findtext("channel/item/link"), "https://terramotos.com/sismo/20200101-abcd")
        self.assertEqual(feed.findtext("channel/item/guid"), "https://terramotos.com/sismo/20200101-abcd")
        namespace = {"s": build_site.SITEMAP}
        index = ET.parse(self.output / "sitemap.xml")
        self.assertEqual(len(index.findall("s:sitemap", namespace)), 2)
        for language, prefix in (("pt", ""), ("en", "/en")):
            page = ET.parse(self.output / f"sitemap-{language}-1.xml")
            self.assertEqual(page.findtext("s:url/s:loc", namespaces=namespace), f"https://terramotos.com{prefix}/sismo/20200101-abcd")
        self.assertIn("Sitemap: https://terramotos.com/sitemap.xml", (self.output / "robots.txt").read_text(encoding="utf-8"))
        record = json.loads((self.output / "pages/202001-5.json").read_text(encoding="utf-8"))["20200101-abcd"]
        self.assertEqual(record["event"]["m"], 2.3)
        self.assertEqual(record["nearby"], {"count": 0, "events": []})

    def test_a_changed_import_gets_a_new_module_directory(self):
        build_site.build(self.source, self.output)
        first = next(self.output.glob("js-*"))
        (self.source / "js/child.js").write_text("// changed", encoding="utf-8")
        build_site.build(self.source, self.output)
        second = next(self.output.glob("js-*"))
        self.assertNotEqual(first.name, second.name)
        self.assertFalse(first.exists())
        self.assertIn(f'"{second.name}/main.js"', (self.output / "index.html").read_text(encoding="utf-8"))
        self.assertEqual((second / "main.js").read_text(encoding="utf-8"), "import './child.js';")

    def test_the_source_or_its_parent_cannot_be_used_as_build_output(self):
        for output in [self.source, self.source.parent, self.source / "inside"]:
            with self.assertRaises(ValueError):
                build_site.build(self.source, output)
        self.assertTrue((self.source / "index.html").exists())

    def test_prepared_neighbours_cross_years_and_exclude_distant_quakes(self):
        previous = dict(self.packed)
        previous.update(year=2019, id=["20191230-abcd"], t=[363 * 86400])
        (self.source / "data/years/2019.json").write_text(json.dumps(previous), encoding="utf-8")
        meta = {"total": 2, "years": {"2019": {"n": 1}, "2020": {"n": 1}}}
        (self.source / "data/meta.json").write_text(json.dumps(meta), encoding="utf-8")
        build_site.build(self.source, self.output)
        record = json.loads((self.output / "pages/202001-5.json").read_text(encoding="utf-8"))["20200101-abcd"]
        self.assertEqual(record["nearby"]["count"], 1)
        self.assertEqual(record["nearby"]["events"][0]["id"], "20191230-abcd")
        previous["lon"] = [-2700]
        (self.source / "data/years/2019.json").write_text(json.dumps(previous), encoding="utf-8")
        build_site.build(self.source, self.output)
        record = json.loads((self.output / "pages/202001-5.json").read_text(encoding="utf-8"))["20200101-abcd"]
        self.assertEqual(record["nearby"]["count"], 0)


if __name__ == "__main__":
    unittest.main()
