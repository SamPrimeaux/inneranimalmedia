#!/usr/bin/env python3
"""
audit_worker_routes.py
======================
Agent Sam — Worker Route Health Map

Maps routes defined in worker.js / src/** against frontend calls and docs.
Produces defined-only, called-only, matched, documented-only, and SSE route
buckets.

Run from repo root:
    python3 scripts/audit_worker_routes.py

Output:
    scripts/audit_worker_routes_report.md
    scripts/audit_worker_routes_data.json
"""

from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

NOW = datetime.now(timezone.utc).isoformat()
REPO_ROOT = Path(os.getcwd())
REPORT_PATH = REPO_ROOT / "scripts" / "audit_worker_routes_report.md"
DATA_PATH = REPO_ROOT / "scripts" / "audit_worker_routes_data.json"

IGNORE_DIRS = {"node_modules", ".git", "dist", "build", "__pycache__", ".turbo", ".venv", "venv"}

ROUTE_PATTERNS = [
    r"(?:app|router|hono)\.(get|post|put|patch|delete|all)\s*\(\s*[\"'`]([^\"'`]+)[\"'`]",
    r"pathname\s*={2,3}\s*[\"'`](/[^\"'`]+)[\"'`]",
    r"url\.pathname\.startsWith\s*\(\s*[\"'`](/[^\"'`]+)[\"'`]",
    r"path\.startsWith\s*\(\s*[\"'`](/[^\"'`]+)[\"'`]",
    r"request\.url.*?[\"'`](/api/[^\"'`]+)[\"'`]",
    r"[\"'`](/api/[^\"'`\s)]+)[\"'`]",
]

FETCH_PATTERNS = [
    r"fetch\s*\(\s*[\"'`]([^\"'`]+)[\"'`]",
    r"fetch\s*\(\s*`([^`]+)`",
    r"axios\.\w+\s*\(\s*[\"'`]([^\"'`]+)[\"'`]",
    r"[\"'`](/api/[^\"'`\s)]+)[\"'`]",
]

DOC_ROUTE_PATTERN = re.compile(r"`(/api/[^`\s]+)`|\b(?:GET|POST|PUT|PATCH|DELETE|ALL)\s+(/api/\S+)", re.IGNORECASE)


def is_ignored(path: Path) -> bool:
    return bool(set(path.parts) & IGNORE_DIRS)


def read_file(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return ""


def rel(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


def collect(paths: list[str], exts: set[str]) -> list[Path]:
    files: list[Path] = []
    seen: set[Path] = set()
    for item in paths:
        root = REPO_ROOT / item
        if not root.exists():
            continue
        if root.is_file():
            candidates = [root]
        else:
            candidates = list(root.rglob("*"))
        for file in candidates:
            if file in seen:
                continue
            if file.is_file() and file.suffix in exts and not is_ignored(file):
                seen.add(file)
                files.append(file)
    return sorted(files)


def normalize_template_route(route: str) -> str:
    route = route.strip().strip("'\"")
    route = re.sub(r"\$\{[^}]+\}", ":param", route)
    route = re.sub(r"\+\s*[^/\s)]+", ":param", route)
    route = route.split("?")[0]
    return route


def extract_defined_routes(files: list[Path]) -> list[dict[str, Any]]:
    routes: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str]] = set()
    for file in files:
        content = read_file(file)
        source = rel(file)
        for pattern in ROUTE_PATTERNS:
            for match in re.finditer(pattern, content, re.IGNORECASE):
                groups = [g for g in match.groups() if g]
                if not groups:
                    continue
                method = "ANY"
                route = None
                if groups[0].lower() in {"get", "post", "put", "patch", "delete", "all"} and len(groups) > 1:
                    method = groups[0].upper()
                    route = groups[1]
                else:
                    route = next((g for g in reversed(groups) if g.startswith("/")), None)
                if not route or len(route) <= 1:
                    continue
                route = normalize_template_route(route)
                key = (method, route, source)
                if key in seen:
                    continue
                seen.add(key)
                line = content[: match.start()].count("\n") + 1
                routes.append({"route": route, "method": method, "file": source, "line": line})
    return sorted(routes, key=lambda item: (item["route"], item["method"], item["file"]))


def extract_frontend_calls(files: list[Path]) -> list[dict[str, str]]:
    calls: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for file in files:
        content = read_file(file)
        source = rel(file)
        for pattern in FETCH_PATTERNS:
            for match in re.finditer(pattern, content):
                route = next((g for g in match.groups() if g), "")
                route = normalize_template_route(route)
                if "/api/" not in route:
                    continue
                if not route.startswith("/"):
                    route = "/" + route.split("/api/", 1)[1].join(["api/", ""])
                key = (route, source)
                if key in seen:
                    continue
                seen.add(key)
                calls.append({"route": route, "file": source})
    return sorted(calls, key=lambda item: (item["route"], item["file"]))


def extract_doc_mentions(files: list[Path]) -> list[dict[str, str]]:
    mentions: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for file in files:
        content = read_file(file)
        source = rel(file)
        for match in DOC_ROUTE_PATTERN.finditer(content):
            route = normalize_template_route(match.group(1) or match.group(2) or "")
            if not route:
                continue
            key = (route, source)
            if key in seen:
                continue
            seen.add(key)
            mentions.append({"route": route, "file": source})
    return sorted(mentions, key=lambda item: (item["route"], item["file"]))


def normalize_route(route: str) -> str:
    route = normalize_template_route(route)
    route = re.sub(r":[^/]+", ":param", route)
    route = re.sub(r"\*+", ":wildcard", route)
    route = re.sub(r"/+$", "", route)
    return route or "/"


def first_by_normalized(items: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for item in items:
        out.setdefault(normalize_route(item["route"]), item)
    return out


def match_routes(defined: list[dict[str, Any]], called: list[dict[str, str]], doc_mentions: list[dict[str, str]]) -> dict[str, Any]:
    def_map = first_by_normalized(defined)
    call_map = first_by_normalized(called)
    doc_map = first_by_normalized(doc_mentions)
    all_keys = set(def_map) | set(call_map)

    matched = []
    defined_only = []
    called_only = []
    documented_only = []

    for key in sorted(all_keys):
        in_defined = key in def_map
        in_called = key in call_map
        in_docs = key in doc_map
        if in_defined and in_called:
            matched.append({"normalized": key, "defined": def_map[key], "called": call_map[key], "documented": in_docs})
        elif in_defined:
            defined_only.append({"normalized": key, "defined": def_map[key], "documented": in_docs})
        elif in_called:
            called_only.append({"normalized": key, "called": call_map[key], "documented": in_docs})

    for key in sorted(doc_map):
        if key not in def_map and key not in call_map:
            documented_only.append({"normalized": key, "doc": doc_map[key]})

    return {
        "matched": matched,
        "defined_only": defined_only,
        "called_only": called_only,
        "documented_only": documented_only,
    }


def find_sse_routes(defined: list[dict[str, Any]], files: list[Path]) -> list[dict[str, Any]]:
    content_by_file = {rel(file): read_file(file) for file in files}
    sse_routes = []
    for route in defined:
        content = content_by_file.get(route["file"], "")
        index = content.find(route["route"])
        if index == -1:
            continue
        block = content[index : index + 1200]
        if re.search(r"text/event-stream|ReadableStream|EventSource|controller\.enqueue|stream", block, re.IGNORECASE):
            sse_routes.append(route)
    return sse_routes


def write_report(data: dict[str, Any]) -> None:
    lines: list[str] = []
    append = lines.append
    matched = data["matched_routes"]

    append("# Agent Sam — Worker Route Health Map")
    append(f"**Generated:** {NOW}")
    append("")
    append("## Summary")
    append("| Category | Count |")
    append("|----------|------:|")
    append(f"| Routes defined in Worker/src | {len(data['defined_routes'])} |")
    append(f"| Routes called from frontend | {len(data['frontend_calls'])} |")
    append(f"| Routes mentioned in docs | {len(data['doc_mentions'])} |")
    append(f"| Matched (defined + called) | {len(matched['matched'])} |")
    append(f"| Defined only (possibly dead) | {len(matched['defined_only'])} |")
    append(f"| Called only (404 risk) | {len(matched['called_only'])} |")
    append(f"| Documented only | {len(matched['documented_only'])} |")
    append(f"| SSE/streaming routes | {len(data['sse_routes'])} |")
    append("")

    append("## SSE / Streaming Routes")
    append("Primary targets for the Event Protocol remaster.")
    for route in data["sse_routes"]:
        append(f"- `{route['method']} {route['route']}` — `{route['file']}:{route['line']}`")
    append("")

    append("## Called-Only Routes (404 Risk)")
    append("Frontend calls these but no matching handler was found.")
    for route in matched["called_only"]:
        append(f"- `{route['normalized']}` — called from `{route['called']['file']}`")
    append("")

    append("## Defined-Only Routes (Possibly Dead)")
    append("Defined in backend but not detected in frontend calls.")
    for route in matched["defined_only"]:
        documented = " *(documented)*" if route["documented"] else ""
        append(f"- `{route['normalized']}` — `{route['defined']['file']}:{route['defined']['line']}`{documented}")
    append("")

    append("## Documented-Only Routes")
    for route in matched["documented_only"][:80]:
        append(f"- `{route['normalized']}` — `{route['doc']['file']}`")
    append("")

    append("## Matched Routes")
    append("| Route | Method | File | Documented |")
    append("|-------|--------|------|------------|")
    for route in matched["matched"]:
        append(f"| `{route['normalized']}` | {route['defined']['method']} | `{route['defined']['file']}` | {'yes' if route['documented'] else 'no'} |")
    append("")
    append("---")
    append(f"*Generated by `scripts/audit_worker_routes.py` at {NOW}*")

    REPORT_PATH.write_text("\n".join(lines), encoding="utf-8")
    print(f"[ok] Report -> {REPORT_PATH}")


def main() -> None:
    print(f"[->] Worker Route Health Map — {NOW}")

    print("[1/5] Scanning worker/src files for defined routes...")
    backend_files = collect(["worker.js", "src"], {".js", ".ts", ".mjs", ".cjs"})
    defined_routes = extract_defined_routes(backend_files)
    print(f"      {len(defined_routes)} routes defined")

    print("[2/5] Scanning frontend for fetch/API calls...")
    frontend_files = collect(["dashboard"], {".tsx", ".ts", ".jsx", ".js"})
    frontend_calls = extract_frontend_calls(frontend_files)
    print(f"      {len(frontend_calls)} frontend route calls")

    print("[3/5] Scanning docs for route mentions...")
    doc_files = collect(["docs", "scripts"], {".md", ".txt", ".py"})
    doc_mentions = extract_doc_mentions(doc_files)
    print(f"      {len(doc_mentions)} doc route mentions")

    print("[4/5] Matching routes...")
    matched = match_routes(defined_routes, frontend_calls, doc_mentions)

    print("[5/5] Detecting SSE routes...")
    sse_routes = find_sse_routes(defined_routes, backend_files)
    print(f"      {len(sse_routes)} SSE routes found")

    data = {
        "generated_at": NOW,
        "backend_files_scanned": [rel(file) for file in backend_files],
        "frontend_files_scanned": [rel(file) for file in frontend_files],
        "doc_files_scanned": [rel(file) for file in doc_files],
        "defined_routes": defined_routes,
        "frontend_calls": frontend_calls,
        "doc_mentions": doc_mentions,
        "matched_routes": matched,
        "sse_routes": sse_routes,
    }

    DATA_PATH.write_text(json.dumps(data, indent=2, default=str), encoding="utf-8")
    write_report(data)

    print()
    print(f"  Matched:       {len(matched['matched'])}")
    print(f"  404 risk:      {len(matched['called_only'])}")
    print(f"  Dead routes:   {len(matched['defined_only'])}")
    print(f"  Docs-only:     {len(matched['documented_only'])}")
    print(f"  SSE routes:    {len(sse_routes)}")


if __name__ == "__main__":
    main()
