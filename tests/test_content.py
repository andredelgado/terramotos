from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import build_content  # noqa: E402


class ContentTests(unittest.TestCase):
    def test_markdown_subset_is_rendered_and_html_is_escaped(self):
        html = build_content.render(
            "## A heading\n\nOne *line*\nstill the **same** paragraph, with a [link](https://example.org/a).\n\n"
            "- first\n- second\n\n> quoted\n\n<script>alert(1)</script> [bad](javascript:alert(1))\n")
        self.assertIn("<h3>A heading</h3>", html)
        self.assertIn("<p>One <em>line</em> still the <strong>same</strong> paragraph, with a "
                      '<a href="https://example.org/a" target="_blank" rel="noopener">link</a>.</p>', html)
        self.assertIn("<ul><li>first</li><li>second</li></ul>", html)
        self.assertIn("<blockquote><p>quoted</p></blockquote>", html)
        self.assertIn("&lt;script&gt;", html)
        self.assertNotIn("<script>", html)
        self.assertNotIn('href="javascript', html)

    def test_index_lists_each_earthquake_with_its_languages(self):
        with tempfile.TemporaryDirectory() as folder:
            Path(folder, "20200101-ab12.en.md").write_text("---\ntitle: One\nsummary: First\n---\n\nText.\n", encoding="utf-8")
            Path(folder, "20200101-ab12.pt.md").write_text("---\ntitle: Um\n---\n\nTexto.\n", encoding="utf-8")
            Path(folder, "notes.txt").write_text("ignored", encoding="utf-8")
            files = build_content.build(folder)
        self.assertEqual(sorted(files), ["20200101-ab12.en.html", "20200101-ab12.pt.html", "index.json"])
        self.assertIn('{"id":"20200101-ab12","en":{"title":"One","summary":"First"},"pt":{"title":"Um","summary":""}}',
                      files["index.json"])
        self.assertEqual(files["20200101-ab12.pt.html"], "<p>Texto.</p>\n")

    def test_bad_files_are_refused(self):
        for name, text in (("story.md", "---\ntitle: x\n---\n"), ("20200101-ab12.en.md", "No header\n"),
                           ("20200101-ab12.en.md", "---\nsummary: no title\n---\nText\n")):
            with tempfile.TemporaryDirectory() as folder:
                Path(folder, name).write_text(text, encoding="utf-8")
                with self.assertRaises(ValueError):
                    build_content.build(folder)

    def test_published_text_matches_the_sources(self):
        done = subprocess.run([sys.executable, str(ROOT / "tools" / "build_content.py"), "--check"], capture_output=True, text=True)
        self.assertEqual(done.returncode, 0, done.stderr)


if __name__ == "__main__":
    unittest.main()
