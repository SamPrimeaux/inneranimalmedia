#!/usr/bin/env python3
"""
audit_cms_surfaces.py
=====================
Agent Sam — CMS Surface Audit

Consolidates findings across overlapping CMS/editor/theme plans. Maps what is
wired, broken, absent, or duplicated across CMS files, D1 table references,
API routes, theme runtime, and editor wiring.

Run from repo root:
    python3 scripts/audit_cms_surfaces.py

Output:
    scripts/audit_cms_surfaces_report.md
    scripts/audit_cms_surfaces_data.json
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
REPORT_PATH = REPO_ROOT / "scripts" / "audit_cms_surfaces_report.md"
DATA_PATH = REPO_ROOT / "scripts" / "audit_cms_surfaces_data.json"

IGNORE_DIRS = {"node_modules", ".git", "dist", "build", "__pycache__", ".turbo", ".venv", "venv"}
CMS_FILE_PATTERNS = [
    "cms", "editor", "theme", "section", "content", "page", "realtime", "live",
]
CMS_TABLES = [
    "cms_pages", "cms_sections", "cms_themes", "cms_theme_presets",
    "cms_content_blocks", "cms_media", "cms_drafts", "cms_revisions",
    "cms_clients", "cms_templates", "cms_slugs", "agentsam_cms",
    "site_pages", "site_sections", "site_themes", "theme_presets",
    "page_content", "content_blocks",
]
CMS_ROUTES = [
    "/api/cms", "/api/themes", "/api/pages", "/api/sections",
    "/api/content", "/api/media", "/api/drafts", "/api/site",
    "/api/editor", "/api/live", "/api/realtime",
]
SCAN_DIRS = ["dashboard", "src", "cms", "docs", "migrations", "scripts", "sql", "static"]
CODE_EXTS = {".tsx", ".ts", ".jsx", ".js", ".mjs", ".cjs", ".py", ".sql", ".md", ".txt", ".html", ".json", ".css"}


def is_ignored(path: Path) -> bool:
    return bool(set(path.parts) & IGNORE_DIRS)


def read_file(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return ""


def rel(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


def iter_files(dirs: list[str], exts: set[str] | None = None) -> list[Path]:
    files: list[Path] = []
    seen: set[Path] = set()
    for directory in dirs:
        root = REPO_ROOT / directory
        if not root.exists():
            continue
        for file in root.rglob("*"):
            if file in seen or not file.is_file() or is_ignored(file):
                continue
            if exts is None or file.suffix in exts:
                seen.add(file)
                files.append(file)
    return sorted(files)


def classify_cms_file(path: Path) -> str | None:
    path_rel = rel(path)
    name = path.name.lower()
    full = path_rel.lower()
    if not any(pattern in name or pattern in full for pattern in CMS_FILE_PATTERNS):
        return None
    if full.startswith("migrations/") or full.startswith("sql/") or "migration" in full:
        return "migrations"
    if full.startswith("docs/"):
        return "docs"
    if full.startswith("scripts/"):
        return "scripts"
    if full.startswith("src/"):
        return "backend"
    if "editor" in name or "live" in name:
        return "editor"
    if "theme" in name:
        return "themes"
    if "section" in name:
        return "sections"
    return "routing"


def collect_cms_files() -> dict[str, list[str]]:
    categories = {
        "editor": [],
        "themes": [],
        "sections": [],
        "routing": [],
        "backend": [],
        "docs": [],
        "migrations": [],
        "scripts": [],
    }
    for file in iter_files(SCAN_DIRS, CODE_EXTS):
        category = classify_cms_file(file)
        if category:
            categories[category].append(rel(file))
    for key in categories:
        categories[key] = sorted(set(categories[key]))
    return categories


def content_for_paths(paths: list[str]) -> str:
    chunks = []
    for item in paths:
        path = REPO_ROOT / item
        if path.exists():
            chunks.append(read_file(path))
    return "\n".join(chunks)


def audit_table_references(cms_files: dict[str, list[str]]) -> dict[str, dict[str, Any]]:
    cms_paths = [path for paths in cms_files.values() for path in paths]
    all_scan_files = set(cms_paths)
    for extra in iter_files(["src", "migrations", "sql", "dashboard"], {".js", ".ts", ".tsx", ".sql", ".md"}):
        all_scan_files.add(rel(extra))
    content = content_for_paths(sorted(all_scan_files))

    result = {}
    for table in CMS_TABLES:
        referenced = bool(re.search(rf"\b{re.escape(table)}\b", content))
        migration = bool(re.search(rf"CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+[\"`']?{re.escape(table)}[\"`']?", content, re.IGNORECASE))
        dropped = bool(re.search(rf"DROP\s+TABLE(?:\s+IF\s+EXISTS)?\s+[\"`']?{re.escape(table)}[\"`']?", content, re.IGNORECASE))
        result[table] = {
            "referenced_in_code": referenced,
            "has_migration": migration,
            "dropped_somewhere": dropped,
            "status": "healthy" if referenced and migration else "code_only" if referenced else "migration_only" if migration else "absent",
        }
    return result


def audit_route_wiring() -> dict[str, dict[str, str | bool]]:
    backend_content = "\n".join(read_file(file) for file in iter_files(["worker.js", "src"], {".js", ".ts", ".mjs", ".cjs"}))
    frontend_content = "\n".join(read_file(file) for file in iter_files(["dashboard"], {".tsx", ".ts", ".jsx", ".js"}))
    docs_content = "\n".join(read_file(file) for file in iter_files(["docs", "scripts"], {".md", ".txt", ".py"}))

    result = {}
    for route in CMS_ROUTES:
        defined = bool(re.search(re.escape(route), backend_content))
        called = bool(re.search(re.escape(route), frontend_content))
        documented = bool(re.search(re.escape(route), docs_content))
        status = "healthy" if defined and called else "dead_route" if defined and not called else "404_risk" if called and not defined else "documented_only" if documented else "absent"
        result[route] = {
            "defined_in_backend": defined,
            "called_in_frontend": called,
            "mentioned_in_docs": documented,
            "status": status,
        }
    return result


def audit_theme_system() -> dict[str, Any]:
    result: dict[str, Any] = {}
    backend_content = "\n".join(read_file(file) for file in iter_files(["worker.js", "src"], {".js", ".ts", ".mjs", ".cjs"}))
    dashboard_content = "\n".join(read_file(file) for file in iter_files(["dashboard", "static"], {".tsx", ".ts", ".jsx", ".js", ".html", ".css"}))

    result["backend_has_themes_route"] = bool(re.search(r"/api/themes", backend_content))
    result["backend_has_theme_presets"] = bool(re.search(r"theme_preset|themePreset|cms_theme_presets", backend_content, re.IGNORECASE))
    result["theme_var_map_present"] = bool(re.search(r"THEME_VAR_MAP|css_vars_json|cssVars", backend_content + dashboard_content))
    result["dashboard_has_theme_loader"] = bool(re.search(r"loadTheme|THEME_VAR_MAP|/api/themes|cms_themes", dashboard_content))
    result["broadcast_theme_mentions"] = len(re.findall(r"broadcast|BroadcastChannel|IAM_COLLAB|theme.*event", dashboard_content, re.IGNORECASE))

    theme_files = [rel(file) for file in iter_files(["cms", "dashboard", "src", "docs"], CODE_EXTS) if "theme" in file.name.lower() or "theme" in rel(file).lower()]
    result["theme_files"] = theme_files[:50]

    hardcoded = []
    for file in iter_files(["dashboard"], {".tsx", ".ts", ".jsx", ".js", ".css"}):
        content = read_file(file)
        if re.search(r"theme\s*[:=]\s*[\"'](?:dark|light|ocean|forest|classy)[\"']", content, re.IGNORECASE):
            hardcoded.append(rel(file))
    result["files_with_hardcoded_themes"] = hardcoded[:50]
    return result


def audit_editor_wiring() -> dict[str, Any]:
    result: dict[str, Any] = {}
    editor_candidates = [
        "dashboard/components/CmsEditor.tsx",
        "dashboard/features/cms/CmsEditor.tsx",
        "dashboard/components/LiveEditor.tsx",
        "dashboard/features/cms/LiveEditor.tsx",
        "cms/editor.html",
        "static/dashboard/cms.html",
        "dashboard/components/CmsPage.tsx",
        "dashboard/features/cms/index.ts",
    ]
    for path_rel in editor_candidates:
        path = REPO_ROOT / path_rel
        result[path_rel] = {"exists": path.exists(), "lines": read_file(path).count("\n") + 1 if path.exists() else 0}

    app_path = REPO_ROOT / "dashboard" / "App.tsx"
    app_content = read_file(app_path)
    result["app_has_cms_route"] = bool(re.search(r"/cms|CmsPage|cms-editor|LiveEditor", app_content, re.IGNORECASE))
    result["app_cms_route_lines"] = re.findall(r".{0,80}cms.{0,80}", app_content, re.IGNORECASE)[:10]

    cms_component_files = []
    for file in iter_files(["dashboard"], {".tsx", ".ts", ".jsx", ".js"}):
        full = rel(file).lower()
        name = file.name.lower()
        if "cms" in full or "editor" in name or "theme" in name or "section" in name:
            cms_component_files.append(rel(file))
    result["cms_dashboard_component_files"] = cms_component_files[:80]
    return result


def write_report(data: dict[str, Any]) -> None:
    lines: list[str] = []
    append = lines.append

    append("# Agent Sam — CMS Surface Audit")
    append(f"**Generated:** {NOW}")
    append("")

    append("## CMS File Inventory")
    for category, files in data["cms_files"].items():
        append(f"\n### {category.title()} ({len(files)} files)")
        for file in files[:25]:
            append(f"- `{file}`")
    append("")

    append("## Table Reference Status")
    append("| Table | In Code | Has Migration | Dropped | Status |")
    append("|-------|---------|---------------|---------|--------|")
    for table, info in data["table_refs"].items():
        append(f"| `{table}` | {info['referenced_in_code']} | {info['has_migration']} | {info['dropped_somewhere']} | **{info['status']}** |")
    append("")

    append("## Route Wiring Status")
    append("| Route | Backend | Frontend | Docs | Status |")
    append("|-------|---------|----------|------|--------|")
    for route, info in data["route_wiring"].items():
        append(f"| `{route}` | {info['defined_in_backend']} | {info['called_in_frontend']} | {info['mentioned_in_docs']} | **{info['status']}** |")
    append("")

    append("## Theme System")
    for key, value in data["theme_audit"].items():
        if isinstance(value, list):
            append(f"- **{key}:** {value[:10]}")
        else:
            append(f"- **{key}:** `{value}`")
    append("")

    append("## Editor Wiring")
    for key, value in data["editor_wiring"].items():
        if isinstance(value, dict):
            append(f"- `{key}`: exists={value.get('exists')}, lines={value.get('lines')}")
        else:
            append(f"- **{key}:** {value}")
    append("")
    append("---")
    append(f"*Generated by `scripts/audit_cms_surfaces.py` at {NOW}*")

    REPORT_PATH.write_text("\n".join(lines), encoding="utf-8")
    print(f"[ok] Report -> {REPORT_PATH}")


def main() -> None:
    print(f"[->] CMS Surface Audit — {NOW}")
    print("[1/4] Collecting CMS files...")
    cms_files = collect_cms_files()
    total = sum(len(files) for files in cms_files.values())
    print(f"      {total} CMS-related files found")

    print("[2/4] Auditing table references...")
    table_refs = audit_table_references(cms_files)

    print("[3/4] Auditing route wiring...")
    route_wiring = audit_route_wiring()

    print("[4/4] Auditing theme system + editor...")
    theme_audit = audit_theme_system()
    editor_wiring = audit_editor_wiring()

    data = {
        "generated_at": NOW,
        "cms_files": cms_files,
        "table_refs": table_refs,
        "route_wiring": route_wiring,
        "theme_audit": theme_audit,
        "editor_wiring": editor_wiring,
    }

    DATA_PATH.write_text(json.dumps(data, indent=2, default=str), encoding="utf-8")
    write_report(data)

    healthy_routes = sum(1 for value in route_wiring.values() if value["status"] == "healthy")
    broken_routes = sum(1 for value in route_wiring.values() if value["status"] in {"404_risk", "dead_route"})
    code_only_tables = sum(1 for value in table_refs.values() if value["status"] == "code_only")
    migration_only_tables = sum(1 for value in table_refs.values() if value["status"] == "migration_only")
    print()
    print(f"  Healthy routes:        {healthy_routes}")
    print(f"  Broken routes:         {broken_routes}")
    print(f"  Code-only tables:      {code_only_tables}")
    print(f"  Migration-only tables: {migration_only_tables}")


if __name__ == "__main__":
    main()
