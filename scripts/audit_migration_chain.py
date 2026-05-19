#!/usr/bin/env python3
"""
audit_migration_chain.py
========================
Agent Sam — Migration Chain Auditor

Reads migration SQL files in order, builds a table/index/destructive-operation
timeline, checks Wrangler D1 bindings, and flags schema gaps against known
Agent Sam platform tables.

Run from repo root:
    python3 scripts/audit_migration_chain.py

Output:
    scripts/audit_migration_chain_report.md
    scripts/audit_migration_chain_data.json
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
REPORT_PATH = REPO_ROOT / "scripts" / "audit_migration_chain_report.md"
DATA_PATH = REPO_ROOT / "scripts" / "audit_migration_chain_data.json"

MIGRATION_DIRS = ["migrations", "sql", "db", "database"]
IGNORE_DIRS = {"node_modules", ".git", "__pycache__", ".venv", "venv"}

KNOWN_TABLES = {
    "agentsam_plans", "agentsam_plan_tasks", "agentsam_agent_run",
    "agentsam_execution_steps", "agentsam_workflow_runs", "agentsam_workflows",
    "agentsam_tool_call_log", "agentsam_error_log", "agentsam_artifacts",
    "agentsam_approvals", "agentsam_command_run", "agentsam_scripts",
    "agentsam_todo", "context_index", "vectorize_index_registry",
    "mcp_workspace_tokens", "mcp_tool_calls", "spend_audit",
    "terminal_sessions", "agent_memory_index",
}


def is_ignored(path: Path) -> bool:
    return bool(set(path.parts) & IGNORE_DIRS)


def read_file(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return ""


def rel(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


def strip_sql_comments(content: str) -> str:
    content = re.sub(r"/\*[\s\S]*?\*/", "", content)
    content = re.sub(r"--.*$", "", content, flags=re.MULTILINE)
    return content


def collect_migrations() -> list[Path]:
    files: list[Path] = []
    seen: set[Path] = set()
    for directory in MIGRATION_DIRS:
        root = REPO_ROOT / directory
        if not root.exists():
            continue
        for file in root.rglob("*.sql"):
            if file not in seen and file.is_file() and not is_ignored(file):
                seen.add(file)
                files.append(file)

    def sort_key(path: Path) -> tuple[int, str]:
        match = re.match(r"^(\d+)", path.stem)
        return (int(match.group(1)) if match else 999999, rel(path))

    return sorted(files, key=sort_key)


def parse_migration(content: str) -> dict[str, Any]:
    original = content
    cleaned = strip_sql_comments(content)
    result: dict[str, Any] = {
        "creates": [],
        "drops": [],
        "alters": [],
        "indexes": [],
        "inserts": [],
        "renames": [],
        "is_destructive": False,
        "has_rollback": bool(re.search(r"--\s*(rollback|down|revert)", original, re.IGNORECASE)),
    }

    for match in re.finditer(r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[\"`']?(\w+)[\"`']?\s*\(", cleaned, re.IGNORECASE):
        result["creates"].append(match.group(1))

    for match in re.finditer(r"DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?[\"`']?(\w+)[\"`']?", cleaned, re.IGNORECASE):
        result["drops"].append(match.group(1))
        result["is_destructive"] = True

    alter_pattern = re.compile(
        r"ALTER\s+TABLE\s+[\"`']?(\w+)[\"`']?\s+"
        r"(ADD\s+COLUMN|DROP\s+COLUMN|RENAME\s+COLUMN|RENAME\s+TO)\s+"
        r"[\"`']?(\w+)?[\"`']?",
        re.IGNORECASE,
    )
    for match in alter_pattern.finditer(cleaned):
        table = match.group(1)
        op = match.group(2).upper()
        target = match.group(3)
        result["alters"].append({"table": table, "op": op, "column": target})
        if "DROP" in op:
            result["is_destructive"] = True
        if op == "RENAME TO":
            result["renames"].append({"from": table, "to": target})

    for match in re.finditer(r"CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?[\"`']?(\w+)[\"`']?", cleaned, re.IGNORECASE):
        result["indexes"].append(match.group(1))

    for match in re.finditer(r"INSERT\s+(?:OR\s+\w+\s+)?INTO\s+[\"`']?(\w+)[\"`']?", cleaned, re.IGNORECASE):
        result["inserts"].append(match.group(1))

    if re.search(r"DELETE\s+FROM\s+|TRUNCATE\s+TABLE\s+", cleaned, re.IGNORECASE):
        result["is_destructive"] = True

    return result


def build_schema_timeline(migrations: list[Path]) -> dict[str, Any]:
    tables: dict[str, dict[str, Any]] = {}
    all_indexes: set[str] = set()
    destructive: list[dict[str, str]] = []
    no_rollback: list[str] = []
    table_history: dict[str, list[dict[str, Any]]] = defaultdict(list)
    migration_summaries: list[dict[str, Any]] = []

    for migration in migrations:
        content = read_file(migration)
        parsed = parse_migration(content)
        migration_rel = rel(migration)
        migration_summaries.append({"file": migration_rel, **parsed})

        for table in parsed["creates"]:
            tables.setdefault(table, {"created_in": migration_rel, "columns_added": [], "dropped": False, "renamed_to": None})
            tables[table]["created_in"] = tables[table].get("created_in") or migration_rel
            tables[table]["dropped"] = False
            table_history[table].append({"migration": migration_rel, "event": "CREATE"})

        for table in parsed["drops"]:
            tables.setdefault(table, {"created_in": None, "columns_added": [], "dropped": False, "renamed_to": None})
            tables[table]["dropped"] = True
            table_history[table].append({"migration": migration_rel, "event": "DROP"})
            destructive.append({"migration": migration_rel, "table": table, "op": "DROP TABLE"})

        for alter in parsed["alters"]:
            table = alter["table"]
            tables.setdefault(table, {"created_in": None, "columns_added": [], "dropped": False, "renamed_to": None})
            if alter["op"].startswith("ADD") and alter.get("column"):
                tables[table]["columns_added"].append(alter["column"])
            if alter["op"].startswith("DROP"):
                destructive.append({"migration": migration_rel, "table": table, "op": f"DROP COLUMN {alter.get('column')}"})
            if alter["op"] == "RENAME TO" and alter.get("column"):
                tables[table]["renamed_to"] = alter["column"]
                table_history[alter["column"]].append({"migration": migration_rel, "event": "RENAMED_FROM", "from": table})
            table_history[table].append({"migration": migration_rel, "event": alter["op"], "column": alter.get("column")})

        for index in parsed["indexes"]:
            all_indexes.add(index)

        if parsed["is_destructive"] and not parsed["has_rollback"]:
            no_rollback.append(migration_rel)

    return {
        "tables": tables,
        "indexes": sorted(all_indexes),
        "destructive": destructive,
        "no_rollback": no_rollback,
        "table_history": dict(table_history),
        "migration_summaries": migration_summaries,
    }


def detect_gaps(schema: dict[str, Any]) -> dict[str, Any]:
    live_tables = {name for name, info in schema["tables"].items() if not info.get("dropped")}
    known = set(KNOWN_TABLES)
    dropped_known = {name for name, info in schema["tables"].items() if info.get("dropped") and name in known}
    return {
        "in_code_not_migrated": sorted(known - live_tables),
        "in_migrations_unknown": sorted(live_tables - known),
        "dropped_but_known": sorted(dropped_known),
        "total_live_tables": len(live_tables),
    }


def check_wrangler_bindings() -> dict[str, Any]:
    candidates = ["wrangler.jsonc", "wrangler.production.toml", "wrangler.toml"]
    for name in candidates:
        path = REPO_ROOT / name
        if not path.exists():
            continue
        content = read_file(path)
        db_ids = re.findall(r"database_id\s*=\s*[\"']([^\"']+)[\"']", content)
        db_names = re.findall(r"database_name\s*=\s*[\"']([^\"']+)[\"']", content)
        bindings = re.findall(r"binding\s*=\s*[\"']([^\"']+)[\"']", content)
        return {"file": name, "database_ids": db_ids, "database_names": db_names, "bindings": bindings}
    return {"file": None, "database_ids": [], "database_names": [], "bindings": []}


def write_report(data: dict[str, Any]) -> None:
    lines: list[str] = []
    append = lines.append
    schema = data["schema"]
    gaps = data["gaps"]

    append("# Agent Sam — Migration Chain Report")
    append(f"**Generated:** {NOW}")
    append("")
    append("## Summary")
    append(f"- Migration files found: {data['migration_count']}")
    append(f"- Tables ever created/referenced by DDL: {len(schema['tables'])}")
    append(f"- Live tables (not dropped): {gaps['total_live_tables']}")
    append(f"- Indexes created: {len(schema['indexes'])}")
    append(f"- Destructive operations: {len(schema['destructive'])}")
    append(f"- Destructive ops without rollback marker: {len(schema['no_rollback'])}")
    append("")

    append("## Wrangler D1 Binding")
    wrangler = data["wrangler_bindings"]
    append(f"- Config file: `{wrangler.get('file')}`")
    append(f"- Database IDs: {wrangler.get('database_ids')}")
    append(f"- Database names: {wrangler.get('database_names')}")
    append(f"- Bindings: {wrangler.get('bindings')}")
    append("")

    append("## Gap Analysis")
    append("### Known Tables Not Created by Migration Chain")
    append("These may be created manually, created in remote D1 only, or missing migrations.")
    for table in gaps["in_code_not_migrated"]:
        append(f"- `{table}`")
    append("")

    append("### Tables in Migrations Not in Known Agent Sam List")
    append("May be legacy, client tables, CMS tables, renamed tables, or unused tables.")
    for table in gaps["in_migrations_unknown"][:80]:
        append(f"- `{table}`")
    append("")

    append("### Known Tables That Were Dropped")
    append("High risk if code still references these.")
    for table in gaps["dropped_but_known"]:
        append(f"- `{table}`")
    append("")

    append("## Destructive Operations Without Rollback Marker")
    for migration in schema["no_rollback"]:
        append(f"- `{migration}`")
    append("")

    append("## Destructive Operations Detail")
    append("| Migration | Table | Operation |")
    append("|-----------|-------|-----------|")
    for item in schema["destructive"]:
        append(f"| `{item['migration']}` | `{item['table']}` | {item['op']} |")
    append("")

    append("## Live Table Snapshot")
    append("| Table | Created In | Columns Added | Renamed To |")
    append("|-------|------------|---------------|------------|")
    for name, info in sorted(schema["tables"].items()):
        if not info.get("dropped"):
            created = str(info.get("created_in") or "unknown")[:80]
            append(f"| `{name}` | `{created}` | {len(info.get('columns_added', []))} | `{info.get('renamed_to')}` |")
    append("")
    append("---")
    append(f"*Generated by `scripts/audit_migration_chain.py` at {NOW}*")

    REPORT_PATH.write_text("\n".join(lines), encoding="utf-8")
    print(f"[ok] Report -> {REPORT_PATH}")


def main() -> None:
    print(f"[->] Migration Chain Audit — {NOW}")
    print("[1/4] Collecting migration files...")
    migrations = collect_migrations()
    print(f"      {len(migrations)} migration files found")

    print("[2/4] Building schema timeline...")
    schema = build_schema_timeline(migrations)

    print("[3/4] Detecting gaps...")
    gaps = detect_gaps(schema)
    print(f"      {gaps['total_live_tables']} live tables, {len(gaps['in_code_not_migrated'])} gaps")

    print("[4/4] Checking wrangler bindings...")
    wrangler = check_wrangler_bindings()

    data = {
        "generated_at": NOW,
        "migration_count": len(migrations),
        "migrations": [rel(migration) for migration in migrations],
        "schema": schema,
        "gaps": gaps,
        "wrangler_bindings": wrangler,
    }

    DATA_PATH.write_text(json.dumps(data, indent=2, default=str), encoding="utf-8")
    write_report(data)

    print()
    print(f"  Live tables: {gaps['total_live_tables']}")
    print(f"  Gaps:        {len(gaps['in_code_not_migrated'])}")
    print(f"  Destructive: {len(schema['destructive'])}")
    print(f"  No rollback: {len(schema['no_rollback'])}")


if __name__ == "__main__":
    main()
