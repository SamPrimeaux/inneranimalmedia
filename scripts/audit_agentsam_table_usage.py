#!/usr/bin/env python3
"""
audit_agentsam_table_usage.py
=============================

Agent Sam D1 + repo usage audit.

READ ONLY.

What it does:
- Lists all agentsam_* D1 tables.
- Pulls schema, indexes, foreign keys, row counts.
- Detects timestamp columns and recent activity.
- Samples a few rows per table.
- Greps the repo for each table name.
- Classifies each table as hot / wired-empty / seeded-only / populated-orphan / unused-empty / etc.
- Writes Markdown + JSON reports.

Usage:
  python3 scripts/audit_agentsam_table_usage.py

Optional:
  python3 scripts/audit_agentsam_table_usage.py --db inneranimalmedia-business --config wrangler.production.toml --remote
  python3 scripts/audit_agentsam_table_usage.py --no-code-scan
  python3 scripts/audit_agentsam_table_usage.py --sample-limit 3

Output:
  artifacts/agentsam_table_usage_audit/LATEST_AGENTSAM_TABLE_USAGE_AUDIT.md
  artifacts/agentsam_table_usage_audit/LATEST_AGENTSAM_TABLE_USAGE_AUDIT.json
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


DEFAULT_DB = "inneranimalmedia-business"
DEFAULT_CONFIG = "wrangler.production.toml"
OUT_DIR = Path("artifacts/agentsam_table_usage_audit")

IGNORE_DIRS = {
    ".git",
    "node_modules",
    ".wrangler",
    "dist",
    "build",
    ".next",
    "coverage",
    ".cache",
    "artifacts/agentsam_table_usage_audit",
}

TIMESTAMP_CANDIDATES = [
    "updated_at",
    "created_at",
    "started_at",
    "ended_at",
    "completed_at",
    "failed_at",
    "last_seen_at",
    "last_used_at",
    "last_run_at",
    "last_execution_at",
    "last_invoked_at",
    "invoked_at",
    "executed_at",
    "timestamp",
    "ts",
    "date",
    "day",
]

CRITICAL_RUNTIME_TABLES = {
    "agentsam_agent_run",
    "agentsam_tool_call_log",
    "agentsam_routing_arms",
    "agentsam_model_catalog",
    "agentsam_prompt_routes",
    "agentsam_route_requirements",
    "agentsam_prompt_versions",
    "agentsam_workflows",
    "agentsam_workflow_runs",
    "agentsam_execution_steps",
    "agentsam_executions",
    "agentsam_usage_events",
    "agentsam_error_log",
    "agentsam_mcp_tools",
    "agentsam_commands",
    "agentsam_command_run",
}

ROUTING_TABLES = {
    "agentsam_routing_arms",
    "agentsam_route_requirements",
    "agentsam_prompt_routes",
    "agentsam_model_routing_memory",
    "agentsam_model_drift_signals",
    "agentsam_model_catalog",
    "agentsam_model_tier",
    "agentsam_escalation",
    "agentsam_eval_cases",
    "agentsam_eval_runs",
    "agentsam_eval_suites",
    "agentsam_prompt_versions",
    "agentsam_prompt_cache_keys",
}

LEDGER_TABLES = {
    "agentsam_agent_run",
    "agentsam_tool_call_log",
    "agentsam_workflow_runs",
    "agentsam_execution_steps",
    "agentsam_executions",
    "agentsam_command_run",
    "agentsam_script_runs",
    "agentsam_mcp_tool_execution",
}

PROMPT_TABLES = {
    "agentsam_prompt_routes",
    "agentsam_prompt_versions",
    "agentsam_prompt_cache_keys",
    "agentsam_rules_document",
    "agentsam_context_digest",
    "agentsam_project_context",
}

WORKFLOW_TABLES = {
    "agentsam_workflows",
    "agentsam_workflow_nodes",
    "agentsam_workflow_edges",
    "agentsam_workflow_runs",
    "agentsam_execution_steps",
    "agentsam_execution_dependency_graph",
}

CODE_SCAN_EXTENSIONS = {
    ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs",
    ".py", ".sql", ".md", ".json", ".toml", ".yml", ".yaml",
    ".sh", ".bash",
}


def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")


def run(cmd: List[str], *, cwd: Optional[Path] = None, check: bool = True) -> subprocess.CompletedProcess:
    proc = subprocess.run(
        cmd,
        cwd=str(cwd) if cwd else None,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if check and proc.returncode != 0:
        print("\nCOMMAND FAILED:", " ".join(cmd), file=sys.stderr)
        print("\nSTDOUT:\n", proc.stdout, file=sys.stderr)
        print("\nSTDERR:\n", proc.stderr, file=sys.stderr)
        raise SystemExit(proc.returncode)
    return proc


def wrangler_base(args: argparse.Namespace) -> List[str]:
    base: List[str] = []

    wrapper = Path("./scripts/with-cloudflare-env.sh")
    if wrapper.exists():
        base.extend(["./scripts/with-cloudflare-env.sh"])

    base.extend(["npx", "wrangler", "d1", "execute", args.db])

    if args.remote:
        base.append("--remote")

    if args.config:
        base.extend(["-c", args.config])

    base.append("--json")
    return base


def d1_query(args: argparse.Namespace, sql: str) -> List[Dict[str, Any]]:
    cmd = wrangler_base(args) + ["--command", sql]
    proc = run(cmd)

    raw = proc.stdout.strip()
    if not raw:
        return []

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        # Wrangler sometimes emits noise around JSON. Try to grab the first JSON object/array.
        match = re.search(r"(\[.*\]|\{.*\})", raw, re.S)
        if not match:
            print("Could not parse wrangler JSON output.", file=sys.stderr)
            print(raw[:2000], file=sys.stderr)
            return []
        parsed = json.loads(match.group(1))

    # Wrangler D1 --json commonly returns:
    # [{"results":[...],"success":true,...}]
    if isinstance(parsed, list):
        if parsed and isinstance(parsed[0], dict) and "results" in parsed[0]:
            return parsed[0].get("results") or []
        return parsed

    if isinstance(parsed, dict):
        if "results" in parsed:
            return parsed.get("results") or []
        if "result" in parsed and isinstance(parsed["result"], list):
            return parsed["result"]

    return []


def quote_ident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def get_tables(args: argparse.Namespace) -> List[str]:
    rows = d1_query(args, """
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name LIKE 'agentsam_%'
        ORDER BY name;
    """)
    return [r["name"] for r in rows if r.get("name")]


def get_columns(args: argparse.Namespace, table: str) -> List[Dict[str, Any]]:
    return d1_query(args, f"PRAGMA table_info({quote_ident(table)});")


def get_indexes(args: argparse.Namespace, table: str) -> List[Dict[str, Any]]:
    return d1_query(args, f"PRAGMA index_list({quote_ident(table)});")


def get_foreign_keys(args: argparse.Namespace, table: str) -> List[Dict[str, Any]]:
    return d1_query(args, f"PRAGMA foreign_key_list({quote_ident(table)});")


def get_count(args: argparse.Namespace, table: str) -> int:
    rows = d1_query(args, f"SELECT COUNT(*) AS n FROM {quote_ident(table)};")
    if not rows:
        return 0
    return int(rows[0].get("n") or 0)


def detect_timestamp_columns(columns: List[Dict[str, Any]]) -> List[str]:
    names = [str(c.get("name") or "") for c in columns]
    lower_map = {n.lower(): n for n in names}
    found: List[str] = []

    for c in TIMESTAMP_CANDIDATES:
        if c in lower_map:
            found.append(lower_map[c])

    for n in names:
        ln = n.lower()
        if n not in found and (
            ln.endswith("_at")
            or ln.endswith("_date")
            or ln in {"time", "datetime"}
        ):
            found.append(n)

    return found


def get_recent_signal(args: argparse.Namespace, table: str, ts_cols: List[str]) -> Dict[str, Any]:
    if not ts_cols:
        return {"timestamp_column": None, "max_value": None, "recent_score": "NO_TS"}

    # Prefer the first detected meaningful timestamp.
    col = ts_cols[0]
    rows = d1_query(args, f"""
        SELECT MAX({quote_ident(col)}) AS max_value
        FROM {quote_ident(table)};
    """)
    max_value = rows[0].get("max_value") if rows else None

    return {
        "timestamp_column": col,
        "max_value": max_value,
        "recent_score": classify_recency(max_value),
    }


def classify_recency(value: Any) -> str:
    if value is None or value == "":
        return "NO_VALUE"

    s = str(value).strip()

    # Unix seconds.
    if re.fullmatch(r"\d{10}", s):
        try:
            ts = dt.datetime.fromtimestamp(int(s), dt.timezone.utc)
            return age_bucket(ts)
        except Exception:
            return "UNKNOWN_FORMAT"

    # Unix ms.
    if re.fullmatch(r"\d{13}", s):
        try:
            ts = dt.datetime.fromtimestamp(int(s) / 1000, dt.timezone.utc)
            return age_bucket(ts)
        except Exception:
            return "UNKNOWN_FORMAT"

    # ISO-ish.
    normalized = s.replace("Z", "+00:00")
    try:
        parsed = dt.datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=dt.timezone.utc)
        else:
            parsed = parsed.astimezone(dt.timezone.utc)
        return age_bucket(parsed)
    except Exception:
        pass

    # Date only.
    try:
        parsed_date = dt.datetime.strptime(s[:10], "%Y-%m-%d").replace(tzinfo=dt.timezone.utc)
        return age_bucket(parsed_date)
    except Exception:
        return "UNKNOWN_FORMAT"


def age_bucket(ts: dt.datetime) -> str:
    now = dt.datetime.now(dt.timezone.utc)
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=dt.timezone.utc)
    else:
        ts = ts.astimezone(dt.timezone.utc)
    days = (now - ts).days
    if days < 0:
        return "FUTURE"
    if days <= 1:
        return "HOT_24H"
    if days <= 7:
        return "ACTIVE_7D"
    if days <= 30:
        return "ACTIVE_30D"
    if days <= 90:
        return "STALE_90D"
    if days <= 365:
        return "OLD_1Y"
    return "ARCHIVAL"


def sample_rows(args: argparse.Namespace, table: str, limit: int) -> List[Dict[str, Any]]:
    if limit <= 0:
        return []
    try:
        return d1_query(args, f"SELECT * FROM {quote_ident(table)} LIMIT {int(limit)};")
    except Exception:
        return []


def should_scan_file(path: Path) -> bool:
    parts = set(path.parts)
    if parts & IGNORE_DIRS:
        return False
    return path.suffix in CODE_SCAN_EXTENSIONS


def code_scan_repo(tables: List[str]) -> Dict[str, Dict[str, Any]]:
    results: Dict[str, Dict[str, Any]] = {
        t: {
            "ref_count": 0,
            "files": [],
            "examples": [],
        }
        for t in tables
    }

    rg = shutil.which("rg")
    if rg:
        for table in tables:
            proc = run(
                [
                    "rg",
                    "--fixed-strings",
                    "--line-number",
                    "--hidden",
                    "--glob", "!node_modules/**",
                    "--glob", "!.git/**",
                    "--glob", "!dist/**",
                    "--glob", "!build/**",
                    "--glob", "!artifacts/agentsam_table_usage_audit/**",
                    table,
                    ".",
                ],
                check=False,
            )
            lines = [ln for ln in proc.stdout.splitlines() if ln.strip()]
            files = []
            examples = []
            for ln in lines:
                # path:line:content
                parts = ln.split(":", 2)
                if len(parts) >= 3:
                    files.append(parts[0])
                    if len(examples) < 8:
                        examples.append(ln[:500])
            results[table]["ref_count"] = len(lines)
            results[table]["files"] = sorted(set(files))[:50]
            results[table]["examples"] = examples
        return results

    # Fallback Python scan.
    for root, dirs, files in os.walk("."):
        root_path = Path(root)
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]
        for fn in files:
            p = root_path / fn
            if not should_scan_file(p):
                continue
            try:
                text = p.read_text(errors="ignore")
            except Exception:
                continue
            for table in tables:
                if table in text:
                    cnt = text.count(table)
                    results[table]["ref_count"] += cnt
                    results[table]["files"].append(str(p))
                    if len(results[table]["examples"]) < 8:
                        for i, line in enumerate(text.splitlines(), start=1):
                            if table in line:
                                results[table]["examples"].append(f"{p}:{i}:{line[:400]}")
                                break
    for table in tables:
        results[table]["files"] = sorted(set(results[table]["files"]))[:50]
    return results


def group_for_table(table: str) -> str:
    if table in ROUTING_TABLES:
        return "routing/model/prompt"
    if table in LEDGER_TABLES:
        return "execution-ledger"
    if table in PROMPT_TABLES:
        return "prompt/context"
    if table in WORKFLOW_TABLES:
        return "workflow-graph"
    if table.startswith("agentsam_mcp_"):
        return "mcp"
    if table.startswith("agentsam_eval_"):
        return "eval"
    if table.startswith("agentsam_usage_"):
        return "usage/cost"
    if table.startswith("agentsam_tool_") or table == "agentsam_tools":
        return "tools"
    if table.startswith("agentsam_command"):
        return "commands"
    if table.startswith("agentsam_webhook"):
        return "webhooks"
    if table.startswith("agentsam_guardrail"):
        return "guardrails"
    if table.startswith("agentsam_skill"):
        return "skills"
    return "other"


def classify_table(
    table: str,
    row_count: int,
    code_refs: int,
    recency: str,
    columns: List[Dict[str, Any]],
) -> Tuple[str, List[str]]:
    notes: List[str] = []
    col_names = {str(c.get("name") or "").lower() for c in columns}

    has_agent_run_link = "agent_run_id" in col_names or "run_id" in col_names
    has_workspace = "workspace_id" in col_names or "tenant_id" in col_names

    if table in CRITICAL_RUNTIME_TABLES:
        notes.append("critical-runtime-table")

    if table in ROUTING_TABLES:
        notes.append("routing-family")

    if table in LEDGER_TABLES:
        notes.append("ledger-family")

    if has_agent_run_link:
        notes.append("has-run-link")

    if has_workspace:
        notes.append("has-scope-column")

    if row_count == 0 and code_refs == 0:
        return "EMPTY_AND_UNREFERENCED", notes + ["candidate: seeded/design-only or dead table"]

    if row_count == 0 and code_refs > 0:
        return "WIRED_BUT_EMPTY", notes + ["candidate: code path exists but not producing rows"]

    if row_count > 0 and code_refs == 0:
        return "POPULATED_BUT_NO_CODE_REFS", notes + ["candidate: seeded/manual/legacy/or orphaned"]

    if row_count > 0 and code_refs > 0:
        if recency in {"HOT_24H", "ACTIVE_7D", "ACTIVE_30D"}:
            return "ACTIVE_AND_WIRED", notes
        if recency in {"NO_TS", "NO_VALUE", "UNKNOWN_FORMAT"}:
            if row_count <= 20:
                return "WIRED_SEEDED_OR_LOW_SIGNAL", notes + ["low row count or no timestamp signal"]
            return "WIRED_BUT_NO_RECENCY_SIGNAL", notes + ["add/verify timestamp if analytics depend on recency"]
        return "WIRED_BUT_STALE", notes + [f"recency={recency}"]

    return "UNKNOWN", notes


def compact_schema(columns: List[Dict[str, Any]]) -> str:
    bits = []
    for c in columns:
        name = c.get("name")
        typ = c.get("type") or ""
        pk = " PK" if c.get("pk") else ""
        nn = " NOTNULL" if c.get("notnull") else ""
        bits.append(f"{name} {typ}{pk}{nn}".strip())
    return "; ".join(bits)


def markdown_report(payload: Dict[str, Any]) -> str:
    rows = payload["tables"]
    generated_at = payload["generated_at"]

    by_class: Dict[str, List[Dict[str, Any]]] = {}
    by_group: Dict[str, List[Dict[str, Any]]] = {}
    for r in rows:
        by_class.setdefault(r["classification"], []).append(r)
        by_group.setdefault(r["group"], []).append(r)

    lines: List[str] = []
    lines.append("# Agent Sam Table Usage Audit")
    lines.append("")
    lines.append(f"Generated: `{generated_at}`")
    lines.append(f"Database: `{payload['db']}`")
    lines.append(f"Remote: `{payload['remote']}`")
    lines.append("")
    lines.append("## Summary")
    lines.append("")
    lines.append(f"- Total `agentsam_*` tables: **{len(rows)}**")
    lines.append(f"- Total rows across audited tables: **{sum(r['row_count'] for r in rows):,}**")
    lines.append("")

    lines.append("### Classification counts")
    lines.append("")
    lines.append("| Classification | Tables |")
    lines.append("|---|---:|")
    for k in sorted(by_class):
        lines.append(f"| `{k}` | {len(by_class[k])} |")
    lines.append("")

    lines.append("### Group counts")
    lines.append("")
    lines.append("| Group | Tables | Rows |")
    lines.append("|---|---:|---:|")
    for k in sorted(by_group):
        rs = by_group[k]
        lines.append(f"| `{k}` | {len(rs)} | {sum(r['row_count'] for r in rs):,} |")
    lines.append("")

    lines.append("## Highest-signal action buckets")
    lines.append("")
    lines.append("### 1. Wired but empty")
    lines.append("")
    lines.append("These are probably intended runtime tables where code references exist but rows are not landing.")
    lines.append("")
    lines.append("| Table | Group | Code refs | Notes |")
    lines.append("|---|---|---:|---|")
    for r in sorted(by_class.get("WIRED_BUT_EMPTY", []), key=lambda x: (-x["code_refs"], x["name"])):
        lines.append(f"| `{r['name']}` | {r['group']} | {r['code_refs']} | {', '.join(r['notes'][:4])} |")
    lines.append("")

    lines.append("### 2. Populated but no code refs")
    lines.append("")
    lines.append("These may be seeded/manual/legacy/orphaned. They deserve inspection before relying on them.")
    lines.append("")
    lines.append("| Table | Rows | Timestamp | Max timestamp | Notes |")
    lines.append("|---|---:|---|---|---|")
    for r in sorted(by_class.get("POPULATED_BUT_NO_CODE_REFS", []), key=lambda x: (-x["row_count"], x["name"])):
        lines.append(
            f"| `{r['name']}` | {r['row_count']:,} | `{r['timestamp_column'] or '-'}` | `{r['max_timestamp'] or '-'}` | {', '.join(r['notes'][:4])} |"
        )
    lines.append("")

    lines.append("### 3. Active and wired")
    lines.append("")
    lines.append("These are probably real spine tables today.")
    lines.append("")
    lines.append("| Table | Group | Rows | Recent | Code refs |")
    lines.append("|---|---|---:|---|---:|")
    for r in sorted(by_class.get("ACTIVE_AND_WIRED", []), key=lambda x: (-x["row_count"], x["name"])):
        lines.append(f"| `{r['name']}` | {r['group']} | {r['row_count']:,} | `{r['recency']}` | {r['code_refs']} |")
    lines.append("")

    lines.append("### 4. Empty and unreferenced")
    lines.append("")
    lines.append("These are possible future/design tables or dead leftovers. Do not delete blindly.")
    lines.append("")
    lines.append("| Table | Group | Notes |")
    lines.append("|---|---|---|")
    for r in sorted(by_class.get("EMPTY_AND_UNREFERENCED", []), key=lambda x: (x["group"], x["name"])):
        lines.append(f"| `{r['name']}` | {r['group']} | {', '.join(r['notes'][:4])} |")
    lines.append("")

    lines.append("## Full table inventory")
    lines.append("")
    lines.append("| Table | Group | Class | Rows | TS col | Max TS | Recent | Code refs | Cols | Indexes | FKs |")
    lines.append("|---|---|---|---:|---|---|---|---:|---:|---:|---:|")
    for r in sorted(rows, key=lambda x: x["name"]):
        lines.append(
            f"| `{r['name']}` | {r['group']} | `{r['classification']}` | {r['row_count']:,} | "
            f"`{r['timestamp_column'] or '-'}` | `{r['max_timestamp'] or '-'}` | `{r['recency']}` | "
            f"{r['code_refs']} | {r['column_count']} | {r['index_count']} | {r['foreign_key_count']} |"
        )
    lines.append("")

    lines.append("## Routing-family detail")
    lines.append("")
    lines.append("| Table | Class | Rows | Code refs | Schema compact |")
    lines.append("|---|---|---:|---:|---|")
    for r in sorted([x for x in rows if x["name"] in ROUTING_TABLES], key=lambda x: x["name"]):
        lines.append(
            f"| `{r['name']}` | `{r['classification']}` | {r['row_count']:,} | {r['code_refs']} | {r['schema_compact'][:700]} |"
        )
    lines.append("")

    lines.append("## Ledger-family detail")
    lines.append("")
    lines.append("| Table | Class | Rows | Code refs | Schema compact |")
    lines.append("|---|---|---:|---:|---|")
    for r in sorted([x for x in rows if x["name"] in LEDGER_TABLES], key=lambda x: x["name"]):
        lines.append(
            f"| `{r['name']}` | `{r['classification']}` | {r['row_count']:,} | {r['code_refs']} | {r['schema_compact'][:700]} |"
        )
    lines.append("")

    lines.append("## Code reference examples")
    lines.append("")
    for r in sorted(rows, key=lambda x: (-x["code_refs"], x["name"])):
        if not r["code_examples"]:
            continue
        lines.append(f"### `{r['name']}`")
        lines.append("")
        for ex in r["code_examples"][:8]:
            safe = ex.replace("|", "\\|")
            lines.append(f"- `{safe}`")
        lines.append("")

    lines.append("## Suggested next investigation order")
    lines.append("")
    lines.append("1. Fix `WIRED_BUT_EMPTY` tables that should be receiving runtime rows.")
    lines.append("2. Inspect `POPULATED_BUT_NO_CODE_REFS` for seeded-only or orphaned schema.")
    lines.append("3. For routing: verify `agentsam_prompt_routes → agentsam_route_requirements → agentsam_routing_arms → agentsam_model_catalog` joins with live seed data.")
    lines.append("4. For chat/tool ledger: verify `agentsam_agent_run.id → agentsam_tool_call_log.agent_run_id` is the canonical spine and identify any remaining fake `workflow_runs` detours.")
    lines.append("5. For prompt caching: decide whether `agentsam_prompt_cache_keys` becomes a real read-through compiled prompt cache or stays analytics-only.")
    lines.append("")

    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", default=DEFAULT_DB)
    parser.add_argument("--config", default=DEFAULT_CONFIG)
    parser.add_argument("--remote", action="store_true", default=True)
    parser.add_argument("--local", dest="remote", action="store_false")
    parser.add_argument("--no-code-scan", action="store_true")
    parser.add_argument("--sample-limit", type=int, default=2)
    args = parser.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    print("[audit] listing agentsam_* tables...")
    tables = get_tables(args)
    if not tables:
        raise SystemExit("No agentsam_* tables found.")

    print(f"[audit] found {len(tables)} tables")

    code_refs = {}
    if args.no_code_scan:
        code_refs = {t: {"ref_count": 0, "files": [], "examples": []} for t in tables}
    else:
        print("[audit] scanning repo code references...")
        code_refs = code_scan_repo(tables)

    audited: List[Dict[str, Any]] = []

    for i, table in enumerate(tables, start=1):
        print(f"[audit] {i:03d}/{len(tables)} {table}")
        columns = get_columns(args, table)
        indexes = get_indexes(args, table)
        fks = get_foreign_keys(args, table)
        count = get_count(args, table)
        ts_cols = detect_timestamp_columns(columns)
        recent = get_recent_signal(args, table, ts_cols)
        samples = sample_rows(args, table, args.sample_limit)

        refs = code_refs.get(table, {"ref_count": 0, "files": [], "examples": []})
        classification, notes = classify_table(
            table,
            count,
            int(refs.get("ref_count") or 0),
            recent.get("recent_score") or "NO_TS",
            columns,
        )

        audited.append({
            "name": table,
            "group": group_for_table(table),
            "classification": classification,
            "notes": notes,
            "row_count": count,
            "column_count": len(columns),
            "index_count": len(indexes),
            "foreign_key_count": len(fks),
            "timestamp_columns": ts_cols,
            "timestamp_column": recent.get("timestamp_column"),
            "max_timestamp": recent.get("max_value"),
            "recency": recent.get("recent_score"),
            "code_refs": int(refs.get("ref_count") or 0),
            "code_files": refs.get("files") or [],
            "code_examples": refs.get("examples") or [],
            "columns": columns,
            "indexes": indexes,
            "foreign_keys": fks,
            "schema_compact": compact_schema(columns),
            "sample_rows": samples,
        })

    payload = {
        "generated_at": now_iso(),
        "db": args.db,
        "remote": args.remote,
        "table_count": len(audited),
        "tables": audited,
    }

    json_path = OUT_DIR / "LATEST_AGENTSAM_TABLE_USAGE_AUDIT.json"
    md_path = OUT_DIR / "LATEST_AGENTSAM_TABLE_USAGE_AUDIT.md"

    json_path.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
    md_path.write_text(markdown_report(payload), encoding="utf-8")

    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    (OUT_DIR / f"agentsam_table_usage_audit_{stamp}.json").write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
    (OUT_DIR / f"agentsam_table_usage_audit_{stamp}.md").write_text(markdown_report(payload), encoding="utf-8")

    print("")
    print("DONE")
    print(f"markdown: {md_path}")
    print(f"json    : {json_path}")


if __name__ == "__main__":
    main()
