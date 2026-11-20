"""Regenerate the public RSS feeds from the journal's published article metadata."""
import json
import re
from datetime import datetime, timezone
from email.utils import format_datetime
from pathlib import Path
from urllib.parse import urlsplit
import xml.etree.ElementTree as ET

SITE = Path(__file__).resolve().parents[2]
BASE = "https://stephaven.app"
JOURNAL = BASE + "/journal/"
ATOM = "http://www.w3.org/2005/Atom"
DEVELOPMENT = {"drawn-in-code", "seasons-and-time", "every-kind-of-moving"}
ET.register_namespace("atom", ATOM)


def metadata(path, kind):
    html = path.read_text()
    for source in re.findall(r'<script type="application/ld\+json">(.*?)</script>', html, re.S):
        data = json.loads(source)
        if data.get("@type") == kind:
            return data
    raise ValueError(f"Missing {kind} metadata in {path}")


def write_feed(filename, title, description, entries):
    channel = ET.Element("channel")
    for field, value in [("title", title), ("link", JOURNAL), ("description", description), ("language", "en")]:
        ET.SubElement(channel, field).text = value
    ET.SubElement(channel, f"{{{ATOM}}}link", href=JOURNAL + filename, rel="self", type="application/rss+xml")
    for date, link, headline, summary in sorted(entries, key=lambda entry: entry[:2], reverse=True):
        item = ET.SubElement(channel, "item")
        timestamp = datetime.fromisoformat(date).replace(tzinfo=timezone.utc)
        for field, value in [("title", headline), ("link", link), ("description", summary), ("pubDate", format_datetime(timestamp, usegmt=True))]:
            ET.SubElement(item, field).text = value
        ET.SubElement(item, "guid", isPermaLink="true").text = link
    rss = ET.Element("rss", version="2.0")
    rss.append(channel)
    ET.indent(rss, space="  ")
    (SITE / "journal" / filename).write_bytes(ET.tostring(rss, encoding="utf-8", xml_declaration=True) + b"\n")


def main():
    entries = []
    development = []
    journal = metadata(SITE / "journal/index.html", "Blog")
    for post in journal["blogPost"]:
        link = post["url"]
        path = SITE / urlsplit(link).path.strip("/")
        article = metadata(path / "index.html", "Article")
        entry = (article["datePublished"], link, article["headline"], article["description"])
        entries.append(entry)
        if path.name in DEVELOPMENT:
            development.append(entry)
    planner = metadata(SITE / "build-planner/index.html", "WebPage")
    entries.append(("2026-11-20", planner["url"], planner["name"], planner["description"]))
    write_feed("feed.xml", "StepHaven Journal", "Walking projects, player guides and notes from the making of StepHaven.", entries)
    write_feed("development.xml", "StepHaven development and design", "How an indie iPhone town builder handles drawing, time and movement.", development)


if __name__ == "__main__":
    main()
