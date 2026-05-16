#!/usr/bin/env python3

import json
import os
import re
import time
import urllib.request
from pathlib import Path
from html import unescape

REPO = Path(".").resolve()

SOURCE_HTML = Path("/Users/samprimeaux/Downloads/agentsam_platform_services.html")
OUT = REPO / "artifacts" / "cms_homepage_section_audit" / "selected_work_replacement"

MODEL = os.environ.get("OPENAI_MODEL", "gpt-5.4-mini")
API_KEY = os.environ.get("OPENAI_API_KEY", "")

PREVIOUS_AUDIT = REPO / "artifacts" / "cms_homepage_section_audit" / "03_OPENAI_HOMEPAGE_CMS_AUDIT.md"
CMS_PULL = REPO / "artifacts" / "cms_d1_pull" / "cms_d1_pull_all.json"


def read_text(path):
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8", errors="ignore")


def write_text(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    print("WROTE:", path)


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    print("WROTE:", path)


def clean_text(value):
    value = re.sub(r"<script\b[^>]*>.*?</script>", "", value, flags=re.I | re.S)
    value = re.sub(r"<style\b[^>]*>.*?</style>", "", value, flags=re.I | re.S)
    value = re.sub(r"<[^>]+>", " ", value)
    value = unescape(value)
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def extract_headings(html):
    rows = []

    for match in re.finditer(r"<h([1-6])\b[^>]*>(.*?)</h\1>", html, flags=re.I | re.S):
        level = int(match.group(1))
        text = clean_text(match.group(2))
        if text:
            rows.append({"level": level, "text": text})

    return rows


def extract_links(html):
    rows = []

    for match in re.finditer(r"<a\b([^>]*)>(.*?)</a>", html, flags=re.I | re.S):
        attrs = match.group(1)
        label = clean_text(match.group(2))

        href = ""
        href_match = re.search(r"""href\s*=\s*["']([^"']+)["']""", attrs, flags=re.I)
        if href_match:
            href = href_match.group(1)

        if href or label:
            rows.append({"label": label, "href": href})

    return rows


def extract_buttons(html):
    rows = []

    for match in re.finditer(r"<button\b([^>]*)>(.*?)</button>", html, flags=re.I | re.S):
        attrs = match.group(1)
        label = clean_text(match.group(2))
        rows.append({"label": label, "attrs": attrs[:500]})

    return rows


def extract_assets(html):
    found = set()

    patterns = [
        r"""src\s*=\s*["']([^"']+)["']""",
        r"""href\s*=\s*["']([^"']+\.(?:png|jpg|jpeg|webp|gif|svg|mp4|webm|glb|gltf|css|js))["']""",
        r"""url\(["']?([^"')]+)["']?\)""",
        r"""["']([^"']+\.(?:png|jpg|jpeg|webp|gif|svg|mp4|webm|glb|gltf))["']""",
    ]

    for pattern in patterns:
        for match in re.finditer(pattern, html, flags=re.I):
            value = match.group(1).strip()
            if value and not value.startswith("data:"):
                found.add(value)

    return sorted(found)


def extract_classes(html):
    found = set()

    for match in re.finditer(r"""class\s*=\s*["']([^"']+)["']""", html, flags=re.I):
        for item in match.group(1).split():
            if item.strip():
                found.add(item.strip())

    return sorted(found)


def extract_cards_guess(html):
    text = clean_text(html)

    possible_titles = []
    for match in re.finditer(r"<(?:h3|h4|strong|b)\b[^>]*>(.*?)</(?:h3|h4|strong|b)>", html, flags=re.I | re.S):
        value = clean_text(match.group(1))
        if value and len(value) < 120:
            possible_titles.append(value)

    return {
        "text_preview": text[:3000],
        "possible_card_titles": possible_titles[:50],
    }


def load_cms_brief():
    if not CMS_PULL.exists():
        return {"warning": "cms pull missing", "tables": []}

    data = json.loads(CMS_PULL.read_text(encoding="utf-8"))
    tables = []

    for table in data.get("tables", []):
        if not str(table.get("name", "")).startswith("cms_"):
            continue

        columns = []
        for col in table.get("columns", []):
            columns.append(col.get("name"))

        tables.append(
            {
                "name": table.get("name"),
                "row_count": table.get("row_count"),
                "columns": columns,
            }
        )

    return {"tables": tables}


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


def build_prompt(snapshot):
    previous = read_text(PREVIOUS_AUDIT)
    cms = load_cms_brief()

    return (
        "You are narrowing the homepage CMS migration for InnerAnimalMedia.\n\n"
        "Decision already made:\n"
        "- Header/footer are fine. Ignore them.\n"
        "- Existing `selected_work` section is being deleted/replaced.\n"
        "- Replacement source is `/Users/samprimeaux/Downloads/agentsam_platform_services.html`.\n"
        "- New section key should be `agent_sam_platform_services`.\n"
        "- It should keep the same homepage body slot/order where Selected Work was.\n\n"
        "Previous homepage audit:\n"
        "```markdown\n"
        + previous[:25000]
        + "\n```\n\n"
        "CMS table brief:\n"
        "```json\n"
        + json.dumps(cms, indent=2, ensure_ascii=False)[:35000]
        + "\n```\n\n"
        "Replacement HTML extraction:\n"
        "```json\n"
        + json.dumps(snapshot, indent=2, ensure_ascii=False)[:50000]
        + "\n```\n\n"
        "Write a focused implementation report with these exact sections:\n\n"
        "1. Final Homepage Section Order\n"
        "- list body sections only\n"
        "- selected_work must be replaced by agent_sam_platform_services\n\n"
        "2. Replacement Section Verdict\n"
        "- say whether agentsam_platform_services.html is CMS-ready, partial, or not ready\n"
        "- explain what is content vs template behavior\n\n"
        "3. CMS Data Contract\n"
        "- proposed cms_page_sections row for agent_sam_platform_services\n"
        "- proposed section_data JSON shape\n"
        "- proposed cms_section_components rows if the section has repeated cards/features\n"
        "- proposed cms_assets/cms_collections needs\n\n"
        "4. What To Delete / Disable\n"
        "- selected_work rows/components/collection/template references to remove or mark inactive\n"
        "- do not break old code until replacement renders\n\n"
        "5. What To Keep In Code\n"
        "- visual layout, animations, browser-frame/cards, responsive behavior\n\n"
        "6. What Goes Into D1/R2\n"
        "- copy, cards, CTAs, feature labels into D1\n"
        "- screenshots/media into R2/cms_assets\n\n"
        "7. Cursor Patch Plan\n"
        "- exact steps to find current selected_work implementation\n"
        "- exact steps to replace render source with the new component/template\n"
        "- exact seed/update strategy\n"
        "- smoke tests\n\n"
        "8. Minimal Seed JSON\n"
        "- provide a concrete starter JSON object for cms_page_sections.section_data\n\n"
        "Be direct and usable. No giant architecture plan."
    )


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    if not SOURCE_HTML.exists():
        raise SystemExit("Missing source HTML: " + str(SOURCE_HTML))

    html = read_text(SOURCE_HTML)

    write_text(OUT / "00_agentsam_platform_services_source.html", html)

    snapshot = {
        "source_file": str(SOURCE_HTML),
        "bytes": len(html.encode("utf-8")),
        "headings": extract_headings(html),
        "links": extract_links(html),
        "buttons": extract_buttons(html),
        "assets": extract_assets(html),
        "classes": extract_classes(html)[:250],
        "cards_guess": extract_cards_guess(html),
        "html_sample": html[:12000],
    }

    write_json(OUT / "01_replacement_extraction.json", snapshot)

    local_md = "# Agent Sam Platform Services Replacement Extraction\n\n"
    local_md += "Source: `" + str(SOURCE_HTML) + "`\n\n"
    local_md += "## Headings\n\n"
    for item in snapshot["headings"]:
        local_md += "- h" + str(item["level"]) + ": " + item["text"] + "\n"
    local_md += "\n## Links\n\n"
    for item in snapshot["links"]:
        local_md += "- `" + item["label"] + "` -> `" + item["href"] + "`\n"
    local_md += "\n## Assets\n\n"
    for item in snapshot["assets"]:
        local_md += "- `" + item + "`\n"
    local_md += "\n## Possible Card Titles\n\n"
    for item in snapshot["cards_guess"]["possible_card_titles"]:
        local_md += "- " + item + "\n"

    write_text(OUT / "02_REPLACEMENT_EXTRACTION.md", local_md)

    prompt = build_prompt(snapshot)

    print("MODEL:", MODEL)
    report = openai(prompt)

    write_text(
        OUT / "03_SELECTED_WORK_REPLACEMENT_PLAN.md",
        "# Selected Work Replacement Plan\n\n" + report + "\n",
    )

    cursor = (
        "# Cursor Task: Replace Selected Work With Agent Sam Platform Services\n\n"
        "Read:\n\n"
        "- artifacts/cms_homepage_section_audit/selected_work_replacement/03_SELECTED_WORK_REPLACEMENT_PLAN.md\n"
        "- artifacts/cms_homepage_section_audit/selected_work_replacement/02_REPLACEMENT_EXTRACTION.md\n"
        "- artifacts/cms_homepage_section_audit/03_OPENAI_HOMEPAGE_CMS_AUDIT.md\n\n"
        "Goal:\n\n"
        "Replace homepage `selected_work` with `agent_sam_platform_services` using the existing HTML from Downloads.\n\n"
        "Hard rules:\n\n"
        "- Do not touch header/footer.\n"
        "- Keep the same section slot/order.\n"
        "- Delete/disable old Selected Work content after replacement is confirmed.\n"
        "- Move copy/cards/CTA metadata to CMS records.\n"
        "- Keep layout/animation behavior in source/template code.\n\n"
    )

    write_text(OUT / "04_CURSOR_REPLACEMENT_TASK.md", cursor)

    index = (
        "# Selected Work Replacement Audit\n\n"
        "- `00_agentsam_platform_services_source.html`\n"
        "- `01_replacement_extraction.json`\n"
        "- `02_REPLACEMENT_EXTRACTION.md`\n"
        "- `03_SELECTED_WORK_REPLACEMENT_PLAN.md`\n"
        "- `04_CURSOR_REPLACEMENT_TASK.md`\n"
    )

    write_text(OUT / "INDEX.md", index)

    print("DONE")
    print("OPEN:", OUT)
    print("MAIN:", OUT / "03_SELECTED_WORK_REPLACEMENT_PLAN.md")


if __name__ == "__main__":
    main()m