#!/usr/bin/env python3
"""
audit_dead_code.py
==================
Agent Sam — Dead Code + Stale File Detector

Scans the repo for unused components, orphaned files, backup shadows,
duplicate implementations, large commented-out blocks, TODO/FIXME debt,
and debug artifacts.

Run from repo root:
    python3 scripts/audit_dead_code.py

Output:
    scripts/audit_dead_code_report.md
    scripts/audit_dead_code_data.json
"""

from __future__ import annotations

import json
import os
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

NOW = datetime.now(timezone.utc).isoformat()
REPO_ROOT = Path(os.getcwd())
REPORT_PATH = REPO_ROOT / "scripts" / "audit_dead_code_report.md"
DATA_PATH = REPO_ROOT / "scripts" / "audit_dead_code_data.json"

SOURCE_DIRS = ["dashboard", "src", "scripts"]
BACKUP_DIRS = ["scripts/patch_results", "scripts/backups", ".backup", "backup"]
CODE_EXTS = {".tsx", ".ts", ".jsx", ".js", ".py"}
IGNORE_DIRS = {"node_modules", ".git", "dist", "build", ".turbo", "__pycache__", ".venv", "venv"}
DUPE_SUSPECTS = [
    "ChatAssistant",
    "BrowserView",
    "ExcalidrawView",
    "MonacoEditorView",
    "McpPage",
    "AgentChat",
    "TerminalPanel",
    "WorkflowGraph",
    "SettingsPanel",
    "DashboardLayout",
    "Sidebar",
    "Header",
]


def is_ignored(path: Path) -> bool:
    parts = set(path.parts)
    return bool(parts & IGNORE_DIRS)


def is_backup_path(path: Path) -> bool:
    rel = path.relative_to(REPO_ROOT).as_posix() if path.is_absolute() else path.as_posix()
    return any(rel.startswith(backup_dir.rstrip("/") + "/") or rel == backup_dir.rstrip("/") for backup_dir in BACKUP_DIRS)


def collect_files(dirs: list[str]) -> list[Path]:
    files: list[Path] = []
    seen: set[Path] = set()
    for directory in dirs:
        root = REPO_ROOT / directory
        if not root.exists():
            continue
        for file in root.rglob("*"):
            if file in seen:
                continue
            if file.is_file() and file.suffix in CODE_EXTS and not is_ignored(file):
                seen.add(file)
                files.append(file)
    return sorted(files)


def read_file(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return ""


def rel(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


def stem_variants(path: Path) -> set[str]:
    base = path.with_suffix("")
    relative = rel(base)
    return {
        path.stem,
        path.name,
        relative,
        "./" + relative,
        "/" + relative,
    }


def find_duplicate_components(files: list[Path]) -> dict[str, list[str]]:
    by_name: dict[str, list[str]] = defaultdict(list)
    for file in files:
        stem = file.stem
        if stem in DUPE_SUSPECTS or any(suspect in stem for suspect in DUPE_SUSPECTS):
            by_name[stem].append(rel(file))
    return {name: paths for name, paths in by_name.items() if len(paths) > 1}


def find_backup_shadows(all_files: list[Path]) -> list[dict[str, str]]:
    live_by_name: dict[str, str] = {}
    backups: list[Path] = []
    for file in all_files:
        if is_backup_path(file):
            backups.append(file)
        else:
            live_by_name[file.name] = rel(file)

    shadows = []
    for backup in backups:
        live = live_by_name.get(backup.name)
        if live:
            shadows.append(
                {
                    "backup": rel(backup),
                    "live": live,
                    "risk": "Cursor/agent may read the backup instead of the live file",
                }
            )
    return sorted(shadows, key=lambda item: (item["live"], item["backup"]))


def find_unreferenced_components(files: list[Path]) -> list[dict[str, str]]:
    exports: dict[str, str] = {}
    content_by_file = {rel(file): read_file(file) for file in files if file.suffix in {".tsx", ".jsx"}}

    for file_rel, content in content_by_file.items():
        for match in re.finditer(r"export\s+(?:default\s+)?(?:function|const|class)\s+([A-Z]\w+)", content):
            exports[match.group(1)] = file_rel

    all_source = "\n".join(content_by_file.values())
    unreferenced = []
    for name, source in exports.items():
        source_lower = source.lower()
        if any(marker in source_lower for marker in ("test", "spec", "story", "stories")):
            continue
        occurrences = len(re.findall(rf"\b{re.escape(name)}\b", all_source))
        # One occurrence usually means the declaration itself only.
        if occurrences <= 1:
            unreferenced.append({"component": name, "defined_in": source})
    return sorted(unreferenced, key=lambda item: item["defined_in"])


def find_orphaned_files(files: list[Path]) -> list[str]:
    all_contents = {file: read_file(file) for file in files}
    imports_blob = "\n".join(all_contents.values())
    imported_tokens: set[str] = set()

    for content in all_contents.values():
        for import_path in re.findall(r"from\s+[\"']([^\"']+)[\"']|import\s*\(\s*[\"']([^\"']+)[\"']\s*\)", content):
            raw = next((item for item in import_path if item), "")
            if not raw:
                continue
            imported_tokens.add(raw)
            imported_tokens.add(raw.split("/")[-1])
            imported_tokens.add(re.sub(r"\.[a-zA-Z0-9]+$", "", raw.split("/")[-1]))

    entry_like = {"index", "vite.config", "main", "App", "worker", "wrangler.config"}
    orphans = []
    for file in files:
        path_rel = rel(file)
        stem = file.stem
        lowered = path_rel.lower()
        if stem in entry_like or any(marker in lowered for marker in ("test", "spec", "story", "stories", ".d.ts")):
            continue
        variants = stem_variants(file)
        used_by_import = any(token in imported_tokens or token in imports_blob for token in variants)
        if not used_by_import:
            orphans.append(path_rel)
    return sorted(orphans)


def find_large_comment_blocks(files: list[Path]) -> list[dict[str, Any]]:
    results = []
    line_comment_run = re.compile(r"(?m)(?:^\s*(?://|#).*$\n?){8,}")
    block_comment = re.compile(r"/\*[\s\S]{500,}?\*/")

    for file in files:
        content = read_file(file)
        blocks = line_comment_run.findall(content) + block_comment.findall(content)
        if blocks:
            results.append(
                {
                    "file": rel(file),
                    "comment_blocks": len(blocks),
                    "largest_block_chars": max(len(block) for block in blocks),
                }
            )
    return sorted(results, key=lambda item: -int(item["largest_block_chars"]))[:20]


def find_todo_debt(files: list[Path]) -> list[dict[str, Any]]:
    results = []
    pattern = re.compile(r"(?:TODO|FIXME|HACK|XXX|TEMP|DEPRECATED)[^\n]{0,120}", re.IGNORECASE)
    for file in files:
        hits = pattern.findall(read_file(file))
        if hits:
            results.append({"file": rel(file), "count": len(hits), "examples": hits[:3]})
    return sorted(results, key=lambda item: -int(item["count"]))[:20]


def find_debug_artifacts(files: list[Path]) -> list[dict[str, Any]]:
    results = []
    for file in files:
        if file.suffix not in {".tsx", ".ts", ".jsx", ".js"}:
            continue
        content = read_file(file)
        logs = re.findall(r"console\.(log|warn|error|debug)\s*\(", content)
        debuggers = re.findall(r"\bdebugger\b", content)
        if logs or debuggers:
            results.append(
                {
                    "file": rel(file),
                    "console_calls": len(logs),
                    "debugger_statements": len(debuggers),
                }
            )
    return sorted(results, key=lambda item: -(int(item["console_calls"]) + int(item["debugger_statements"])))[:20]


def write_report(data: dict[str, Any]) -> None:
    lines: list[str] = []
    append = lines.append

    append("# Agent Sam — Dead Code + Stale File Report")
    append(f"**Generated:** {NOW}")
    append("")
    append("## Summary")
    append(f"- Files scanned: {data['files_scanned']}")
    append(f"- Backup files scanned: {data['backup_files_scanned']}")
    append(f"- Duplicate components: {len(data['duplicates'])}")
    append(f"- Backup shadow files: {len(data['shadows'])}")
    append(f"- Unreferenced components: {len(data['unreferenced'])}")
    append(f"- Orphaned files: {len(data['orphans'])}")
    append(f"- Files with large comment blocks: {len(data['comment_blocks'])}")
    append(f"- Files with TODO/FIXME debt: {len(data['todo_debt'])}")
    append(f"- Files with debug artifacts: {len(data['debug'])}")
    append("")

    append("## Duplicate Component Implementations")
    append("These are high-risk because one implementation may be stale.")
    for name, paths in data["duplicates"].items():
        append(f"\n### `{name}`")
        for path in paths:
            append(f"- `{path}`")
    append("")

    append("## Backup Files Shadowing Live Files")
    for shadow in data["shadows"]:
        append(f"- BACKUP `{shadow['backup']}` shadows LIVE `{shadow['live']}`")
    append("")

    append("## Unreferenced Exported Components")
    append("Exported but apparently never imported or used in JSX anywhere. Verify before deleting.")
    for item in data["unreferenced"][:40]:
        append(f"- `{item['component']}` in `{item['defined_in']}`")
    append("")

    append("## Orphaned Files")
    append("Files that appear not to be imported. Verify entrypoints/dynamic imports before deleting.")
    for orphan in data["orphans"][:50]:
        append(f"- `{orphan}`")
    append("")

    append("## Large Comment Blocks")
    for item in data["comment_blocks"][:20]:
        append(f"- `{item['file']}` — {item['comment_blocks']} blocks, largest {item['largest_block_chars']} chars")
    append("")

    append("## TODO/FIXME Debt")
    for item in data["todo_debt"][:20]:
        example = str(item["examples"][0]).replace("|", "-")[:100]
        append(f"- `{item['file']}` — {item['count']} items: {example}")
    append("")

    append("## Debug Artifacts")
    for item in data["debug"][:20]:
        append(f"- `{item['file']}` — {item['console_calls']} console calls, {item['debugger_statements']} debuggers")
    append("")
    append("---")
    append(f"*Generated by `scripts/audit_dead_code.py` at {NOW}*")

    REPORT_PATH.write_text("\n".join(lines), encoding="utf-8")
    print(f"[ok] Report -> {REPORT_PATH}")


def main() -> None:
    print(f"[->] Dead Code Audit — {NOW}")
    print("[1/7] Collecting files...")
    all_files = collect_files(SOURCE_DIRS + BACKUP_DIRS)
    src_files = [file for file in all_files if not is_backup_path(file)]
    backup_files = [file for file in all_files if is_backup_path(file)]
    print(f"      {len(src_files)} source files, {len(backup_files)} backup files")

    print("[2/7] Finding duplicate components...")
    duplicates = find_duplicate_components(all_files)

    print("[3/7] Finding backup shadows...")
    shadows = find_backup_shadows(all_files)

    print("[4/7] Finding unreferenced components...")
    unreferenced = find_unreferenced_components(src_files)

    print("[5/7] Finding orphaned files...")
    orphans = find_orphaned_files(src_files)

    print("[6/7] Finding comment blocks and TODO debt...")
    comment_blocks = find_large_comment_blocks(src_files)
    todo_debt = find_todo_debt(src_files)

    print("[7/7] Finding debug artifacts...")
    debug = find_debug_artifacts(src_files)

    data = {
        "generated_at": NOW,
        "files_scanned": len(src_files),
        "backup_files_scanned": len(backup_files),
        "duplicates": duplicates,
        "shadows": shadows,
        "unreferenced": unreferenced,
        "orphans": orphans,
        "comment_blocks": comment_blocks,
        "todo_debt": todo_debt,
        "debug": debug,
    }

    DATA_PATH.write_text(json.dumps(data, indent=2, default=str), encoding="utf-8")
    write_report(data)

    print()
    print(f"  Duplicates:    {len(duplicates)}")
    print(f"  Shadows:       {len(shadows)}")
    print(f"  Unreferenced:  {len(unreferenced)}")
    print(f"  Orphans:       {len(orphans)}")
    print(f"  Debug files:   {len(debug)}")


if __name__ == "__main__":
    main()
