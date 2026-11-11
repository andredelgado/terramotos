# Earthquake pages

Every earthquake has a page in the app. A file here adds your own text to one of them, and puts
that earthquake in the Stories list.

One file per earthquake and language, named after the earthquake's id (the `q=` or `page=` value
in its link):

    content/quakes/19690228-c63c.en.md
    content/quakes/19690228-c63c.pt.md

Each file starts with a short header and then the text:

    ---
    title: 28 February 1969
    summary: The largest earthquake in the catalogue
    ---

    First paragraph.

    Second paragraph, with *emphasis*, **strong text** and a [link](https://example.org).

The text may use paragraphs, `##` headings, `-` lists, `>` quotes, emphasis and links. Anything
else is shown as plain text. A text in only one language is shown in both. `key:` is optional and
keeps an old `#story=` link working.

Run `python3 tools/build_content.py` after editing; it writes `site/content/`, which is committed
so the page works locally and in the tests. The publishing workflow runs it again, so the
published site always matches the `.md` files.
