#!/usr/bin/env python3

import json
import os
import re
import time
import urllib.request
from pathlib import Path
from html import unescape

REPO = Path(".").resolve()
OUT = REPO / "artifacts" / "cms_homepage_section_audit"
CMS_PULL = REPO / "artifacts" / "cms_d1_pull" / "cms_d1_pull_all.json"

URL = "https://inneranimalmedia.com/"
MODEL = os.environ.get("OPENAI_MODEL", "gpt-5.4-mini")
API_KEY = os.environ.get("OPENAI_API_KEY", "")


def write_text(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    print("WROTE:", path)


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    print("WROTE:", path)


def fetch_url(url):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 CMS Homepage Section Audit"
        },
        method="GET",
    )

    with urllib.request.urlopen(req, timeout=60) as resp:
        html = resp.read().decode("utf-8", errors="ignore")

    return html


def strip_noise(html_text):
    text = re.sub(r"<script\b[^>]*>.*?</script>", "", html_text, flags=re.I | re.S)
    text = re.sub(r"<style\b[^>]*>.*?</style>", "", text, flags=re.I | re.S)
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    return text


def clean_html_text(value):
    value = re.sub(r"<[^>]+>", " ", value)
    value = unescape(value)
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def extract_headings(html_text):
    headings = []

    for match in re.finditer(r"<h([1-6])\b[^>]*>(.*?)</h\1>", html_text, flags=re.I | re.S):
        level = int(match.group(1))
        text = clean_html_text(match.group(2))
        if text:
            headings.append(
                {
                    "level": level,
                    "text": text,
                }
            )

    return headings


def extract_links(html_text):
    links = []

    for match in re.finditer(r"<a\b([^>]*)>(.*?)</a>", html_text, flags=re.I | re.S):
        attrs = match.group(1)
        label = clean_html_text(match.group(2))

        href = ""
        href_match = re.search(r"""href\s*=\s*["']([^"']+)["']""", attrs, flags=re.I)
        if href_match:
            href = href_match.group(1)

        if href or label:
            links.append(
                {
                    "label": label,
                    "href": href,
                }
            )

    return links


def extract_assets(html_text):
    assets = set()

    patterns = [
        r"""src\s*=\s*["']([^"']+)["']""",
        r"""href\s*=\s*["']([^"']+\.(?:png|jpg|jpeg|webp|gif|svg|mp4|webm|glb|gltf|css|js))["']""",
        r"""url\(["']?([^"')]+)["']?\)""",
        r"""["']([^"']+\.(?:png|jpg|jpeg|webp|gif|svg|mp4|webm|glb|gltf))["']""",
    ]

    for pattern in patterns:
        for match in re.finditer(pattern, html_text, flags=re.I):
            value = match.group(1).strip()
            if value and not value.startswith("data:"):
                assets.add(value)

    return sorted(assets)


def extract_sections(html_text):
    clean = strip_noise(html_text)

    raw_sections = []

    section_matches = list(re.finditer(r"<section\b[^>]*>.*?</section>", clean, flags=re.I | re.S))

    if section_matches:
        for index, match in enumerate(section_matches):
            raw = match.group(0)
            text = clean_html_text(raw)
            headings = extract_headings(raw)
            links = extract_links(raw)
            assets = extract_assets(raw)

            raw_sections.append(
                {
                    "index": index,
                    "source": "section_tag",
                    "heading_guess": headings[0]["text"] if headings else "",
                    "text": text[:4000],
                    "headings": headings,
                    "links": links,
                    "assets": assets,
                    "html_sample": raw[:8000],
                }
            )

    if raw_sections:
        return raw_sections

    main_match = re.search(r"<main\b[^>]*>(.*?)</main>", clean, flags=re.I | re.S)
    main_html = main_match.group(1) if main_match else clean

    headings = list(re.finditer(r"<h[1-3]\b[^>]*>.*?</h[1-3]>", main_html, flags=re.I | re.S))

    sections = []

    for i, heading in enumerate(headings):
        start = heading.start()
        end = headings[i + 1].start() if i + 1 < len(headings) else len(main_html)
        raw = main_html[start:end]

        text = clean_html_text(raw)
        h = extract_headings(raw)
        links = extract_links(raw)
        assets = extract_assets(raw)

        if len(text) < 40:
            continue

        sections.append(
            {
                "index": len(sections),
                "source": "heading_split",
                "heading_guess": h[0]["text"] if h else "",
                "text": text[:4000],
                "headings": h,
                "links": links,
                "assets": assets,
                "html_sample": raw[:8000],
            }
        )

    return sections


def load_cms_schema_brief():
    if not CMS_PULL.exists():
        return {
            "warning": "cms_d1_pull_all.json not found",
            "tables": [],
        }

    data = json.loads(CMS_PULL.read_text(encoding="utf-8"))
    tables = []

    for table in data.get("tables", []):
        columns = []
        for col in table.get("columns", []):
            columns.append(col.get("name"))

        tables.append(
            {
                "name": table.get("name"),
                "row_count": table.get("row_count"),
                "columns": columns,
                "create_sql": table.get("create_sql") or table.get("sql"),
            }
        )

    return {
        "db": data.get("db"),
        "mode": data.get("mode"),
        "tables": tables,
    }


def openai(prompt, max_output_tokens=7000, retries=4):
    if not API_KEY:
        raise SystemExit("Missing OPENAI_API_KEY")

    body = {
        "model": MODEL,
        "input": prompt,
        "max_output_tokens": max_output_tokens,
    }

    data = json.dumps(body).encode("utf-8")

    for attempt in range(retries):
        req = urllib.request.Request(
            "https://api.openai.com/v1/responses",
            data=data,
            headers={
                "Content-Type": "application/json",
                "Authorization": "Bearer " + API_KEY,
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=240) as resp:
                payload = json.loads(resp.read().decode("utf-8"))

            if payload.get("output_text"):
                return payload["output_text"].strip()

            parts = []
            for item in payload.get("output", []):
                for content in item.get("content", []):
                    if content.get("type") == "output_text":
                        parts.append(content.get("text", ""))

            return "\n".join(parts).strip()

        except Exception as exc:
            wait = 2 ** attempt
            print("OpenAI retry:", exc, "wait", wait)
            time.sleep(wait)

    raise RuntimeError("OpenAI failed")


def make_prompt(sections, cms_schema):
    section_packet = []

    for section in sections:
        section_packet.append(
            {
                "index": section["index"],
                "heading_guess": section["heading_guess"],
                "text": section["text"],
                "headings": section["headings"],
                "links": section["links"],
                "assets": section["assets"],
                "html_sample": section["html_sample"][:5000],
            }
        )

    return (
        "You are auditing only the homepage body sections of https://inneranimalmedia.com/ for CMS readiness.\n\n"
        "Important scope:\n"
        "- Ignore header/nav.\n"
        "- Ignore footer.\n"
        "- Focus only the visible homepage sections between header and footer.\n"
        "- The user believes there are about 4 or 5 sections: hero, what-we-do/services, selected work, FAQ, CTA/contact area.\n\n"
        "CMS schema brief:\n"
        "```json\n"
        + json.dumps(cms_schema, indent=2, ensure_ascii=False)[:70000]
        + "\n```\n\n"
        "Extracted homepage sections:\n"
        "```json\n"
        + json.dumps(section_packet, indent=2, ensure_ascii=False)[:90000]
        + "\n```\n\n"
        "Write a practical audit report with these exact sections:\n\n"
        "1. Section Inventory\n"
        "- identify the 4/5 real homepage sections\n"
        "- ignore header/footer\n"
        "- name each section with a stable section_key\n\n"
        "2. CMS Readiness Verdict\n"
        "- for each section, say READY / PARTIAL / NOT READY\n"
        "- explain if it maps cleanly to cms_page_sections + cms_liquid_sections/component templates + cms_assets/collections\n\n"
        "3. Recommended CMS Shape\n"
        "- proposed cms_site_pages or cms_pages record for homepage\n"
        "- proposed cms_page_sections rows in order\n"
        "- proposed cms_liquid_sections or cms_component_templates per section\n"
        "- proposed cms_assets/cms_collections usage\n\n"
        "4. Section-by-Section Conversion Plan\n"
        "- hero\n"
        "- services/capabilities accordion\n"
        "- selected work\n"
        "- FAQ\n"
        "- CTA/contact block if it should be treated as section not footer\n\n"
        "5. What Is Already Good\n"
        "- mention what should remain as-is, especially modular header/footer if detected\n\n"
        "6. What Must Change\n"
        "- exact data fields/settings needed per section\n"
        "- what should move out of hardcoded HTML/source and into D1/R2\n\n"
        "7. First Patch Plan\n"
        "- exact implementation order\n"
        "- exact D1 query/seed needs\n"
        "- no broad CMS rebuild\n\n"
        "8. Cursor Task Packet\n"
        "- compact task list Cursor can execute next\n\n"
        "Be direct. Do not write a massive architecture plan. Make this usable."
    )


def build_local_markdown(sections):
    lines = []
    lines.append("# Homepage Section Extraction")
    lines.append("")
    lines.append("URL: `" + URL + "`")
    lines.append("Extracted sections: `" + str(len(sections)) + "`")
    lines.append("")

    for section in sections:
        lines.append("## Section " + str(section["index"]) + ": " + (section["heading_guess"] or "untitled"))
        lines.append("")
        lines.append("Source: `" + section["source"] + "`")
        lines.append("")
        lines.append("### Headings")
        for h in section["headings"]:
            lines.append("- h" + str(h["level"]) + ": " + h["text"])
        if not section["headings"]:
            lines.append("- none")
        lines.append("")
        lines.append("### Links")
        for link in section["links"]:
            lines.append("- `" + link.get("label", "") + "` -> `" + link.get("href", "") + "`")
        if not section["links"]:
            lines.append("- none")
        lines.append("")
        lines.append("### Assets")
        for asset in section["assets"]:
            lines.append("- `" + asset + "`")
        if not section["assets"]:
            lines.append("- none")
        lines.append("")
        lines.append("### Text")
        lines.append("")
        lines.append(section["text"][:2000])
        lines.append("")

    return "\n".join(lines)


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    print("FETCH:", URL)
    html_text = fetch_url(URL)

    write_text(OUT / "00_homepage_snapshot.html", html_text)

    sections = extract_sections(html_text)
    cms_schema = load_cms_schema_brief()

    write_json(OUT / "01_extracted_sections.json", sections)
    write_text(OUT / "02_SECTION_EXTRACTION.md", build_local_markdown(sections))

    prompt = make_prompt(sections, cms_schema)

    print("MODEL:", MODEL)
    print("SECTIONS:", len(sections))
    report = openai(prompt)

    write_text(OUT / "03_OPENAI_HOMEPAGE_CMS_AUDIT.md", "# OpenAI Homepage CMS Section Audit\n\n" + report + "\n")

    cursor_packet = (
        "# Cursor Homepage CMS Sprint\n\n"
        "Read:\n\n"
        "- artifacts/cms_homepage_section_audit/03_OPENAI_HOMEPAGE_CMS_AUDIT.md\n"
        "- artifacts/cms_homepage_section_audit/02_SECTION_EXTRACTION.md\n"
        "- artifacts/cms_d1_pull/cms_d1_pull_all.json\n\n"
        "Goal:\n\n"
        "Convert only the homepage body sections into the existing cms_* model. Do not touch header/footer.\n\n"
        "Deliver:\n\n"
        "1. file map for current homepage implementation\n"
        "2. proposed cms_page_sections seed rows\n"
        "3. proposed section template contracts\n"
        "4. asset/collection mapping\n"
        "5. first safe patch plan\n"
    )

    write_text(OUT / "04_CURSOR_HOMEPAGE_CMS_SPRINT.md", cursor_packet)

    index = (
        "# Homepage CMS Section Audit\n\n"
        "- `00_homepage_snapshot.html`\n"
        "- `01_extracted_sections.json`\n"
        "- `02_SECTION_EXTRACTION.md`\n"
        "- `03_OPENAI_HOMEPAGE_CMS_AUDIT.md`\n"
        "- `04_CURSOR_HOMEPAGE_CMS_SPRINT.md`\n"
    )

    write_text(OUT / "INDEX.md", index)

    print("DONE")
    print("OPEN:", OUT)
    print("MAIN:", OUT / "03_OPENAI_HOMEPAGE_CMS_AUDIT.md")


if __name__ == "__main__":
    main()