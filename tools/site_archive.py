"""Static entry points to the earthquake catalogue. All navigation works without JavaScript."""
import datetime as dt
import json
from collections import defaultdict
from html import escape

PAGE_SIZE = 100
LANGS = ("en", "pt")


def archive_path(lang, year=None, page=1):
    root = "/arquivo/" if lang == "pt" else "/en/archive/"
    return root + (f"{year}/" if year else "") + (f"{page}/" if page > 1 else "")


def event_path(lang, event_id):
    return ("" if lang == "pt" else "/en") + "/sismo/" + escape(event_id, quote=True)


def stamp(event):
    return dt.datetime.fromtimestamp(event["t"], dt.timezone.utc)


def event_label(lang, event):
    date = stamp(event).strftime("%Y-%m-%d %H:%M:%S UTC")
    place = event["place"] or (("Continente", "Açores", "Madeira") if lang == "pt"
                               else ("Mainland", "Azores", "Madeira"))[event["r"]]
    mag = "Sem magnitude" if lang == "pt" else "No magnitude"
    if event["m"] is not None:
        mag = f'M {event["m"]:.1f}'
        if lang == "pt":
            mag = mag.replace(".", ",")
    return f'{date} · {mag} · {escape(place)}'


def event_list(lang, events):
    return "".join(f'<li><a href="{event_path(lang, e["id"])}">{event_label(lang, e)}</a></li>\n' for e in events)


def home_path(lang):
    return "/" if lang == "pt" else "/en/"


REGIONS = {
    "pt": [("Continente", "Sismos recentes em Portugal continental", "/sismos/continente/"),
           ("Açores", "Sismos recentes nos Açores", "/sismos/acores/"),
           ("Madeira", "Sismos recentes na Madeira", "/sismos/madeira/")],
    "en": [("Mainland", "Recent earthquakes in mainland Portugal", "/en/earthquakes/mainland/"),
           ("Azores", "Recent earthquakes in the Azores", "/en/earthquakes/azores/"),
           ("Madeira", "Recent earthquakes in Madeira", "/en/earthquakes/madeira/")],
}


def method_path(lang):
    return "/metodologia/" if lang == "pt" else "/en/methodology/"


def browse_links(lang):
    pt = lang == "pt"
    links = [(archive_path(lang), "Arquivo por ano" if pt else "Browse by year"),
             *[(path, label) for label, _, path in REGIONS[lang]],
             (method_path(lang), "Dados e metodologia" if pt else "Data and methodology")]
    return '<nav>' + "".join(f'<a href="{path}">{label}</a>' for path, label in links) + '</nav>'


def write_page(destination, origin, lang, path, alternate, title, description, body, schema=None):
    pt = lang == "pt"
    other = "en" if pt else "pt"
    markup = ('<script type="application/ld+json">' + json.dumps(schema, ensure_ascii=False).replace("<", r"\u003c")
              + '</script>') if schema else ""
    html = f"""<!doctype html>
<html lang="{lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{escape(title)} · Terramotos Portugal</title><meta name="description" content="{escape(description)}">
<link rel="canonical" href="{origin}{path}"><link rel="alternate" hreflang="{lang}" href="{origin}{path}">
<link rel="alternate" hreflang="{other}" href="{origin}{alternate}">{markup}
<link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/archive.css"></head><body>
<header><a href="{home_path(lang)}">Terramotos Portugal</a><a href="{alternate}" lang="{other}" hreflang="{other}">{"English" if pt else "Português"}</a></header>
<main><h1>{escape(title)}</h1><p>{escape(description)}</p>{body}</main></body></html>"""
    file = destination / path.strip("/") / "index.html"
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(html, encoding="utf-8")


def story_list(lang, stories):
    if not stories:
        return ""
    rows = "".join(f'<li><a href="{event_path(lang, item["id"])}">'
                   f'{escape((item.get(lang) or item.get("pt") or item["en"])["title"])}</a></li>' for item in stories)
    return '<h2>' + ("Sismos históricos" if lang == "pt" else "Historical earthquakes") + '</h2><ul>' + rows + '</ul>'


def write_archive(destination, events, stories, origin):
    years = defaultdict(list)
    for event in reversed(events):
        years[stamp(event).year].append(event)
    paths = []
    for lang in LANGS:
        pt = lang == "pt"
        other = "en" if pt else "pt"
        name = "Arquivo de sismos" if pt else "Earthquake archive"
        page_word = "Página" if pt else "Page"

        def write(year, page, title, description, body):
            path = archive_path(lang, year, page)
            alternate = archive_path(other, year, page)
            write_page(destination, origin, lang, path, alternate, title, description, body)
            paths.append(path)

        def count(n):
            return f'{n} ' + (("sismo" if pt else "earthquake") if n == 1 else ("sismos" if pt else "earthquakes"))

        rows = (f'<li><a href="{archive_path(lang, y)}">{y} <small>({count(len(group))})</small></a></li>'
                for y, group in years.items())
        write(None, 1, name, "Escolha um ano para consultar os sismos registados em Portugal."
              if pt else "Choose a year to browse recorded earthquakes in Portugal.", story_list(lang, stories) + '<ul class="years">' + "".join(rows) + '</ul>')
        for year, group in years.items():
            pages = (len(group) + PAGE_SIZE - 1) // PAGE_SIZE
            for i in range(pages):
                page = i + 1
                title = f'Sismos em {year}' if pt else f'Earthquakes in {year}'
                if pages > 1:
                    title += f' · {page_word} {page}/{pages}'
                desc = f'{count(len(group))}. ' + ("Do mais recente ao mais antigo. Horas em UTC." if pt
                                                    else "Newest first. Times in UTC.")
                nav = f'<nav><a href="{archive_path(lang)}">{name}</a>'
                if i:
                    nav += f'<a rel="prev" href="{archive_path(lang, year, page - 1)}">← {"Mais recentes" if pt else "Newer"}</a>'
                if page < pages:
                    nav += f'<a rel="next" href="{archive_path(lang, year, page + 1)}">{"Mais antigos" if pt else "Older"} →</a>'
                nav += '</nav>'
                # Direct date-range links on the first page keep even the busiest year shallow.
                jump = ""
                if page == 1 and pages > 1:
                    choices = (f'<li><a href="{archive_path(lang, year, j + 1)}">{page_word} {j + 1} · '
                               f'{stamp(group[j * PAGE_SIZE]):%Y-%m-%d} – '
                               f'{stamp(group[min((j + 1) * PAGE_SIZE, len(group)) - 1]):%Y-%m-%d}</a></li>'
                               for j in range(1, pages))
                    jump = ('<details><summary>' + ("Escolher por data" if pt else "Choose by date")
                            + '</summary><ul>' + "".join(choices) + '</ul></details>')
                items = event_list(lang, group[i * PAGE_SIZE:page * PAGE_SIZE])
                featured = story_list(lang, [s for s in stories if s["id"].startswith(str(year))]) if page == 1 else ""
                write(year, page, title, desc, f'{nav}{featured}{jump}<ul class="events">{items}</ul>{nav}')
    return paths


def write_landings(destination, events, generated, origin):
    paths = []
    snapshot = dt.datetime.fromisoformat(generated.replace("Z", "+00:00")) if generated else stamp(events[-1])
    today = snapshot.date()
    middle, start = today - dt.timedelta(days=30), today - dt.timedelta(days=60)
    regional = [[e for e in reversed(events) if e["r"] == r] for r in range(3)]
    first, last = stamp(events[0]).date(), stamp(events[-1]).date()
    download = "https://github.com/andredelgado/terramotos/releases/download/dataset/terramotos-portugal.zip"
    license_url = "https://creativecommons.org/licenses/by-nc/4.0/"
    sources = [("IPMA", "https://api.ipma.pt/"), ("ISC Bulletin", "https://doi.org/10.31905/D808B830"),
               ("EMSC", "https://www.seismicportal.eu/"), ("USGS", "https://earthquake.usgs.gov/")]
    source_links = ", ".join(f'<a href="{url}">{name}</a>' for name, url in sources)
    for lang in LANGS:
        pt = lang == "pt"
        other = "en" if pt else "pt"
        nav = browse_links(lang)
        for r, (_, title, path) in enumerate(REGIONS[lang]):
            group = regional[r]
            dates = [stamp(e).date() for e in group]
            previous = sum(start <= d < middle for d in dates)
            recent = sum(middle <= d < today for d in dates)
            end_day = today - dt.timedelta(days=1)
            middle_day = middle - dt.timedelta(days=1)
            comparison = (f"Entre {middle} e {end_day}, o catálogo registou {recent} sismos nesta região. "
                          f"Nos 30 dias anteriores ({start} a {middle_day}), registou {previous}." if pt else
                          f"The catalogue recorded {recent} earthquakes in this region from {middle} to {end_day}. "
                          f"In the preceding 30 days ({start} to {middle_day}), it recorded {previous}.")
            desc = (f"{len(group)} registos no catálogo para esta região, incluindo a área marítima envolvente. Horas em UTC."
                    if pt else f"{len(group)} catalogue records for this region, including the surrounding sea. Times in UTC.")
            body = (f'<p><a href="{home_path(lang)}#v=map&amp;period=30d&amp;r={r}">'
                    + ("Ver os últimos 30 dias no mapa" if pt else "See the last 30 days on the map")
                    + '</a></p><h2>' + ("Comparação de dois períodos de 30 dias" if pt else "Two 30-day periods compared")
                    + '</h2><p>' + comparison + '</p><h2>' + ("Últimos registos" if pt else "Latest records")
                    + '</h2><ul class="events">' + event_list(lang, group[:20]) + '</ul>' + nav)
            write_page(destination, origin, lang, path, REGIONS[other][r][2], title, desc, body)
            paths.append(path)
        title = "Catálogo de sismos de Portugal" if pt else "Portugal earthquake dataset"
        desc = (f"{len(events)} sismos no continente, nos Açores e na Madeira, de {first} a {last}, incluindo as zonas marítimas."
                if pt else f"{len(events)} earthquakes in mainland Portugal, the Azores and Madeira from {first} to {last}, including offshore areas.")
        method = ("Os registos de diferentes fontes são associados quando distam até 30 segundos e 100 km. "
                  "Antes de 1964 usam-se 60 segundos e 250 km. Para a hora e o epicentro, a ordem de preferência é IPMA, ISC, EMSC e USGS. "
                  "Usa-se a magnitude do IPMA quando disponível, seguida da magnitude de momento (Mw) e da magnitude da fonte preferida."
                  if pt else "Reports from different sources are matched within 30 seconds and 100 km. Before 1964, the thresholds are 60 seconds and 250 km. "
                  "Origin time and epicentre use the first available source in the order IPMA, ISC, EMSC and USGS. "
                  "Magnitude uses IPMA’s measurement when available, then moment magnitude (Mw), then the preferred source’s measurement.")
        limits = ("As revisões das agências podem alterar os registos. Antes da década de 1960 registavam-se sobretudo sismos fortes. "
                  "Muitos registos antigos não têm magnitude e as medições usam escalas diferentes. As contagens dependem da cobertura das redes."
                  if pt else "Agencies revise their records. Before the 1960s, monitoring mainly captured large earthquakes. "
                  "Many older records lack a magnitude and measurements use different scales. Counts depend on monitoring coverage.")
        terms = ("A compilação tem licença" if pt else "The compilation is licensed under")
        attribution = ("A utilização não comercial exige atribuição ao projeto e às fontes indicadas em cada registo. Aplicam-se também os termos de cada fonte."
                       if pt else "Non-commercial reuse requires attribution to the project and to the sources listed for each record. Each source’s terms also apply.")
        path = method_path(lang)
        schema = {"@context": "https://schema.org", "@type": "Dataset", "@id": origin + path + "#dataset",
                  "url": origin + path, "name": title, "description": desc, "inLanguage": lang,
                  "temporalCoverage": f"{first}/{last}", "spatialCoverage": {"@type": "Place", "name": "Portugal"},
                  "creator": {"@type": "Organization", "name": "Terramotos Portugal", "url": origin + "/"},
                  "license": license_url, "isBasedOn": [url for _, url in sources],
                  "distribution": {"@type": "DataDownload", "contentUrl": download, "encodingFormat": "application/zip"}}
        body = (f'<p><a href="{download}">' + ("Descarregar os dados (ZIP)" if pt else "Download the data (ZIP)")
                + '</a></p><h2>' + ("Fontes e metodologia" if pt else "Sources and methodology") + '</h2><p>'
                + source_links + '.</p><p>' + method + '</p><p>' + limits + '</p><h2>'
                + ("Licença e atribuição" if pt else "Licence and attribution") + f'</h2><p>{terms} <a href="{license_url}">CC BY-NC 4.0</a>. '
                + attribution + ' <a href="https://github.com/andredelgado/terramotos/blob/main/DATA.md">'
                + ("Documentação e termos das fontes" if pt else "Documentation and source terms") + '</a>.</p>' + nav)
        write_page(destination, origin, lang, path, method_path(other), title, desc, body, schema)
        paths.append(path)
    return paths
