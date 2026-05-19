#!/usr/bin/env python3
from __future__ import annotations

import html
import json
import os
import re
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(os.getenv("IAM_REPO_ROOT", "/Users/samprimeaux/inneranimalmedia")).resolve()
OUT_DIR = ROOT / "artifacts" / "homepage_cms_structure_audit"
OUT_DIR.mkdir(parents=True, exist_ok=True)

STAMP = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

LIVE_URL = os.getenv("IAM_HOME_URL", "https://inneranimalmedia.com/")
COMPONENT_PATH = Path(
    os.getenv(
        "AGENTSAM_PLATFORM_COMPONENT",
        "/Users/samprimeaux/Downloads/agentsam_platform_services.html",
    )
).expanduser()

DB_NAME = os.getenv("IAM_D1_DB", "inneranimalmedia-business")
WRANGLER_CONFIG = os.getenv("IAM_WRANGLER_CONFIG", "wrangler.production.toml")
REMOTE = os.getenv("IAM_D1_REMOTE", "1").strip().lower() not in {"0", "false", "no"}

REPORT_MD = OUT_DIR / f"homepage_cms_structure_audit_{STAMP}.md"
REPORT_JSON = OUT_DIR / f"homepage_cms_structure_audit_{STAMP}.json"
LIVE_HTML_OUT = OUT_DIR / f"live_homepage_{STAMP}.html"
COMPONENT_COPY_OUT = OUT_DIR / f"agentsam_platform_services_{STAMP}.html"
LATEST_MD = OUT_DIR / "LATEST_HOMEPAGE_CMS_STRUCTURE_AUDIT.md"
LATEST_JSON = OUT_DIR / "LATEST_HOMEPAGE_CMS_STRUCTURE_AUDIT.json"
LATEST_LIVE_HTML = OUT_DIR / "LATEST_LIVE_HOMEPAGE.html"
LATEST_COMPONENT = OUT_DIR / "LATEST_AGENTSAM_PLATFORM_SERVICES.html"

SKIP_DIRS = {
    ".git",
    ".wrangler",
    "node_modules",
    "dist",
    "build",
    ".next",
    ".turbo",
    "__pycache__",
    "coverage",
    ".venv",
    "venv",
}

TEXT_EXTS = {
    ".html", ".htm", ".tsx", ".ts", ".jsx", ".js", ".mjs", ".cjs",
    ".css", ".scss", ".json", ".md", ".mdx", ".toml", ".yaml", ".yml",
    ".py", ".sql", ".liquid",
}

SEARCH_PATTERNS = [
    "Selected Work",
    "SELECTED WORK",
    "Built to impress",
    "Shipped to perform",
    "Interactive previews of real products",
    "MeauxCloud",
    "AutoMeaux Learn",
    "Fuel & Free Time",
    "PawLove Rescue",
    "agentsam_platform_services",
    "cms_page_sections",
    "cms_section_components",
    "cms_component_templates",
    "cms_site_pages",
    "cms_pages",
]


def run(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    print("+ " + " ".join(cmd))
    return subprocess.run(
        cmd,
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )


def read_text(path: Path) -> str | None:
    try:
        raw = path.read_bytes()
    except Exception:
        return None

    if b"\x00" in raw[:4096]:
        return None

    return raw.decode("utf-8", errors="replace")


def fetch_url(url: str) -> tuple[str | None, str | None]:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "InnerAnimalMedia-CMS-Audit/1.0",
            "Accept": "text/html,application/xhtml+xml",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.read().decode("utf-8", errors="replace"), resp.geturl()
    except Exception as exc:
        return None, str(exc)


def summarize_html(text: str) -> dict[str, Any]:
    headings = []

    for tag in ["h1", "h2", "h3"]:
        for m in re.finditer(rf"<{tag}\b[^>]*>(.*?)</{tag}>", text, flags=re.I | re.S):
            heading = re.sub(r"<[^>]+>", "", m.group(1))
            heading = html.unescape(re.sub(r"\s+", " ", heading)).strip()
            if heading:
                headings.append({"tag": tag, "text": heading[:220]})

    ids = re.findall(r'\bid=["\']([^"\']+)["\']', text)
    classes = re.findall(r'\bclass=["\']([^"\']+)["\']', text)
    class_parts = []
    for c in classes:
        class_parts.extend([x for x in c.split() if x.strip()])

    return {
        "bytes": len(text.encode("utf-8")),
        "chars": len(text),
        "section_count": len(re.findall(r"<section\b", text, flags=re.I)),
        "style_count": len(re.findall(r"<style\b", text, flags=re.I)),
        "script_count": len(re.findall(r"<script\b", text, flags=re.I)),
        "ids": sorted(set(ids))[:80],
        "classes": sorted(set(class_parts))[:120],
        "headings": headings[:80],
    }


def extract_window(text: str, anchors: list[str], before: int = 2500, after: int = 8000) -> dict[str, Any]:
    lower = text.lower()

    for anchor in anchors:
        idx = lower.find(anchor.lower())
        if idx >= 0:
            start = max(0, idx - before)
            end = min(len(text), idx + after)
            return {
                "found": True,
                "anchor": anchor,
                "start": start,
                "end": end,
                "snippet": text[start:end],
            }

    return {"found": False, "anchor": None, "start": None, "end": None, "snippet": ""}


def repo_files() -> list[Path]:
    files = []

    for path in ROOT.rglob("*"):
        if not path.is_file():
            continue

        try:
            rel = path.relative_to(ROOT)
        except ValueError:
            continue

        if any(part in SKIP_DIRS for part in rel.parts):
            continue

        if path.suffix.lower() not in TEXT_EXTS:
            continue

        files.append(path)

    return sorted(files)


def repo_matches(files: list[Path]) -> list[dict[str, Any]]:
    out = []

    for path in files:
        text = read_text(path)
        if not text:
            continue

        rel = str(path.relative_to(ROOT))
        for line_no, line in enumerate(text.splitlines(), start=1):
            for pattern in SEARCH_PATTERNS:
                if pattern.lower() in line.lower():
                    excerpt = line.strip()
                    if len(excerpt) > 220:
                        excerpt = excerpt[:220] + "..."
                    out.append(
                        {
                            "path": rel,
                            "line": line_no,
                            "pattern": pattern,
                            "excerpt": excerpt,
                        }
                    )

    return out


def d1_cmd(sql: str) -> list[str]:
    cmd = [
        "npx",
        "wrangler",
        "d1",
        "execute",
        DB_NAME,
        "-c",
        WRANGLER_CONFIG,
        "--json",
        "--command",
        sql,
    ]
    if REMOTE:
        cmd.insert(5, "--remote")
    return cmd


def unwrap_rows(raw: str) -> list[dict[str, Any]]:
    try:
        payload = json.loads(raw)
    except Exception:
        return []

    if isinstance(payload, list) and payload and isinstance(payload[0], dict):
        rows = payload[0].get("results")
        if isinstance(rows, list):
            return rows

    if isinstance(payload, dict):
        rows = payload.get("results") or payload.get("result")
        if isinstance(rows, list):
            return rows

    return []


def d1_query(name: str, sql: str) -> dict[str, Any]:
    proc = run(d1_cmd(sql))
    if proc.returncode != 0:
        return {"name": name, "ok": False, "error": proc.stderr.strip(), "rows": []}

    return {"name": name, "ok": True, "error": None, "rows": unwrap_rows(proc.stdout)}


def cms_queries() -> list[dict[str, Any]]:
    queries = [
        (
            "home_pages_cms_site_pages",
            """
            SELECT id, project_id, project_slug, tenant_id, title, slug, path, status,
                   r2_bucket, r2_key, r2_url, updated_at, created_at
            FROM cms_site_pages
            WHERE COALESCE(path,'') IN ('/','/index','/home')
               OR lower(COALESCE(slug,'')) IN ('home','index')
               OR lower(COALESCE(project_slug,'')) LIKE '%inneranimal%'
               OR lower(COALESCE(project_id,'')) LIKE '%inneranimal%'
            ORDER BY updated_at DESC
            LIMIT 25;
            """,
        ),
        (
            "home_pages_cms_pages",
            """
            SELECT id, project_id, project_slug, tenant_id, title, slug, path, status,
                   r2_bucket, r2_key, r2_url, updated_at, created_at
            FROM cms_pages
            WHERE COALESCE(path,'') IN ('/','/index','/home')
               OR lower(COALESCE(slug,'')) IN ('home','index')
               OR lower(COALESCE(project_slug,'')) LIKE '%inneranimal%'
               OR lower(COALESCE(project_id,'')) LIKE '%inneranimal%'
            ORDER BY updated_at DESC
            LIMIT 25;
            """,
        ),
        (
            "selected_work_cms_page_sections",
            """
            SELECT id, page_id, section_key, section_type, sort_order, is_active,
                   substr(settings_json, 1, 1200) AS settings_preview
            FROM cms_page_sections
            WHERE lower(COALESCE(section_key,'')) LIKE '%work%'
               OR lower(COALESCE(section_key,'')) LIKE '%selected%'
               OR lower(COALESCE(section_type,'')) LIKE '%work%'
               OR lower(COALESCE(settings_json,'')) LIKE '%selected work%'
               OR lower(COALESCE(settings_json,'')) LIKE '%built to impress%'
               OR lower(COALESCE(settings_json,'')) LIKE '%meauxcloud%'
               OR lower(COALESCE(settings_json,'')) LIKE '%automeaux%'
            ORDER BY page_id, sort_order
            LIMIT 50;
            """,
        ),
        (
            "selected_work_cms_section_components",
            """
            SELECT id, section_id, component_key, component_type, sort_order, is_active,
                   substr(props_json, 1, 1200) AS props_preview
            FROM cms_section_components
            WHERE lower(COALESCE(component_key,'')) LIKE '%work%'
               OR lower(COALESCE(component_key,'')) LIKE '%selected%'
               OR lower(COALESCE(component_type,'')) LIKE '%work%'
               OR lower(COALESCE(props_json,'')) LIKE '%meauxcloud%'
               OR lower(COALESCE(props_json,'')) LIKE '%automeaux%'
               OR lower(COALESCE(props_json,'')) LIKE '%pawlove%'
            ORDER BY section_id, sort_order
            LIMIT 75;
            """,
        ),
        (
            "agent_or_work_templates",
            """
            SELECT id, template_name, template_type, category, tenant_id,
                   r2_bucket, r2_key, shopify_section_key,
                   substr(template_data, 1, 1200) AS template_preview,
                   updated_at, created_at
            FROM cms_component_templates
            WHERE lower(COALESCE(template_name,'')) LIKE '%agent%'
               OR lower(COALESCE(template_name,'')) LIKE '%work%'
               OR lower(COALESCE(template_name,'')) LIKE '%platform%'
               OR lower(COALESCE(template_data,'')) LIKE '%selected work%'
               OR lower(COALESCE(template_data,'')) LIKE '%built to impress%'
               OR lower(COALESCE(template_data,'')) LIKE '%agent sam%'
            ORDER BY updated_at DESC
            LIMIT 50;
            """,
        ),
    ]

    return [d1_query(name, sql) for name, sql in queries]


def main() -> None:
    print(f"Repo root: {ROOT}")
    print(f"Live URL: {LIVE_URL}")
    print(f"Component path: {COMPONENT_PATH}")

    live_html, live_status = fetch_url(LIVE_URL)
    live_summary = summarize_html(live_html) if live_html else {"error": live_status}
    live_window = extract_window(
        live_html or "",
        ["Selected Work", "Built to impress", "Shipped to perform", "MeauxCloud", "AutoMeaux Learn"],
    )

    if live_html:
        LIVE_HTML_OUT.write_text(live_html, encoding="utf-8")
        LATEST_LIVE_HTML.write_text(live_html, encoding="utf-8")

    component_html = read_text(COMPONENT_PATH)
    component_summary = summarize_html(component_html) if component_html else {"error": f"missing {COMPONENT_PATH}"}

    if component_html:
        COMPONENT_COPY_OUT.write_text(component_html, encoding="utf-8")
        LATEST_COMPONENT.write_text(component_html, encoding="utf-8")

    files = repo_files()
    matches = repo_matches(files)
    cms = cms_queries()

    audit = {
        "generated_at": STAMP,
        "live_url": LIVE_URL,
        "component_path": str(COMPONENT_PATH),
        "live_status": live_status,
        "live_summary": live_summary,
        "live_selected_work_window": {k: v for k, v in live_window.items() if k != "snippet"},
        "component_summary": component_summary,
        "repo_files_scanned": len(files),
        "repo_matches": matches,
        "cms_queries": cms,
    }

    REPORT_JSON.write_text(json.dumps(audit, indent=2, ensure_ascii=False), encoding="utf-8")
    LATEST_JSON.write_text(REPORT_JSON.read_text(encoding="utf-8"), encoding="utf-8")

    lines = []
    lines.append("# Homepage CMS Structure Audit")
    lines.append("")
    lines.append(f"- Generated: `{STAMP}`")
    lines.append(f"- Live URL: `{LIVE_URL}`")
    lines.append(f"- Component path: `{COMPONENT_PATH}`")
    lines.append(f"- Repo files scanned: `{len(files)}`")
    lines.append(f"- Repo matches: `{len(matches)}`")
    lines.append("")

    lines.append("## Read")
    lines.append("")
    lines.append(f"- Live homepage fetched: `{bool(live_html)}`")
    lines.append(f"- Live selected-work anchor found: `{live_window.get('found')}`")
    lines.append(f"- Component found: `{bool(component_html)}`")
    lines.append("")

    lines.append("## Live Homepage Headings")
    lines.append("")
    for h in live_summary.get("headings", []):
        lines.append(f"- `{h['tag']}` {h['text']}")
    lines.append("")

    lines.append("## Live Selected Work Snippet")
    lines.append("")
    if live_window.get("found"):
        lines.append(f"- Anchor: `{live_window.get('anchor')}`")
        lines.append("")
        lines.append("```html")
        lines.append((live_window.get("snippet") or "")[:9000])
        lines.append("```")
    else:
        lines.append("- Not found in fetched live HTML.")
    lines.append("")

    lines.append("## Agent Sam Component")
    lines.append("")
    lines.append(f"- Found: `{bool(component_html)}`")
    lines.append(f"- Bytes: `{component_summary.get('bytes')}`")
    lines.append(f"- Sections: `{component_summary.get('section_count')}`")
    lines.append("")

    lines.append("## Repo Matches")
    lines.append("")
    if matches:
        lines.append("| Path | Line | Pattern | Excerpt |")
        lines.append("|---|---:|---|---|")
        for m in matches[:350]:
            excerpt = str(m["excerpt"]).replace("|", "\\|")
            lines.append(f"| `{m['path']}` | {m['line']} | `{m['pattern']}` | `{excerpt}` |")
    else:
        lines.append("- No repo matches.")
    lines.append("")

    lines.append("## CMS Candidate Rows")
    lines.append("")
    for q in cms:
        lines.append(f"### `{q['name']}`")
        lines.append("")
        if not q["ok"]:
            lines.append(f"- Error: `{q['error']}`")
            lines.append("")
            continue
        rows = q["rows"]
        lines.append(f"- Rows: `{len(rows)}`")
        if rows:
            lines.append("")
            lines.append("```json")
            lines.append(json.dumps(rows[:20], indent=2, ensure_ascii=False))
            lines.append("```")
        lines.append("")

    lines.append("## Next Decision")
    lines.append("")
    lines.append("- If repo matches show the Selected Work source, patch that file.")
    lines.append("- If CMS rows show the Selected Work section, update that section row after confirming the exact `page_id` and `section_id`.")
    lines.append("- If neither appears, homepage is likely R2/static artifact driven; replace the section in the R2/source HTML artifact.")
    lines.append("")

    REPORT_MD.write_text("\n".join(lines), encoding="utf-8")
    LATEST_MD.write_text(REPORT_MD.read_text(encoding="utf-8"), encoding="utf-8")

    print("")
    print("DONE")
    print(f"report: {REPORT_MD}")
    print(f"latest: {LATEST_MD}")
    print("")
    print(f"open {LATEST_MD}")


if __name__ == "__main__":
    main()