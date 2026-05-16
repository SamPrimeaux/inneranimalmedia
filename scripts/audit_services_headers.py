#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

ROOT = Path.cwd()
OUT = ROOT / "artifacts" / "services_header_audit"
OUT.mkdir(parents=True, exist_ok=True)

REMOTE_R2_FILE = Path("/tmp/iam_services_remote_r2_current.html")
LOCAL_EXACT = Path("/private/tmp/iam_services_page_pull/services.html")

LOGO_URL = "https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/82791d36-cda6-43a6-d402-9406c6392e00/thumbnail"

SEARCH_PATTERNS = {
    "target_logo_url": re.escape(LOGO_URL),
    "imagedelivery_logo": r"imagedelivery\.net/g7wf09fCONpnidkRnR_5vw/82791d36-cda6-43a6-d402-9406c6392e00",
    "sign_up_cta": r"Sign\s*Up|signup|sign-up",
    "iam_header_component": r"iam-header\.html|src/components/iam-header\.html|<!--\s*iam-header\.html\s*-->",
    "services_route": r"['\"`]\/services['\"`]|pages/services/index\.html",
    "header_tags": r"<header\b|</header>|<nav\b|</nav>",
    "logo_mentions": r"logo|brand|IA\s*Media|Inner\s*Animal\s*Media",
}

SKIP_DIRS = {
    ".git", "node_modules", ".wrangler", "dist", "coverage", ".next", ".turbo",
    "playwright-report", "__pycache__",
}

SKIP_EXTS = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip", ".gz",
    ".tar", ".woff", ".woff2", ".ttf", ".otf", ".mp4", ".mov", ".sqlite",
    ".sqlite3", ".db", ".map",
}

TEXT_EXTS = {
    ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".html", ".css", ".md",
    ".json", ".jsonc", ".toml", ".txt", ".yml", ".yaml",
}

def run(cmd: list[str]) -> str:
    p = subprocess.run(cmd, cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    return p.stdout

def should_skip(path: Path) -> bool:
    try:
        rel = path.relative_to(ROOT)
    except ValueError:
        rel = path
    if any(part in SKIP_DIRS for part in rel.parts):
        return True
    if path.suffix.lower() in SKIP_EXTS:
        return True
    if path.name.startswith(".env"):
        return True
    return False

def read(path: Path) -> str:
    try:
        b = path.read_bytes()
        if b"\x00" in b[:4096]:
            return ""
        return b.decode("utf-8", errors="replace")
    except Exception:
        return ""

def hits_for_text(text: str):
    out = {}
    lines = text.splitlines()
    for key, pat in SEARCH_PATTERNS.items():
        rx = re.compile(pat, re.I)
        arr = []
        for i, line in enumerate(lines, start=1):
            if rx.search(line):
                arr.append({"line": i, "text": line.strip()[:500]})
        if arr:
            out[key] = arr[:60]
    return out

# Pull current remote R2 object for exact inspection.
r2_get = run([
    "./scripts/with-cloudflare-env.sh", "npx", "wrangler",
    "r2", "object", "get", "inneranimalmedia/pages/services/index.html",
    "--remote",
    "--file", str(REMOTE_R2_FILE),
])

files_to_check = []

for candidate in [
    LOCAL_EXACT,
    REMOTE_R2_FILE,
    ROOT / "static/pages/services.html",
    ROOT / "static/pages/services.r2.html",
    ROOT / "src/index.js",
    ROOT / "src/components/iam-header.html",
    ROOT / "src/components/iam-footer.html",
]:
    if candidate.exists():
        files_to_check.append(candidate)

# Repo-wide scan for header/logo/CTA sources.
for p in ROOT.rglob("*"):
    if p.is_file() and not should_skip(p):
        if p.suffix.lower() in TEXT_EXTS or p.name in {"wrangler.production.toml", "wrangler.toml"}:
            files_to_check.append(p)

seen = set()
results = []
for p in files_to_check:
    key = str(p)
    if key in seen:
        continue
    seen.add(key)

    text = read(p)
    if not text:
        continue

    h = hits_for_text(text)
    if h:
        try:
            rel = str(p.relative_to(ROOT))
        except ValueError:
            rel = str(p)
        results.append({
            "path": rel,
            "size": p.stat().st_size,
            "hits": h,
        })

payload = {
    "root": str(ROOT),
    "r2_get_output": r2_get,
    "logo_url": LOGO_URL,
    "local_exact_exists": LOCAL_EXACT.exists(),
    "remote_r2_file": str(REMOTE_R2_FILE),
    "results": results,
}

(OUT / "services_header_audit.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")

md = []
md.append("# Services Header Audit")
md.append("")
md.append(f"Logo URL searched: `{LOGO_URL}`")
md.append("")
md.append("## R2 pull")
md.append("")
md.append("```text")
md.append(r2_get.strip())
md.append("```")
md.append("")
md.append("## Matching files")
md.append("")
for item in results:
    md.append(f"### `{item['path']}`")
    md.append(f"Size: `{item['size']}` bytes")
    md.append("")
    for group, hits in item["hits"].items():
        md.append(f"#### {group}")
        for h in hits[:20]:
            md.append(f"- L{h['line']}: `{h['text']}`")
        md.append("")
md.append("## Likely interpretation")
md.append("")
md.append("- If the exact imported file contains `<header>` / `<nav>`, that is the built-in services header.")
md.append("- If `src/components/iam-header.html` or R2 `src/components/iam-header.html` contains `Sign Up`, that is the injected global header.")
md.append("- If production shows both, either strip the imported page header or bypass Worker injection for `/services`.")
md.append("")
(OUT / "SERVICES_HEADER_AUDIT.md").write_text("\n".join(md), encoding="utf-8")

print(f"Wrote {OUT / 'SERVICES_HEADER_AUDIT.md'}")
print(f"Wrote {OUT / 'services_header_audit.json'}")
