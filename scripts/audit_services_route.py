#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

ROOT = Path.cwd()
OUT = ROOT / "artifacts" / "services_route_audit"
OUT.mkdir(parents=True, exist_ok=True)

SKIP_DIRS = {
    ".git", "node_modules", "dist", ".wrangler", "coverage", ".next",
    "__pycache__", ".turbo", ".vercel", "playwright-report",
}

SKIP_EXTS = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip",
    ".gz", ".tar", ".woff", ".woff2", ".ttf", ".otf", ".mp4", ".mov",
    ".sqlite", ".sqlite3", ".db", ".map",
}

PATTERNS = {
    "services_route": r"['\"`]\/services(?:['\"`/?#\s])|pathname\s*={0,3}\s*['\"`]\/services",
    "services_html": r"services\.html",
    "static_pages": r"static\/pages|pages\/services|imported_pages",
    "html_response": r"Content-Type.*text\/html|text\/html|new Response\(.*html|Response\.redirect",
    "asset_serving": r"ASSETS|env\.ASSETS|serveStatic|static|public|assets\.fetch|fetch\(.*asset|R2|r2",
    "route_switching": r"pathname|pathLower|url\.pathname|case\s+['\"`]\/|startsWith\(|match\(",
}

TEXT_EXTS = {
    ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".json", ".jsonc",
    ".html", ".css", ".md", ".toml", ".yml", ".yaml", ".txt",
}

def run(cmd: list[str]) -> str:
    try:
        p = subprocess.run(cmd, cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        return p.stdout
    except Exception as e:
        return f"{type(e).__name__}: {e}"

def should_skip(p: Path) -> bool:
    rel = p.relative_to(ROOT)
    if any(part in SKIP_DIRS for part in rel.parts):
        return True
    if p.suffix.lower() in SKIP_EXTS:
        return True
    if p.name.startswith(".env"):
        return True
    return False

def read_text(p: Path) -> str:
    try:
        b = p.read_bytes()
        if b"\x00" in b[:4096]:
            return ""
        return b.decode("utf-8", errors="replace")
    except Exception:
        return ""

def line_hits(text: str, pattern: str):
    rx = re.compile(pattern, re.I | re.S)
    hits = []
    for i, line in enumerate(text.splitlines(), start=1):
        if rx.search(line):
            hits.append((i, line.strip()[:300]))
    return hits

files = []
for p in ROOT.rglob("*"):
    if p.is_file() and not should_skip(p):
        if p.suffix.lower() in TEXT_EXTS or p.name in {"wrangler.toml", "wrangler.production.toml", "package.json"}:
            files.append(p)

results = []
for p in sorted(files):
    text = read_text(p)
    if not text:
        continue

    file_result = {
        "path": str(p.relative_to(ROOT)),
        "hits": {},
    }

    for name, pat in PATTERNS.items():
        hits = line_hits(text, pat)
        if hits:
            file_result["hits"][name] = [{"line": n, "text": t} for n, t in hits[:40]]

    if file_result["hits"]:
        results.append(file_result)

priority_paths = [
    "src/index.js",
    "src/api/routes.js",
    "src/api/dashboard.js",
    "src/api/cms.js",
    "src/api/pages.js",
    "src/core/production-dispatch.js",
    "wrangler.toml",
    "wrangler.production.toml",
    "package.json",
]

priority_context = {}
for rel in priority_paths:
    p = ROOT / rel
    if p.exists():
        text = read_text(p)
        context_hits = {}
        for name, pat in PATTERNS.items():
            hits = line_hits(text, pat)
            if hits:
                context_hits[name] = [{"line": n, "text": t} for n, t in hits[:80]]
        priority_context[rel] = context_hits

service_files = []
for candidate in [
    "static/pages/services.html",
    "artifacts/imported_pages/services.html",
    "services.html",
    "public/services.html",
    "dashboard/services.html",
]:
    p = ROOT / candidate
    service_files.append({
        "path": candidate,
        "exists": p.exists(),
        "size_bytes": p.stat().st_size if p.exists() else None,
    })

payload = {
    "root": str(ROOT),
    "git_status": run(["git", "status", "--short"]),
    "git_branch": run(["git", "branch", "--show-current"]).strip(),
    "service_files": service_files,
    "priority_context": priority_context,
    "all_hits": results,
}

(OUT / "services_route_audit.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")

md = []
md.append("# Services Route Audit")
md.append("")
md.append(f"Root: `{ROOT}`")
md.append(f"Branch: `{payload['git_branch']}`")
md.append("")
md.append("## Git status")
md.append("")
md.append("```text")
md.append(payload["git_status"].strip() or "clean")
md.append("```")
md.append("")
md.append("## Candidate services files")
md.append("")
md.append("| Path | Exists | Size |")
md.append("|---|---:|---:|")
for row in service_files:
    md.append(f"| `{row['path']}` | {row['exists']} | {row['size_bytes'] or ''} |")

md.append("")
md.append("## Priority route/context hits")
md.append("")
for rel, ctx in priority_context.items():
    if not ctx:
        continue
    md.append(f"### `{rel}`")
    for group, hits in ctx.items():
        md.append(f"#### {group}")
        for h in hits:
            md.append(f"- L{h['line']}: `{h['text']}`")
    md.append("")

md.append("## All matching files")
md.append("")
for item in results:
    md.append(f"### `{item['path']}`")
    for group, hits in item["hits"].items():
        md.append(f"#### {group}")
        for h in hits[:12]:
            md.append(f"- L{h['line']}: `{h['text']}`")
    md.append("")

md.append("## Next likely decisions")
md.append("")
md.append("- If `/services` is hardcoded in Worker routing, replace its HTML source with `static/pages/services.html` or an R2 fetch.")
md.append("- If `/services` is served by dashboard/static fallback, place the new page in the existing static/public convention.")
md.append("- If no explicit `/services` route exists, add a small exact route before SPA/dashboard fallback.")
md.append("")
md.append("Raw JSON: `artifacts/services_route_audit/services_route_audit.json`")

(OUT / "SERVICES_ROUTE_AUDIT.md").write_text("\n".join(md) + "\n", encoding="utf-8")

print(f"Wrote {OUT / 'SERVICES_ROUTE_AUDIT.md'}")
print(f"Wrote {OUT / 'services_route_audit.json'}")
