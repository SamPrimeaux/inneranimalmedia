cd /Users/samprimeaux/inneranimalmedia && mkdir -p scripts artifacts/agent_workspace_surface && pbpaste > scripts/audit_agent_workspace_surface.py && chmod +x scripts/audit_agent_workspace_surface.py && open -a TextEdit scripts/audit_agent_workspace_surface.py#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


ROOT = Path.cwd()
OUT_DIR = ROOT / "artifacts" / "agent_workspace_surface"
OUT_DIR.mkdir(parents=True, exist_ok=True)

TARGET_URL = "https://inneranimalmedia.com/dashboard/agent"

SEARCH_TERMS = [
    "Good afternoon",
    "What are we building today",
    "Plan, Build",
    "Quickstart",
    "View Artifacts",
    "Open Project",
    "Open Local Project",
    "Connect Workspace",
    "Clone Repository",
    "Recently Opened",
    "workspace:",
    "Inner Animal Media",
    "+ Browser",
    "Agent",
]

SOURCE_EXTS = {
    ".tsx",
    ".ts",
    ".jsx",
    ".js",
    ".html",
    ".css",
}

SKIP_DIRS = {
    ".git",
    "node_modules",
    "dist",
    "build",
    ".next",
    ".wrangler",
    ".turbo",
    "__pycache__",
    "coverage",
    "artifacts",
}


@dataclass
class Match:
    file: str
    line: int
    term: str
    text: str


def run(cmd: list[str]) -> tuple[int, str]:
    try:
        p = subprocess.run(
            cmd,
            cwd=ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            check=False,
        )
        return p.returncode, p.stdout.strip()
    except FileNotFoundError as exc:
        return 127, str(exc)


def read_url(url: str) -> str:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "AgentSamSurfaceAudit/1.0",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
    )
    with urllib.request.urlopen(req, timeout=25) as resp:
        body = resp.read()
    return body.decode("utf-8", errors="replace")


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8", errors="replace")).hexdigest()


def iter_source_files() -> Iterable[Path]:
    for path in ROOT.rglob("*"):
        if not path.is_file():
            continue
        parts = set(path.relative_to(ROOT).parts)
        if parts & SKIP_DIRS:
            continue
        if path.suffix.lower() in SOURCE_EXTS:
            yield path


def safe_read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return ""


def find_local_matches() -> list[Match]:
    matches: list[Match] = []
    for path in iter_source_files():
        text = safe_read(path)
        if not text:
            continue
        rel = str(path.relative_to(ROOT))
        for i, line in enumerate(text.splitlines(), start=1):
            for term in SEARCH_TERMS:
                if term.lower() in line.lower():
                    matches.append(
                        Match(
                            file=rel,
                            line=i,
                            term=term,
                            text=line.strip()[:240],
                        )
                    )
    return matches


def extract_asset_urls(html: str) -> list[str]:
    found: list[str] = []

    for pattern in [
        r'src=["\']([^"\']+)["\']',
        r'href=["\']([^"\']+)["\']',
    ]:
        for m in re.finditer(pattern, html):
            url = m.group(1)
            if url.startswith("data:"):
                continue
            if url.startswith("//"):
                url = "https:" + url
            elif url.startswith("/"):
                url = "https://inneranimalmedia.com" + url
            elif not url.startswith("http"):
                url = "https://inneranimalmedia.com/" + url.lstrip("./")
            found.append(url)

    return sorted(set(found))


def fetch_interesting_assets(asset_urls: list[str]) -> list[dict]:
    rows: list[dict] = []

    for url in asset_urls:
        if not any(x in url.lower() for x in [".js", ".css", "dashboard", "agent", "static"]):
            continue

        row = {
            "url": url,
            "ok": False,
            "sha256": None,
            "bytes": 0,
            "matched_terms": [],
            "error": None,
        }

        try:
            body = read_url(url)
            row["ok"] = True
            row["sha256"] = sha256_text(body)
            row["bytes"] = len(body.encode("utf-8", errors="replace"))
            row["matched_terms"] = [
                term for term in SEARCH_TERMS if term.lower() in body.lower()
            ]

            safe_name = re.sub(r"[^a-zA-Z0-9._-]+", "_", url.replace("https://", ""))
            if len(safe_name) > 180:
                safe_name = safe_name[-180:]
            (OUT_DIR / safe_name).write_text(body, encoding="utf-8")
        except Exception as exc:
            row["error"] = str(exc)

        rows.append(row)

    return rows


def grouped_matches(matches: list[Match]) -> dict[str, list[dict]]:
    grouped: dict[str, list[dict]] = {}
    for m in matches:
        grouped.setdefault(m.file, []).append(
            {
                "line": m.line,
                "term": m.term,
                "text": m.text,
            }
        )
    return grouped


def write_markdown_report(payload: dict) -> Path:
    report = OUT_DIR / "agent_workspace_surface_report.md"

    lines: list[str] = []
    lines.append("# Agent Workspace Surface Audit")
    lines.append("")
    lines.append(f"Target URL: `{TARGET_URL}`")
    lines.append("")
    lines.append("## Git State")
    lines.append("")
    lines.append("```text")
    lines.append(payload["git_status"])
    lines.append("```")
    lines.append("")
    lines.append("## Deployed HTML")
    lines.append("")
    lines.append(f"- SHA256: `{payload['html_sha256']}`")
    lines.append(f"- Bytes: `{payload['html_bytes']}`")
    lines.append(f"- Asset URLs found: `{len(payload['asset_urls'])}`")
    lines.append("")
    lines.append("## Deployed Assets With Matching Terms")
    lines.append("")

    interesting = [
        row for row in payload["asset_rows"]
        if row.get("matched_terms")
    ]

    if interesting:
        for row in interesting:
            lines.append(f"### `{row['url']}`")
            lines.append("")
            lines.append(f"- OK: `{row['ok']}`")
            lines.append(f"- Bytes: `{row['bytes']}`")
            lines.append(f"- SHA256: `{row['sha256']}`")
            lines.append(f"- Matched terms: `{', '.join(row['matched_terms'])}`")
            lines.append("")
    else:
        lines.append("_No deployed JS/CSS assets contained the tracked UI text._")
        lines.append("")

    lines.append("## Local Source Matches")
    lines.append("")

    grouped = payload["local_matches_grouped"]
    if grouped:
        for file, rows in grouped.items():
            lines.append(f"### `{file}`")
            lines.append("")
            for row in rows[:80]:
                lines.append(
                    f"- L{row['line']} `{row['term']}` — `{row['text']}`"
                )
            if len(rows) > 80:
                lines.append(f"- ... {len(rows) - 80} more matches")
            lines.append("")
    else:
        lines.append("_No local source matches found for tracked UI terms._")
        lines.append("")

    lines.append("## Suggested Next Step")
    lines.append("")
    lines.append(
        "Patch only the highest-confidence owner file from the local matches above. "
        "Do not redesign the whole dashboard shell until the route owner, component owner, "
        "and deployed bundle are confirmed."
    )
    lines.append("")

    report.write_text("\n".join(lines), encoding="utf-8")
    return report


def main() -> int:
    if not (ROOT / "package.json").exists():
        print("FAIL: Run this from the repo root. package.json was not found.")
        return 1

    git_code, git_status = run(["git", "status", "-sb"])

    print(f"Fetching {TARGET_URL}")
    try:
        html = read_url(TARGET_URL)
    except Exception as exc:
        print(f"FAIL: Could not fetch target URL: {exc}")
        return 1

    html_path = OUT_DIR / "deployed_dashboard_agent.html"
    html_path.write_text(html, encoding="utf-8")

    asset_urls = extract_asset_urls(html)
    asset_rows = fetch_interesting_assets(asset_urls)

    local_matches = find_local_matches()

    payload = {
        "target_url": TARGET_URL,
        "git_status": git_status,
        "git_status_code": git_code,
        "html_sha256": sha256_text(html),
        "html_bytes": len(html.encode("utf-8", errors="replace")),
        "asset_urls": asset_urls,
        "asset_rows": asset_rows,
        "local_matches": [m.__dict__ for m in local_matches],
        "local_matches_grouped": grouped_matches(local_matches),
    }

    json_path = OUT_DIR / "agent_workspace_surface_report.json"
    json_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    md_path = write_markdown_report(payload)

    print("")
    print("PASS: Agent workspace surface audit complete.")
    print(f"HTML:   {html_path}")
    print(f"JSON:   {json_path}")
    print(f"REPORT: {md_path}")
    print("")
    print("Top local owner candidates:")
    grouped = grouped_matches(local_matches)
    for file, rows in sorted(grouped.items(), key=lambda x: len(x[1]), reverse=True)[:12]:
        print(f"  {len(rows):>3} matches  {file}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())