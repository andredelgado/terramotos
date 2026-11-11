"""Static entry points to the earthquake catalogue. All navigation works without JavaScript."""
import datetime as dt
import json
import subprocess
from collections import defaultdict
from html import escape
from pathlib import Path

PAGE_SIZE = 100
LANGS = ("en", "pt")
MONTHS = {"pt": "janeiro fevereiro março abril maio junho julho agosto setembro outubro novembro dezembro".split(),
          "en": "January February March April May June July August September October November December".split()}
# The page (head, header, styles, credits) and the Portuguese place names come from the same code
# as the earthquake pages, so that these pages look and read like the rest of the site.
CHROME = {"shell": None, "places": {}}


def prepare(events):
    """Fetch the shared page and the translations of these events' places; one call per build."""
    places = sorted({e["place"] for e in events if e["place"]})
    if CHROME["shell"] and all(p in CHROME["seen"] for p in places):
        return
    done = subprocess.run(["node", str(Path(__file__).resolve().parent / "render_chrome.mjs")],
                          input=json.dumps({"places": places}), stdout=subprocess.PIPE, text=True, check=True)
    CHROME.update(json.loads(done.stdout), seen=set(places))


def number(lang, n):
    """A count with the language's thousands separator: 1 742 in Portuguese, 1,742 in English."""
    return f"{n:,}".replace(",", "\u00a0" if lang == "pt" else ",")


def archive_path(lang, year=None, page=1):
    root = "/arquivo/" if lang == "pt" else "/en/archive/"
    return root + (f"{year}/" if year else "") + (f"{page}/" if page > 1 else "")


def event_path(lang, event_id):
    return ("" if lang == "pt" else "/en") + "/sismo/" + escape(event_id, quote=True)


def stamp(event):
    return dt.datetime.fromtimestamp(event["t"], dt.timezone.utc)


def event_label(lang, event):
    """One row, written like the nearby earthquakes on an earthquake's page."""
    when = stamp(event)
    month = MONTHS[lang][when.month - 1]
    date = f"{when.day} de {month} de {when.year}" if lang == "pt" else f"{when.day} {month} {when.year}"
    place = event["place"] or (("Continente", "Açores", "Madeira") if lang == "pt"
                               else ("Mainland", "Azores", "Madeira"))[event["r"]]
    if lang == "pt":
        place = CHROME["places"].get(place, place)
    mag = "Sem magnitude" if lang == "pt" else "No magnitude"
    if event["m"] is not None:
        mag = f'M {event["m"]:.1f}'
        if lang == "pt":
            mag = mag.replace(".", ",")
    return f'<b>{mag}</b> · {date} · {when:%H:%M} UTC<span>{escape(place)}</span>'


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


def browse_links(lang, archive=True):
    pt = lang == "pt"
    links = [*([(archive_path(lang), "Arquivo por ano" if pt else "Browse by year")] if archive else []),
             *[(path, label) for label, _, path in REGIONS[lang]],
             (method_path(lang), "Dados e metodologia" if pt else "Data and methodology")]
    return '<nav>' + "".join(f'<a href="{path}">{label}</a>' for path, label in links) + '</nav>'


def write_page(destination, origin, lang, path, alternate, title, description, body, schema=None, heading=None, kicker=""):
    """Write one page. heading is the visible title when it differs from the document's; kicker is the small line above it."""
    if not CHROME["shell"]:
        prepare([])
    markup = ('<script type="application/ld+json">' + json.dumps(schema, ensure_ascii=False).replace("<", r"\u003c")
              + '</script>') if schema else ""
    content = ((f'<p class="meta">{kicker}</p>' if kicker else "") + f'<h1>{escape(heading or title)}</h1>'
               f'<p class="lede">{escape(description)}</p>{body}')
    html = CHROME["shell"][lang]
    for name, value in (("TITLE", escape(title)), ("DESCRIPTION", escape(description)), ("CANONICAL", origin + path),
                        ("ALTERNATE", origin + alternate), ("HEAD", markup), ("BODY", content)):
        html = html.replace(f"@@{name}@@", value)
    file = destination / path.strip("/") / "index.html"
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(html, encoding="utf-8")


def story_list(lang, stories):
    if not stories:
        return ""
    rows = "".join(f'<li><a href="{event_path(lang, item["id"])}">'
                   f'{escape((item.get(lang) or item.get("pt") or item["en"])["title"])}</a></li>' for item in stories)
    return '<h2>' + ("Sismos históricos" if lang == "pt" else "Historical earthquakes") + '</h2><ul class="plain">' + rows + '</ul>'


def write_archive(destination, events, stories, origin):
    prepare(events)
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
            # the page number stays in the document title, which must be unique, and moves out of the heading
            heading, _, part = title.partition(" · ")
            kicker = ""
            if year:
                kicker = f'<a href="{archive_path(lang)}">{name}</a>' + (f' · {part.replace("/", " de " if pt else " of ")}' if part else "")
            write_page(destination, origin, lang, path, alternate, title, description, body, heading=heading, kicker=kicker)
            paths.append(path)

        def count(n):
            return f'{n} ' + (("sismo" if pt else "earthquake") if n == 1 else ("sismos" if pt else "earthquakes"))

        rows = (f'<li><a href="{archive_path(lang, y)}"><span>{y}</span><small>{number(lang, len(group))}</small></a></li>'
                for y, group in years.items())
        write(None, 1, name, "Escolha um ano para consultar os sismos registados em Portugal."
              if pt else "Choose a year to browse recorded earthquakes in Portugal.", story_list(lang, stories) + '<h2>' + ("Por ano" if pt else "By year") + '</h2><ul class="years">' + "".join(rows) + '</ul>'
              + '<h2>' + ("Por região" if pt else "By region") + '</h2>' + browse_links(lang, archive=False))
        for year, group in years.items():
            pages = (len(group) + PAGE_SIZE - 1) // PAGE_SIZE
            for i in range(pages):
                page = i + 1
                title = f'Sismos em {year}' if pt else f'Earthquakes in {year}'
                if pages > 1:
                    title += f' · {page_word} {page}/{pages}'
                records = group[i * PAGE_SIZE:page * PAGE_SIZE]
                earliest, latest = stamp(records[-1]).date(), stamp(records[0]).date()
                if pt:
                    period = (f"em {earliest:%d/%m/%Y}" if earliest == latest
                              else f"de {earliest:%d/%m/%Y} a {latest:%d/%m/%Y}")
                    desc = f"Sismos registados em Portugal {period} (UTC). O arquivo de {year} reúne {count(len(group))}."
                else:
                    period = f"on {earliest}" if earliest == latest else f"from {earliest} to {latest}"
                    desc = f"Earthquakes recorded in Portugal {period} (UTC). The {year} archive lists {count(len(group))}."
                if pages > 1:
                    desc += f" {page_word} {page} {'de' if pt else 'of'} {pages}."
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
                items = event_list(lang, records)
                featured = story_list(lang, [s for s in stories if s["id"].startswith(str(year))]) if page == 1 else ""
                write(year, page, title, desc, f'{nav}{featured}{jump}<ul class="events">{items}</ul>{nav}')
    return paths


def write_landings(destination, events, generated, origin):
    prepare(events)
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
            if pt:
                total = "1 registo" if len(group) == 1 else f"{len(group)} registos"
                desc = f"{title}, incluindo a área marítima envolvente. Consulte o catálogo ({total}) e compare a atividade em dois períodos de 30 dias."
            else:
                total = "1 record" if len(group) == 1 else f"{len(group)} records"
                desc = f"{title}, including nearby waters. Browse the catalogue ({total}) and compare activity across two 30-day periods."
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
