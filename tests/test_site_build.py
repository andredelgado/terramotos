from pathlib import Path
from html.parser import HTMLParser
import json
import re
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import build_site
import site_archive


class Anchors(HTMLParser):
    def __init__(self, path):
        super().__init__()
        self.hrefs = []
        self.feed(path.read_text(encoding="utf-8"))

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self.hrefs.append(dict(attrs)["href"])


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
        template = Path(__file__).resolve().parents[1] / "site/index.html"
        (self.source / "index.html").write_bytes(template.read_bytes())
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
        for lang, home, method, region in [("pt", "/", "/metodologia/", "/sismos/continente/"),
                                            ("en", "/en/", "/en/methodology/", "/en/earthquakes/mainland/")]:
            page = self.output / home.strip("/") / "index.html"
            html = page.read_text()
            self.assertIn(f'<html lang="{lang}" data-home>', html)
            self.assertIn(f'rel="canonical" href="{build_site.SITE_URL}{home}"', html)
            self.assertIn('<span id="count">1</span>', html)
            self.assertIn(method, Anchors(page).hrefs)
            self.assertIn(region, Anchors(page).hrefs)
            method_html = (self.output / method.strip("/") / "index.html").read_text()
            data = json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', method_html)[1])
            self.assertEqual(data["@type"], "Dataset")
            self.assertIn(data["distribution"]["contentUrl"], method_html.split("</head>")[1])
        self.assertEqual((self.output / "rss.xml").read_bytes(), (self.source / "rss.xml").read_bytes())
        feed = ET.parse(self.output / "rss.xml").getroot()
        self.assertEqual(feed.findtext("channel/item/link"), "https://terramotos.com/sismo/20200101-abcd")
        self.assertEqual(feed.findtext("channel/item/guid"), "https://terramotos.com/sismo/20200101-abcd")
        namespace = {"s": build_site.SITEMAP}
        index = ET.parse(self.output / "sitemap.xml")
        self.assertEqual(len(index.findall("s:sitemap", namespace)), 3)
        for language, prefix in (("pt", ""), ("en", "/en")):
            page = ET.parse(self.output / f"sitemap-{language}-1.xml")
            self.assertEqual(page.findtext("s:url/s:loc", namespaces=namespace), f"https://terramotos.com{prefix}/sismo/20200101-abcd")
        self.assertIn("Sitemap: https://terramotos.com/sitemap.xml", (self.output / "robots.txt").read_text(encoding="utf-8"))
        # an unknown address gets a real page in its language, kept out of search results
        for folder, words in (("", "Página não encontrada"), ("en", "Page not found")):
            missing = (self.output / folder / "404.html").read_text(encoding="utf-8")
            self.assertIn(f"<h1>{words}</h1>", missing)
            self.assertIn('name="robots" content="noindex"', missing)
        self.assertIn("Strict-Transport-Security: max-age=31536000", (self.output / "_headers").read_text(encoding="utf-8"))
        record = json.loads((self.output / "pages/202001-5.json").read_text(encoding="utf-8"))["20200101-abcd"]
        self.assertEqual(record["event"]["m"], 2.3)
        self.assertEqual(record["nearby"], {"count": 0, "events": []})

    def test_home_links_and_year_pages_cover_the_catalogue_in_both_languages(self):
        n = site_archive.PAGE_SIZE + 1
        ids = [f"20200101-{i:04x}" for i in range(n)]
        packed = dict(self.packed)
        for key in ("m", "mt", "ma", "r", "d", "lat", "lon", "p", "s", "k"):
            packed[key] *= n
        packed.update(id=ids, t=[1] * n, places=["A & <B>"])
        (self.source / "data/years/2020.json").write_text(json.dumps(packed))
        (self.source / "data/meta.json").write_text(json.dumps({"total": n, "years": {"2020": {"n": n}}}))
        story = {"id": ids[0], "pt": {"title": "História & <texto>", "summary": ""}}
        (self.source / "content/index.json").write_text(json.dumps([story]))
        (self.source / "content" / f"{ids[0]}.pt.html").write_text("<p>História.</p>")
        build_site.build(self.source, self.output)
        home = self.output / "index.html"
        self.assertIn("História &amp; &lt;texto&gt;", home.read_text(encoding="utf-8"))
        sitemap = {x.text for x in ET.parse(self.output / "sitemap-archive.xml").iterfind(".//{*}loc")}
        for prefix, root in [("", "/arquivo/"), ("/en", "/en/archive/")]:
            home = self.output / prefix.strip("/") / "index.html"
            links = Anchors(home).hrefs
            event = prefix + "/sismo/"
            self.assertIn(root, links)
            self.assertIn(event + ids[0], links)  # story, older than the recent list
            self.assertTrue(all(event + i in links for i in ids[-6:]))
            year = root + "2020/"
            self.assertIn(year, Anchors(self.output / root.strip("/") / "index.html").hrefs)
            first = self.output / year.strip("/") / "index.html"
            second = self.output / year.strip("/") / "2/index.html"
            self.assertIn(year + "2/", Anchors(first).hrefs)
            self.assertIn(year, Anchors(second).hrefs)
            for number, path in enumerate((first, second), start=1):
                description = re.search(r'<meta name="description" content="([^"]+)">', path.read_text())[1]
                if prefix:
                    self.assertIn("on 2020-01-01", description)
                    self.assertIn(f"Page {number} of 2", description)
                else:
                    self.assertIn("em 01/01/2020", description)
                    self.assertIn(f"Página {number} de 2", description)
            event_links = [u for f in (first, second) for u in Anchors(f).hrefs if u.startswith(event)]
            self.assertEqual(set(event_links), {event + i for i in ids})
            self.assertIn("A &amp; &lt;B&gt;", first.read_text())
            # these pages share the earthquake pages' header, theme switch and styles, and write rows the same way
            page_html = first.read_text()
            self.assertIn('<button id="theme"', page_html)
            self.assertNotIn("archive.css", page_html)
            self.assertNotIn("@@", page_html)
            self.assertIn("<h1>Earthquakes in 2020</h1>" if prefix else "<h1>Sismos em 2020</h1>", page_html)
            self.assertIn("<b>M 2.3</b> · 1 January 2020 · 00:01 UTC" if prefix else "<b>M 2,3</b> · 1 de janeiro de 2020 · 00:01 UTC", page_html)
            self.assertTrue(all(build_site.SITE_URL + u in sitemap for u in (root, year, year + "2/")))

    def test_a_changed_import_gets_a_new_module_directory(self):
        build_site.build(self.source, self.output)
        first = next(self.output.glob("js-*"))
        (self.source / "js/child.js").write_text("// changed", encoding="utf-8")
        build_site.build(self.source, self.output)
        second = next(self.output.glob("js-*"))
        self.assertNotEqual(first.name, second.name)
        self.assertFalse(first.exists())
        self.assertIn(f'"/{second.name}/main.js"', (self.output / "index.html").read_text(encoding="utf-8"))
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
