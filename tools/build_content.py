#!/usr/bin/env python3
"""Build the earthquake pages' own text from content/quakes/*.md.

Reads   content/quakes/<id>.<lang>.md   (see content/README.md)
Writes  site/content/index.json         which earthquakes have text, with titles and summaries
        site/content/<id>.<lang>.html   the text of each, as HTML

Usage: python3 tools/build_content.py [--check]
--check changes nothing and fails when site/content/ is not what the sources would produce.
"""
import argparse
import html
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, "content", "quakes")
OUT = os.path.join(ROOT, "site", "content")
LANGS = ("en", "pt")
NAME = re.compile(r"^(\d{8}-[0-9a-f]+)\.(en|pt)\.md$")


def inline(text):
    """Escape a line, then allow links, **strong** and *emphasis*."""
    out = html.escape(text, quote=True)
    out = re.sub(r"\[([^\]]+)\]\((https?://[^\s)]+)\)", r'<a href="\2" target="_blank" rel="noopener">\1</a>', out)
    out = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", out)
    return re.sub(r"\*(.+?)\*", r"<em>\1</em>", out)


def render(markdown):
    """A small, safe subset of Markdown: paragraphs, ## headings, - lists and > quotes."""
    blocks = []
    for block in re.split(r"\n\s*\n", markdown.strip()):
        lines = [line.rstrip() for line in block.split("\n") if line.strip()]
        if not lines:
            continue
        if re.match(r"^#{1,3} ", lines[0]) and len(lines) == 1:
            blocks.append(f"<h3>{inline(lines[0].lstrip('#').strip())}</h3>")
        elif all(line.lstrip().startswith("- ") for line in lines):
            blocks.append("<ul>" + "".join(f"<li>{inline(line.lstrip()[2:])}</li>" for line in lines) + "</ul>")
        elif all(line.startswith(">") for line in lines):
            blocks.append(f"<blockquote><p>{inline(' '.join(line[1:].strip() for line in lines))}</p></blockquote>")
        else:
            blocks.append(f"<p>{inline(' '.join(line.strip() for line in lines))}</p>")
    return "\n".join(blocks) + "\n"


def parse(text, name):
    """Split a file into its header fields and its Markdown."""
    match = re.match(r"^---\n(.*?)\n---\n(.*)$", text.replace("\r\n", "\n"), re.S)
    if not match:
        raise ValueError(f"{name}: the file must start with a header between two --- lines")
    fields = {}
    for line in match.group(1).split("\n"):
        if line.strip():
            key, sep, value = line.partition(":")
            if not sep:
                raise ValueError(f"{name}: header line without a colon: {line!r}")
            fields[key.strip()] = value.strip()
    if not fields.get("title"):
        raise ValueError(f"{name}: the header needs a title")
    return fields, match.group(2)


def build(source=SOURCE):
    """Return {relative file name: contents} for everything site/content/ should hold."""
    pages = {}
    for name in sorted(os.listdir(source)) if os.path.isdir(source) else []:
        match = NAME.match(name)
        if not match:
            if name.endswith(".md"):
                raise ValueError(f"{name}: expected <id>.<en|pt>.md, like 19690228-c63c.pt.md")
            continue
        with open(os.path.join(source, name), encoding="utf-8") as f:
            fields, body = parse(f.read(), name)
        pages.setdefault(match.group(1), {})[match.group(2)] = (fields, render(body))
    files, index = {}, []
    for eid, by_lang in sorted(pages.items()):
        entry = {"id": eid}
        for lang in LANGS:
            if lang not in by_lang:
                continue
            fields, body = by_lang[lang]
            entry[lang] = {"title": fields["title"], "summary": fields.get("summary", "")}
            files[f"{eid}.{lang}.html"] = body
        index.append(entry)
    files["index.json"] = json.dumps(index, ensure_ascii=False, separators=(",", ":")) + "\n"
    return files


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--check", action="store_true", help="fail if site/content/ is out of date; write nothing")
    args = ap.parse_args()
    files = build()
    current = {}
    if os.path.isdir(OUT):
        for name in os.listdir(OUT):
            with open(os.path.join(OUT, name), encoding="utf-8") as f:
                current[name] = f.read()
    if args.check:
        if current != files:
            sys.exit("site/content/ is out of date: run python3 tools/build_content.py")
        return
    os.makedirs(OUT, exist_ok=True)
    for name in current.keys() - files.keys():
        os.remove(os.path.join(OUT, name))
    for name, body in files.items():
        if current.get(name) != body:
            with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
                f.write(body)
    print(f"site/content: {len(files) - 1} texts for {len(json.loads(files['index.json']))} earthquakes")


if __name__ == "__main__":
    main()
