"""RSS 2.0 export of the merged catalogue; no separate feed state to maintain."""
import datetime as dt
from email.utils import format_datetime
from html import escape
import os
import tempfile
from urllib.parse import quote
import xml.etree.ElementTree as ET

SITE_URL = "https://terramotos.com/"
ITEM_LIMIT = 100
ATOM = "http://www.w3.org/2005/Atom"
REGIONS = {"continente": "Continente", "acores": "Açores", "madeira": "Madeira"}
ET.register_namespace("atom", ATOM)


def write_rss(path, events, site_url=SITE_URL):
    """Write newest-first event rows atomically, using permanent earthquake links as GUIDs."""
    site_url = site_url.rstrip("/") + "/"
    root = ET.Element("rss", version="2.0")
    channel = ET.SubElement(root, "channel")

    def add(parent, tag, value, **attrs):
        ET.SubElement(parent, tag, attrs).text = value

    add(channel, "title", "Terramotos Portugal")
    add(channel, "link", site_url)
    add(channel, "description", f"Os {ITEM_LIMIT} terramotos mais recentes em Portugal continental, nos Açores e na Madeira. "
        "Dados de IPMA, ISC, EMSC e USGS; sujeitos a revisão. Horas em UTC.")
    add(channel, "language", "pt-PT")
    add(channel, "lastBuildDate", format_datetime(dt.datetime.now(dt.timezone.utc), usegmt=True))
    add(channel, "ttl", "60")
    ET.SubElement(channel, f"{{{ATOM}}}link", href=site_url + "rss.xml", rel="self", type="application/rss+xml")

    for event in events:
        item = ET.SubElement(channel, "item")
        region = REGIONS[event["region"]]
        place = event["place"] or region
        magnitude = f"M {event['mag']:.1f}" if event["mag"] is not None else "Magnitude não disponível"
        url = site_url + "sismo/" + quote(event["id"], safe="")
        timestamp = dt.datetime.fromtimestamp(event["time"], dt.timezone.utc)
        add(item, "title", f"{magnitude} · {place}")
        add(item, "link", url)
        add(item, "guid", url, isPermaLink="true")
        add(item, "pubDate", format_datetime(timestamp, usegmt=True))
        add(item, "category", region)

        details = [timestamp.strftime("%Y-%m-%d %H:%M:%S UTC"), f"Local: {place} ({region})",
                   f"Magnitude: {event['mag']:.1f} {event['mag_type'] or ''}".rstrip()
                   if event["mag"] is not None else magnitude]
        if event["depth"] is not None:
            details.append(f"Profundidade: {event['depth']:.1f} km")
        if event["lat"] is not None and event["lon"] is not None:
            details.append(f"Coordenadas: {event['lat']:.4f}, {event['lon']:.4f}")
        if event["intensity"]:
            details.append(f"Intensidade: {event['intensity']}")
        if event["felt"]:
            details.append("Sentido pela população")
        details.append("Fontes: " + ", ".join(source.upper() for source in event["sources"].split(";") if source))
        # RSS descriptions are HTML: escape source text before the XML serializer escapes the markup.
        add(item, "description", "<p>" + "<br>".join(escape(text) for text in details) + "</p>")

    ET.indent(root)
    folder = os.path.dirname(path) or "."
    os.makedirs(folder, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=folder, suffix=".xml", delete=False) as output:
            temporary = output.name
            ET.ElementTree(root).write(output, encoding="utf-8", xml_declaration=True)
        os.chmod(temporary, 0o644)
        os.replace(temporary, path)
    finally:
        if temporary and os.path.exists(temporary):
            os.remove(temporary)
