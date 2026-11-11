// Give the archive, region and methodology pages the same page as the earthquake pages.
//
// Those pages are written by tools/site_archive.py, but their head, header, styles and credits
// come from hosting/render.mjs, and their place names from the app's translations, so that the
// whole site reads as one. Input (stdin): { places: [name, …] }. Output: the page for each
// language with @@NAME@@ where Python fills in a value, the Portuguese form of each place, and
// the page shown for an address that does not exist.
import { readFileSync } from 'node:fs';
import { documentHTML, renderNotFound } from '../hosting/render.mjs';
import { translatedPlace } from '../site/js/names.js';

const { places } = JSON.parse(readFileSync(0, 'utf8'));
const shell = Object.fromEntries(['pt', 'en'].map((lang) => [lang, documentHTML({
  lang, title: '@@TITLE@@', description: '@@DESCRIPTION@@', canonical: '@@CANONICAL@@', alternate: '@@ALTERNATE@@',
  body: '@@BODY@@', head: '@@HEAD@@', type: 'website',
})]));
const translated = Object.fromEntries(places.map((place) => [place, translatedPlace(place, 'pt')]).filter(([place, pt]) => pt !== place));
process.stdout.write(JSON.stringify({ shell, places: translated, notFound: { pt: renderNotFound('pt'), en: renderNotFound('en') } }));
