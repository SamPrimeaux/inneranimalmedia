#!/usr/bin/env python3

import json
import re
from pathlib import Path

REPO = Path(".").resolve()
OUT = REPO / "artifacts" / "cms_page_pull"
OUT.mkdir(parents=True, exist_ok=True)

ROOTS = [
    "static/pages",
    "public",
    "src/pages",
    "src/routes",
    "src/app",
    "app",
    "pages",
]

EXTS = {".html", ".htm", ".liquid", ".md", ".mdx", ".tsx", ".jsx"}
IGNORE = {"node_modules", ".git", "dist", "artifacts", ".wrangler", "__pycache__"}


def bad(path):
    return any(part in IGNORE for part in path.parts)


def read(path):
    try:
        return path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return ""


def clean_name(path):
    return re.sub(r"[^a-z0-9]+", "-", path.lower()).strip("-") or "page"


def route_guess(rel):
    route = rel
    for prefix in ROOTS:
        prefix = prefix.rstrip("/") + "/"
        if route.startswith(prefix):
            route = route[len(prefix):]
            break

    route = re.sub(r"\.(html|htm|liquid|md|mdx|tsx|jsx)$", "", route)
    route = route.replace("/index", "")
    route = route.strip("/")

    return "/" + route if route else "/"


def headings(text):
    found = []

    for m in re.finditer(r"<h[1-6][^>]*>(.*?)</h[1-6]>", text, re.I | re.S):
        h = re.sub(r"<[^>]+>", " ", m.group(1))
        h = re.sub(r"\s+", " ", h).strip()
        if h:
            found.append(h)

    for m in re.finditer(r"^\s{0,3}#{1,6}\s+(.+)$", text, re.M):
        h = m.group(1).strip()
        if h:
            found.append(h)

    return found[:30]


def title(text):
    m = re.search(r"<title[^>]*>(.*?)</title>", text, re.I | re.S)
    if not m:
        return ""
    t = re.sub(r"<[^>]+>", " ", m.group(1))
    return re.sub(r"\s+", " ", t).strip()


def components(text):
    return sorted(set(re.findall(r"<([A-Z][A-Za-z0-9_]*)\b", text)))[:80]


def assets(text):
    found = set()
    for m in re.finditer(r"""(?:src|href)=["']([^"']+)["']""", text, re.I):
        val = m.group(1)
        if not val.startswith("data:"):
            found.add(val)
    for m in re.finditer(r"""["']([^"']+\.(png|jpg|jpeg|webp|gif|svg|mp4|webm|glb|gltf|pdf))["']""", text, re.I):
        found.add(m.group(1))
    return sorted(found)[:120]


pages = []

for root_name in ROOTS:
    root = REPO / root_name
    if not root.exists():
        continue

    for path in root.rglob("*"):
        if not path.is_file():
            continue
        rel_path = path.relative_to(REPO)
        if bad(rel_path):
            continue
        if path.suffix.lower() not in EXTS:
            continue

        rel = str(rel_path)
        text = read(path)

        row = {
            "path": rel,
            "route_guess": route_guess(rel),
            "ext": path.suffix.lower(),
            "bytes": len(text.encode("utf-8")),
            "lines": text.count("\n") + 1,
            "title": title(text),
            "headings": headings(text),
            "components": components(text),
            "assets": assets(text),
            "has_cms": "cms" in text.lower(),
            "has_liquid": "liquid" in text.lower() or "{{" in text or "{%" in text,
            "sample": text[:4000],
        }

        pages.append(row)

pages = sorted(pages, key=lambda x: x["path"])

(OUT / "public_pages_pull.json").write_text(
    json.dumps({"count": len(pages), "pages": pages}, indent=2),
    encoding="utf-8",
)

lines = ["# Public Pages Pull", "", f"Count: {len(pages)}", ""]
for p in pages:
    lines.append(f"- `{p['route_guess']}` | `{p['path']}` | `{p['bytes']}` bytes")

(OUT / "INDEX.md").write_text("\n".join(lines) + "\n", encoding="utf-8")

print("DONE")
print("pages:", len(pages))
print("open:", OUT)