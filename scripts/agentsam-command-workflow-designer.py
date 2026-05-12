#!/usr/bin/env python3
"""
Agent Sam Commands + Workflows End-to-End Designer

Purpose:
- Inspect the real D1 schemas for Agent Sam command/workflow/run tables.
- Map how agentsam_commands, agentsam_command_pattern, agentsam_slash_commands,
  agentsam_command_runs, agentsam_workflows, agentsam_mcp_workflows,
  agentsam_workflow_runs, agentsam_tool_chain, agentsam_usage_events, and
  agentsam_analytics should connect end-to-end.
- Find route gaps, missing workflow links, stale command rows, weak run telemetry,
  and places where commands are not safely classified.
- Generate reviewable artifacts:
    artifacts/agentsam-command-workflow-design-report.json
    artifacts/agentsam-command-workflow-design.md
    artifacts/agentsam-command-workflow-proposed.sql

This script is safe by default:
- It does NOT mutate D1 unless you pass --apply-sql.
- The generated SQL is conservative and schema-aware.
- It will only generate INSERT/UPDATE statements for columns that actually exist.
- It avoids new columns.

Run from repo root:
  python3 scripts/agentsam-command-workflow-designer.py

Optional:
  python3 scripts/agentsam-command-workflow-designer.py --apply-sql

Useful env vars:
  IAM_D1_DB=inneranimalmedia-business
  IAM_WRANGLER_CONFIG=wrangler.production.toml
  IAM_D1_REMOTE=1
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


REPO_ROOT = Path.cwd()
ARTIFACTS_DIR = REPO_ROOT / "artifacts"
REPORT_JSON = ARTIFACTS_DIR / "agentsam-command-workflow-design-report.json"
REPORT_MD = ARTIFACTS_DIR / "agentsam-command-workflow-design.md"
PROPOSED_SQL = ARTIFACTS_DIR / "agentsam-command-workflow-proposed.sql"

D1_DB = os.getenv("IAM_D1_DB", "inneranimalmedia-business")
WRANGLER_CONFIG = os.getenv("IAM_WRANGLER_CONFIG", "wrangler.production.toml")
D1_REMOTE = os.getenv("IAM_D1_REMOTE", "1") not in ("0", "false", "False", "no")

CORE_TABLES = [
    "agentsam_commands",
    "agentsam_command_pattern",
    "agentsam_slash_commands",
    "agentsam_command_runs",
    "agentsam_workflows",
    "agentsam_mcp_workflows",
    "agentsam_workflow_runs",
    "agentsam_tool_chain",
    "agentsam_usage_events",
    "agentsam_analytics",
    "agentsam_plans",
    "agentsam_plan_tasks",
    "agentsam_model_catalog",
    "agentsam_prompt_routes",
    "agentsam_route_requirements",
    "agentsam_routing_arms",
    "agentsam_mcp_tools",
]

# Candidate command taxonomy. Script will only generate rows where the real schema supports it.
CANONICAL_COMMANDS = [
    {
        "slug": "agent-chat-plan",
        "key": "agent_chat_plan",
        "name": "Agent Chat Plan",
        "title": "Agent Chat Plan",
        "description": "Classify a user goal, create a plan, persist tasks, and stream task board progress.",
        "category": "agent",
        "intent": "plan",
        "route_key": "agent_chat_plan",
        "workflow_key": "agent_chat_plan",
        "mode": "agent",
        "safe_to_run": 1,
        "owner_only": 0,
        "is_active": 1,
        "patterns": [
            "build *",
            "create *",
            "fix *",
            "refactor *",
            "audit *",
            "analyze *",
            "implement *",
        ],
    },
    {
        "slug": "workflow-run",
        "key": "workflow_run",
        "name": "Run Workflow",
        "title": "Run Workflow",
        "description": "Resolve an existing workflow_key and execute it through executeWorkflowGraph.",
        "category": "workflow",
        "intent": "workflow",
        "route_key": "workflow_run",
        "workflow_key": None,
        "mode": "agent",
        "safe_to_run": 1,
        "owner_only": 0,
        "is_active": 1,
        "patterns": [
            "run *",
            "execute *",
            "start workflow *",
            "trigger workflow *",
        ],
    },
    {
        "slug": "terminal-propose",
        "key": "terminal_propose",
        "name": "Propose Terminal Command",
        "title": "Propose Terminal Command",
        "description": "Create a terminal task proposal that requires approval before command execution.",
        "category": "terminal",
        "intent": "terminal",
        "route_key": "terminal_propose",
        "workflow_key": None,
        "mode": "agent",
        "safe_to_run": 0,
        "owner_only": 1,
        "is_active": 1,
        "patterns": [
            "deploy *",
            "run npm *",
            "run wrangler *",
            "execute command *",
            "delete *",
            "remove *",
        ],
    },
    {
        "slug": "db-query-propose",
        "key": "db_query_propose",
        "name": "Propose D1 Query",
        "title": "Propose D1 Query",
        "description": "Generate or inspect D1 SQL safely; writes require approval.",
        "category": "db",
        "intent": "db_query",
        "route_key": "db_query_propose",
        "workflow_key": None,
        "mode": "agent",
        "safe_to_run": 0,
        "owner_only": 1,
        "is_active": 1,
        "patterns": [
            "show * table *",
            "query *",
            "write migration *",
            "inspect schema *",
            "select *",
            "update *",
            "insert *",
            "delete from *",
        ],
    },
    {
        "slug": "model-routing-audit",
        "key": "model_routing_audit",
        "name": "Model Routing Audit",
        "title": "Model Routing Audit",
        "description": "Audit model catalog, prompt routes, routing arms, and provider adapter health.",
        "category": "audit",
        "intent": "audit",
        "route_key": "model_routing_audit",
        "workflow_key": "model_routing_audit",
        "mode": "agent",
        "safe_to_run": 1,
        "owner_only": 0,
        "is_active": 1,
        "patterns": [
            "audit model routing",
            "audit agentsam_model_catalog *",
            "check model catalog *",
            "verify nano mini routing",
        ],
    },
    {
        "slug": "workflow-failures",
        "key": "workflow_failures",
        "name": "Show Workflow Failures",
        "title": "Show Workflow Failures",
        "description": "Inspect recent failed workflow runs and summarize likely causes.",
        "category": "workflow",
        "intent": "workflow_report",
        "route_key": "workflow_failures",
        "workflow_key": "workflow_failures",
        "mode": "agent",
        "safe_to_run": 1,
        "owner_only": 0,
        "is_active": 1,
        "patterns": [
            "show latest workflow failures",
            "latest workflow failures",
            "recent failed workflows",
            "what workflows failed",
        ],
    },
    {
        "slug": "deploy-check",
        "key": "deploy_check",
        "name": "Deploy Check",
        "title": "Deploy Check",
        "description": "Inspect deployment readiness and propose safe deploy steps without auto-deploying.",
        "category": "infra",
        "intent": "deploy_check",
        "route_key": "deploy_check",
        "workflow_key": "deploy_check",
        "mode": "agent",
        "safe_to_run": 1,
        "owner_only": 1,
        "is_active": 1,
        "patterns": [
            "check deploy",
            "deploy check",
            "is deploy ready",
            "fix deploy process",
        ],
    },
]

ROUTE_EXPECTATIONS = [
    {
        "route_key": "agent_chat_plan",
        "task_type": "planning",
        "model_key": "gpt-5.4-mini",
        "description": "Planner should use mini for decomposition and implementation reasoning.",
    },
    {
        "route_key": "agent_chat_classify",
        "task_type": "classification",
        "model_key": "gpt-5.4-nano",
        "description": "Classifier should use nano for cheap routing decisions.",
    },
    {
        "route_key": "workflow_run",
        "task_type": "workflow",
        "model_key": "gpt-5.4-nano",
        "description": "Workflow dispatch should avoid expensive planning unless needed.",
    },
    {
        "route_key": "terminal_propose",
        "task_type": "terminal",
        "model_key": "gpt-5.4-mini",
        "description": "Terminal proposals require careful reasoning and approval.",
    },
    {
        "route_key": "db_query_propose",
        "task_type": "sql_d1_generation",
        "model_key": "gpt-5.4-mini",
        "description": "D1 SQL generation should use mini and never auto-run destructive writes.",
    },
]


# ---------------------------------------------------------------------------
# Shell / D1 helpers
# ---------------------------------------------------------------------------

def run_cmd(cmd: List[str], timeout: int = 60) -> Dict[str, Any]:
    start = time.time()
    try:
        proc = subprocess.run(cmd, cwd=str(REPO_ROOT), text=True, capture_output=True, timeout=timeout)
        return {
            "ok": proc.returncode == 0,
            "returncode": proc.returncode,
            "stdout": proc.stdout,
            "stderr": proc.stderr,
            "duration_ms": round((time.time() - start) * 1000),
            "cmd": cmd,
        }
    except subprocess.TimeoutExpired as e:
        return {
            "ok": False,
            "returncode": None,
            "stdout": e.stdout or "",
            "stderr": e.stderr or f"timeout after {timeout}s",
            "duration_ms": round((time.time() - start) * 1000),
            "cmd": cmd,
        }
    except Exception as e:
        return {
            "ok": False,
            "returncode": None,
            "stdout": "",
            "stderr": str(e),
            "duration_ms": round((time.time() - start) * 1000),
            "cmd": cmd,
        }


def wrangler_available() -> bool:
    return shutil.which("npx") is not None and (REPO_ROOT / WRANGLER_CONFIG).exists()


def d1_sql(sql: str, timeout: int = 60) -> Dict[str, Any]:
    cmd = ["npx", "wrangler", "d1", "execute", D1_DB]
    if D1_REMOTE:
        cmd.append("--remote")
    cmd.extend(["-c", WRANGLER_CONFIG, "--json", "--command", sql])
    return run_cmd(cmd, timeout=timeout)


def d1_file(path: Path, timeout: int = 120) -> Dict[str, Any]:
    cmd = ["npx", "wrangler", "d1", "execute", D1_DB]
    if D1_REMOTE:
        cmd.append("--remote")
    cmd.extend(["-c", WRANGLER_CONFIG, "--file", str(path)])
    return run_cmd(cmd, timeout=timeout)


def parse_jsonish(stdout: str) -> Any:
    text = stdout.strip()
    if not text:
        return None
    try:
        return json.loads(text)
    except Exception:
        pass
    first = min([i for i in [text.find("["), text.find("{")] if i >= 0], default=-1)
    if first >= 0:
        try:
            return json.loads(text[first:])
        except Exception:
            return None
    return None


def result_rows(result: Dict[str, Any]) -> List[Dict[str, Any]]:
    parsed = parse_jsonish(result.get("stdout", ""))
    if isinstance(parsed, list) and parsed:
        first = parsed[0]
        if isinstance(first, dict):
            return first.get("results") or first.get("result") or []
    if isinstance(parsed, dict):
        return parsed.get("results") or parsed.get("result") or []
    return []


def quote_sql(value: Any) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, int) or isinstance(value, float):
        return str(value)
    s = str(value)
    return "'" + s.replace("'", "''") + "'"


# ---------------------------------------------------------------------------
# Schema inspection
# ---------------------------------------------------------------------------

def inspect_schema(table: str) -> Dict[str, Any]:
    res = d1_sql(f"PRAGMA table_info({table});")
    rows = result_rows(res)
    return {
        "table": table,
        "exists": bool(rows),
        "columns": rows,
        "column_names": [r.get("name") for r in rows],
        "pk": [r.get("name") for r in rows if r.get("pk")],
        "notnull": [r.get("name") for r in rows if r.get("notnull")],
        "raw_ok": res.get("ok"),
        "stderr": res.get("stderr", "")[-1000:],
    }


def table_count(table: str) -> Dict[str, Any]:
    res = d1_sql(f"SELECT COUNT(*) AS count FROM {table};")
    rows = result_rows(res)
    return {"ok": res.get("ok"), "count": rows[0].get("count") if rows else None, "stderr": res.get("stderr", "")[-500:]}


def sample_table(table: str, columns: List[str], limit: int = 20) -> Dict[str, Any]:
    if not columns:
        return {"ok": False, "rows": [], "error": "no columns"}
    wanted = [c for c in [
        "id", "slug", "command_key", "key", "name", "title", "workflow_key",
        "route_key", "status", "is_active", "safe_to_run", "owner_only",
        "created_at", "updated_at"
    ] if c in columns]
    if not wanted:
        wanted = columns[:8]
    sql = f"SELECT {', '.join(wanted)} FROM {table} LIMIT {limit};"
    res = d1_sql(sql)
    return {"ok": res.get("ok"), "columns": wanted, "rows": result_rows(res), "stderr": res.get("stderr", "")[-500:]}


def inspect_all() -> Dict[str, Any]:
    schemas: Dict[str, Any] = {}
    counts: Dict[str, Any] = {}
    samples: Dict[str, Any] = {}
    for table in CORE_TABLES:
        schemas[table] = inspect_schema(table)
        if schemas[table]["exists"]:
            counts[table] = table_count(table)
            samples[table] = sample_table(table, schemas[table]["column_names"])
        else:
            counts[table] = {"ok": False, "count": None}
            samples[table] = {"ok": False, "rows": []}
    return {"schemas": schemas, "counts": counts, "samples": samples}


# ---------------------------------------------------------------------------
# Relationship queries
# ---------------------------------------------------------------------------

def has_cols(schema: Dict[str, Any], table: str, *cols: str) -> bool:
    names = set(schema["schemas"].get(table, {}).get("column_names", []))
    return all(c in names for c in cols)


def existing_values(schema_report: Dict[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}

    # Commands by likely key/name columns.
    if schema_report["schemas"].get("agentsam_commands", {}).get("exists"):
        cols = schema_report["schemas"]["agentsam_commands"]["column_names"]
        select_cols = [c for c in ["id", "slug", "command_key", "key", "name", "title", "route_key", "workflow_key", "is_active", "safe_to_run", "owner_only"] if c in cols]
        if select_cols:
            res = d1_sql(f"SELECT {', '.join(select_cols)} FROM agentsam_commands LIMIT 500;")
            out["agentsam_commands"] = result_rows(res)

    if schema_report["schemas"].get("agentsam_workflows", {}).get("exists"):
        cols = schema_report["schemas"]["agentsam_workflows"]["column_names"]
        select_cols = [c for c in ["id", "workflow_key", "key", "slug", "name", "title", "status", "is_active", "safe_to_run", "owner_only"] if c in cols]
        if select_cols:
            res = d1_sql(f"SELECT {', '.join(select_cols)} FROM agentsam_workflows LIMIT 500;")
            out["agentsam_workflows"] = result_rows(res)

    if schema_report["schemas"].get("agentsam_mcp_workflows", {}).get("exists"):
        cols = schema_report["schemas"]["agentsam_mcp_workflows"]["column_names"]
        select_cols = [c for c in ["id", "workflow_key", "key", "slug", "name", "title", "status", "is_active", "safe_to_run", "owner_only"] if c in cols]
        if select_cols:
            res = d1_sql(f"SELECT {', '.join(select_cols)} FROM agentsam_mcp_workflows LIMIT 500;")
            out["agentsam_mcp_workflows"] = result_rows(res)

    if schema_report["schemas"].get("agentsam_slash_commands", {}).get("exists"):
        cols = schema_report["schemas"]["agentsam_slash_commands"]["column_names"]
        select_cols = [c for c in ["id", "slug", "command", "slash_command", "command_key", "name", "title", "route_key", "workflow_key", "is_active"] if c in cols]
        if select_cols:
            res = d1_sql(f"SELECT {', '.join(select_cols)} FROM agentsam_slash_commands LIMIT 500;")
            out["agentsam_slash_commands"] = result_rows(res)

    if schema_report["schemas"].get("agentsam_command_pattern", {}).get("exists"):
        cols = schema_report["schemas"]["agentsam_command_pattern"]["column_names"]
        select_cols = [c for c in ["id", "command_key", "pattern", "intent", "route_key", "workflow_key", "is_active"] if c in cols]
        if select_cols:
            res = d1_sql(f"SELECT {', '.join(select_cols)} FROM agentsam_command_pattern LIMIT 500;")
            out["agentsam_command_pattern"] = result_rows(res)

    if schema_report["schemas"].get("agentsam_model_catalog", {}).get("exists"):
        cols = schema_report["schemas"]["agentsam_model_catalog"]["column_names"]
        select_cols = [c for c in ["id", "model_key", "provider", "api_platform", "openai_model_id", "is_active"] if c in cols]
        res = d1_sql(f"SELECT {', '.join(select_cols)} FROM agentsam_model_catalog WHERE model_key IN ('gpt-5.4-mini','gpt-5.4-nano','local_coder') LIMIT 50;")
        out["agentsam_model_catalog_focus"] = result_rows(res)

    return out


def find_recent_run_health(schema_report: Dict[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for table in ["agentsam_command_runs", "agentsam_workflow_runs", "agentsam_tool_chain", "agentsam_usage_events", "agentsam_analytics"]:
        if not schema_report["schemas"].get(table, {}).get("exists"):
            out[table] = {"exists": False}
            continue
        cols = schema_report["schemas"][table]["column_names"]
        status_col = "status" if "status" in cols else None
        created_col = "created_at" if "created_at" in cols else ("started_at" if "started_at" in cols else None)
        select_cols = [c for c in ["id", "command_key", "workflow_key", "workflow_id", "status", "provider", "model_key", "tool_key", "error", "error_message", "created_at", "started_at", "completed_at"] if c in cols]
        if not select_cols:
            out[table] = {"exists": True, "rows": []}
            continue
        order = f" ORDER BY {created_col} DESC" if created_col else ""
        res = d1_sql(f"SELECT {', '.join(select_cols)} FROM {table}{order} LIMIT 25;")
        rows = result_rows(res)
        summary: Dict[str, int] = {}
        if status_col:
            for row in rows:
                s = str(row.get(status_col) or "unknown")
                summary[s] = summary.get(s, 0) + 1
        out[table] = {"exists": True, "rows": rows, "status_summary_recent": summary}
    return out


# ---------------------------------------------------------------------------
# SQL generation
# ---------------------------------------------------------------------------

def row_identity_value(row: Dict[str, Any], cols: List[str]) -> Optional[str]:
    for c in ["slug", "command_key", "key", "name", "title", "workflow_key", "route_key"]:
        if c in cols and row.get(c):
            return str(row[c])
    return None


def existing_key_set(rows: List[Dict[str, Any]]) -> set:
    keys = set()
    for r in rows:
        for c in ["slug", "command_key", "key", "name", "title", "workflow_key", "route_key"]:
            if r.get(c):
                keys.add(str(r[c]))
    return keys


def choose_value_for_col(col: str, spec: Dict[str, Any], *, table: str, pattern: Optional[str] = None) -> Any:
    now_expr_cols = {"created_at", "updated_at"}
    if col == "id":
        prefix = "cmd"
        if table == "agentsam_command_pattern":
            prefix = "pat"
        elif table == "agentsam_slash_commands":
            prefix = "slash"
        elif "workflow" in table:
            prefix = "wf"
        base = spec.get("slug") or spec.get("key") or spec.get("workflow_key") or "row"
        return f"{prefix}_{str(base).replace('-', '_')}"
    if col in ("slug",):
        return spec.get("slug")
    if col in ("command_key", "key"):
        return spec.get("key") or spec.get("command_key") or spec.get("slug")
    if col in ("name", "title"):
        return spec.get(col) or spec.get("title") or spec.get("name") or spec.get("slug")
    if col in ("description", "summary"):
        return spec.get("description")
    if col in ("category", "intent", "mode", "route_key", "workflow_key"):
        return spec.get(col)
    if col in ("handler_key",):
        return spec.get("workflow_key") or spec.get("route_key") or spec.get("key")
    if col in ("handler_type",):
        intent = spec.get("intent")
        if intent == "workflow":
            return "workflow"
        if intent == "terminal":
            return "terminal"
        if intent == "db_query":
            return "db_query"
        return "agent"
    if col in ("pattern", "match_pattern"):
        return pattern
    if col in ("command", "slash_command"):
        return "/" + str(spec.get("slug") or spec.get("key")).replace("_", "-")
    if col in ("is_active", "active", "enabled"):
        return int(spec.get("is_active", 1))
    if col in ("safe_to_run",):
        return int(spec.get("safe_to_run", 0))
    if col in ("owner_only",):
        return int(spec.get("owner_only", 1))
    if col in ("status",):
        return "active"
    if col in ("priority",):
        return 50
    if col in ("created_at", "updated_at"):
        return "__UNIXEPOCH__"
    if col in ("metadata_json", "config_json", "input_schema", "input_schema_json", "handler_config", "tags", "examples_json"):
        return json.dumps({"source": "agentsam-command-workflow-designer", "spec_key": spec.get("key")})
    if col in ("model_key", "default_model", "preferred_model"):
        if spec.get("intent") in ("plan", "db_query", "terminal", "deploy_check", "audit"):
            return "gpt-5.4-mini"
        return "gpt-5.4-nano"
    return None


def insert_sql_for_table(
    table: str,
    cols: List[str],
    notnull: List[str],
    spec: Dict[str, Any],
    *,
    pattern: Optional[str] = None,
) -> Optional[str]:
    insert_cols = []
    values = []

    # Prefer a stable set, then add required notnulls if possible.
    preferred_by_table = {
        "agentsam_commands": [
            "id", "slug", "command_key", "key", "name", "title", "description",
            "category", "intent", "route_key", "workflow_key", "mode",
            "safe_to_run", "owner_only", "is_active", "status",
            "handler_type", "handler_key", "model_key", "metadata_json",
            "created_at", "updated_at",
        ],
        "agentsam_command_pattern": [
            "id", "command_key", "pattern", "match_pattern", "intent", "route_key",
            "workflow_key", "is_active", "priority", "created_at", "updated_at",
        ],
        "agentsam_slash_commands": [
            "id", "slug", "command", "slash_command", "command_key", "name", "title",
            "description", "route_key", "workflow_key", "is_active", "safe_to_run",
            "owner_only", "created_at", "updated_at",
        ],
        "agentsam_prompt_routes": [
            "id", "route_key", "name", "title", "description", "task_type",
            "model_key", "is_active", "priority", "created_at", "updated_at",
        ],
        "agentsam_route_requirements": [
            "id", "route_key", "task_type", "model_key", "required_capability",
            "is_active", "priority", "created_at", "updated_at",
        ],
    }

    preferred = preferred_by_table.get(table, ["id"] + notnull + ["created_at", "updated_at"])

    for col in preferred:
        if col not in cols:
            continue
        value = choose_value_for_col(col, spec, table=table, pattern=pattern)
        if value is None and col in notnull and col != "id":
            # Best-effort fallback for not-null unknowns.
            value = ""
        if value is None:
            continue
        insert_cols.append(col)
        values.append(value)

    # Ensure every required non-null column is represented if possible.
    for col in notnull:
        if col in insert_cols:
            continue
        if col not in cols:
            continue
        value = choose_value_for_col(col, spec, table=table, pattern=pattern)
        if value is None:
            value = ""
        insert_cols.append(col)
        values.append(value)

    if len(insert_cols) <= 1:
        return None

    value_sql = []
    for v in values:
        if v == "__UNIXEPOCH__":
            value_sql.append("unixepoch()")
        else:
            value_sql.append(quote_sql(v))

    return f"INSERT OR IGNORE INTO {table} ({', '.join(insert_cols)}) VALUES ({', '.join(value_sql)});"


def update_sql_for_command_links(table: str, cols: List[str], spec: Dict[str, Any]) -> Optional[str]:
    # Generate safe link updates only where columns exist.
    key_col = None
    for c in ["slug", "command_key", "key"]:
        if c in cols:
            key_col = c
            break
    if not key_col:
        return None

    sets = []
    for c in ["route_key", "workflow_key", "safe_to_run", "owner_only", "is_active"]:
        if c in cols and spec.get(c) is not None:
            sets.append(f"{c}={quote_sql(spec.get(c))}")
    if not sets:
        return None

    key_val = spec.get("slug") if key_col == "slug" else spec.get("key")
    if not key_val:
        return None
    return f"UPDATE {table} SET {', '.join(sets)} WHERE {key_col}={quote_sql(key_val)};"


def generate_sql(schema_report: Dict[str, Any], values: Dict[str, Any]) -> str:
    schemas = schema_report["schemas"]
    lines = [
        "-- Agent Sam command/workflow design proposal",
        "-- Generated by scripts/agentsam-command-workflow-designer.py",
        "-- Safe by default: review before applying.",
        "-- No new columns. INSERT/UPDATE only uses columns detected by PRAGMA table_info.",
        "",
        "BEGIN TRANSACTION;",
        "",
    ]

    existing_commands = existing_key_set(values.get("agentsam_commands", []))
    existing_patterns = set()
    for r in values.get("agentsam_command_pattern", []):
        if r.get("pattern"):
            existing_patterns.add(str(r["pattern"]))
        if r.get("match_pattern"):
            existing_patterns.add(str(r["match_pattern"]))

    existing_slash = existing_key_set(values.get("agentsam_slash_commands", []))

    # Commands
    if schemas.get("agentsam_commands", {}).get("exists"):
        cols = schemas["agentsam_commands"]["column_names"]
        notnull = schemas["agentsam_commands"]["notnull"]
        lines.append("-- Canonical command rows")
        for spec in CANONICAL_COMMANDS:
            if spec["slug"] in existing_commands or spec["key"] in existing_commands:
                upd = update_sql_for_command_links("agentsam_commands", cols, spec)
                if upd:
                    lines.append(upd)
                continue
            sql = insert_sql_for_table("agentsam_commands", cols, notnull, spec)
            if sql:
                lines.append(sql)
        lines.append("")

    # Patterns
    if schemas.get("agentsam_command_pattern", {}).get("exists"):
        cols = schemas["agentsam_command_pattern"]["column_names"]
        notnull = schemas["agentsam_command_pattern"]["notnull"]
        lines.append("-- Command patterns")
        for spec in CANONICAL_COMMANDS:
            for pat in spec.get("patterns", []):
                if pat in existing_patterns:
                    continue
                sql = insert_sql_for_table("agentsam_command_pattern", cols, notnull, spec, pattern=pat)
                if sql:
                    lines.append(sql)
        lines.append("")

    # Slash commands
    if schemas.get("agentsam_slash_commands", {}).get("exists"):
        cols = schemas["agentsam_slash_commands"]["column_names"]
        notnull = schemas["agentsam_slash_commands"]["notnull"]
        lines.append("-- Slash commands")
        for spec in CANONICAL_COMMANDS:
            slash_key = "/" + spec["slug"].replace("_", "-")
            if spec["slug"] in existing_slash or spec["key"] in existing_slash or slash_key in existing_slash:
                continue
            sql = insert_sql_for_table("agentsam_slash_commands", cols, notnull, spec)
            if sql:
                lines.append(sql)
        lines.append("")

    # Prompt routes
    if schemas.get("agentsam_prompt_routes", {}).get("exists"):
        cols = schemas["agentsam_prompt_routes"]["column_names"]
        notnull = schemas["agentsam_prompt_routes"]["notnull"]
        lines.append("-- Prompt/model routes")
        existing_routes = existing_key_set(values.get("agentsam_prompt_routes", []))
        for route in ROUTE_EXPECTATIONS:
            spec = {
                "slug": route["route_key"],
                "key": route["route_key"],
                "name": route["route_key"].replace("_", " ").title(),
                "title": route["route_key"].replace("_", " ").title(),
                "description": route["description"],
                "route_key": route["route_key"],
                "task_type": route["task_type"],
                "model_key": route["model_key"],
                "is_active": 1,
                "priority": 50,
            }
            if route["route_key"] in existing_routes:
                continue
            sql = insert_sql_for_table("agentsam_prompt_routes", cols, notnull, spec)
            if sql:
                # Patch task_type if the generic function skipped it.
                if "task_type" in cols and "task_type" not in sql:
                    pass
                lines.append(sql)
        lines.append("")

    lines.extend([
        "COMMIT;",
        "",
    ])
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Repo static mapping
# ---------------------------------------------------------------------------

def read_text(path: Path) -> str:
    try:
        return path.read_text(errors="ignore")
    except Exception:
        return ""


def iter_src_files() -> List[Path]:
    roots = [REPO_ROOT / "src", REPO_ROOT / "scripts"]
    out = []
    ignored = {".git", "node_modules", "dist", "build", ".wrangler"}
    for root in roots:
        if not root.exists():
            continue
        for p in root.rglob("*"):
            if not p.is_file():
                continue
            if any(part in ignored for part in p.parts):
                continue
            if p.suffix in {".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".py"}:
                out.append(p)
    return out


def grep(pattern: str) -> List[Dict[str, Any]]:
    rx = re.compile(pattern)
    hits = []
    for p in iter_src_files():
        text = read_text(p)
        for i, line in enumerate(text.splitlines(), 1):
            if rx.search(line):
                hits.append({"path": str(p.relative_to(REPO_ROOT)), "line": i, "text": line.strip()[:500]})
    return hits


def static_code_map() -> Dict[str, Any]:
    return {
        "command_refs": grep(r"agentsam_commands|agentsam_command_pattern|agentsam_slash_commands|command_runs|agentsam_command_runs"),
        "workflow_refs": grep(r"agentsam_workflows|agentsam_mcp_workflows|executeWorkflowGraph|workflow_key|workflow_run"),
        "plan_refs": grep(r"agentsam_plans|agentsam_plan_tasks|createPlan|executePlan|plan_created|task_start|plan_complete"),
        "approval_refs": grep(r"approval_required|requires_approval|agentsam_approval_queue|safe_to_run|owner_only|destructive"),
        "model_route_refs": grep(r"agentsam_model_catalog|agentsam_prompt_routes|agentsam_route_requirements|agentsam_routing_arms|dispatchComplete|dispatchStream"),
        "terminal_refs": grep(r"TERMINAL_WS_URL|TERMINAL_SECRET|terminal|PTY|/exec"),
    }


# ---------------------------------------------------------------------------
# Analysis
# ---------------------------------------------------------------------------

def analyze_relationships(schema_report: Dict[str, Any], values: Dict[str, Any], run_health: Dict[str, Any]) -> Dict[str, Any]:
    issues = []
    strengths = []
    design = []

    schemas = schema_report["schemas"]

    for table in CORE_TABLES:
        if schemas.get(table, {}).get("exists"):
            strengths.append(f"{table} exists with {len(schemas[table]['column_names'])} columns.")
        else:
            issues.append({"priority": "P0", "table": table, "issue": "table missing", "fix": "Do not build against this table until confirmed or migrated."})

    commands = values.get("agentsam_commands", [])
    workflows = values.get("agentsam_workflows", []) + values.get("agentsam_mcp_workflows", [])
    patterns = values.get("agentsam_command_pattern", [])
    slash = values.get("agentsam_slash_commands", [])

    workflow_keys = set()
    for w in workflows:
        for c in ["workflow_key", "key", "slug"]:
            if w.get(c):
                workflow_keys.add(str(w[c]))

    command_keys = set()
    for c in commands:
        for k in ["command_key", "key", "slug"]:
            if c.get(k):
                command_keys.add(str(c[k]))

    if not commands:
        issues.append({
            "priority": "P1",
            "table": "agentsam_commands",
            "issue": "No command rows sampled/found.",
            "fix": "Seed canonical command rows so chat/CLI/slash/workflow routes all share one command registry.",
        })
    if not patterns:
        issues.append({
            "priority": "P1",
            "table": "agentsam_command_pattern",
            "issue": "No command patterns sampled/found.",
            "fix": "Seed pattern rows for build/create/fix/audit/run/deploy/db-query intent detection.",
        })
    if not slash:
        issues.append({
            "priority": "P2",
            "table": "agentsam_slash_commands",
            "issue": "No slash commands sampled/found.",
            "fix": "Seed slash aliases to make routes discoverable in UI.",
        })

    for spec in CANONICAL_COMMANDS:
        if spec["key"] not in command_keys and spec["slug"] not in command_keys:
            issues.append({
                "priority": "P2",
                "table": "agentsam_commands",
                "issue": f"Canonical command missing: {spec['key']}",
                "fix": "Review generated SQL proposal.",
            })
        wk = spec.get("workflow_key")
        if wk and wk not in workflow_keys:
            issues.append({
                "priority": "P2",
                "table": "agentsam_workflows/agentsam_mcp_workflows",
                "issue": f"Command expects workflow_key '{wk}' but it was not found in sampled workflow keys.",
                "fix": "Either seed/rename the workflow or keep this command as planner/task-executor route instead of explicit workflow route.",
            })

    # Run health
    for table, info in run_health.items():
        if not info.get("exists"):
            continue
        rows = info.get("rows", [])
        if not rows:
            issues.append({
                "priority": "P3",
                "table": table,
                "issue": "No recent run rows sampled.",
                "fix": "After chat tests, verify this table receives run telemetry.",
            })

    design.extend([
        {
            "layer": "1_command_registry",
            "tables": ["agentsam_commands", "agentsam_command_pattern", "agentsam_slash_commands"],
            "rule": "Every routeable user action should have a command row, optional patterns, and optional slash alias.",
        },
        {
            "layer": "2_route_selection",
            "tables": ["agentsam_prompt_routes", "agentsam_route_requirements", "agentsam_routing_arms", "agentsam_model_catalog"],
            "rule": "Command/intent resolves to route_key/task_type, then route config resolves to model_key/provider/api_platform.",
        },
        {
            "layer": "3_execution",
            "tables": ["agentsam_workflows", "agentsam_mcp_workflows", "agentsam_mcp_tools", "agentsam_plans", "agentsam_plan_tasks"],
            "rule": "Workflow commands call executeWorkflowGraph; work goals create plans/tasks; tools execute through existing dispatchers.",
        },
        {
            "layer": "4_telemetry",
            "tables": ["agentsam_command_runs", "agentsam_workflow_runs", "agentsam_tool_chain", "agentsam_usage_events", "agentsam_analytics"],
            "rule": "Every command/chat/workflow/tool call should create correlated run telemetry IDs.",
        },
        {
            "layer": "5_safety",
            "tables": ["agentsam_commands", "agentsam_command_pattern", "agentsam_plan_tasks"],
            "rule": "safe_to_run/owner_only/approval_required semantics must block terminal, deploy, deletion, secrets, and DB writes by default.",
        },
    ])

    return {
        "strengths": strengths,
        "issues": issues,
        "workflow_keys_sampled": sorted(list(workflow_keys))[:200],
        "command_keys_sampled": sorted(list(command_keys))[:200],
        "design_layers": design,
    }


def markdown_report(report: Dict[str, Any]) -> str:
    lines = []
    lines.append("# Agent Sam Command + Workflow E2E Design Report")
    lines.append("")
    lines.append(f"Generated: `{report['generated_at']}`")
    lines.append(f"DB: `{report['config']['d1_db']}` remote=`{report['config']['d1_remote']}`")
    lines.append("")
    lines.append("## Table Counts")
    lines.append("")
    lines.append("| Table | Exists | Rows |")
    lines.append("|---|---:|---:|")
    for table in CORE_TABLES:
        s = report["schema_report"]["schemas"].get(table, {})
        c = report["schema_report"]["counts"].get(table, {})
        lines.append(f"| `{table}` | {bool(s.get('exists'))} | {c.get('count')} |")
    lines.append("")
    lines.append("## Design Layers")
    lines.append("")
    for layer in report["analysis"]["design_layers"]:
        lines.append(f"### {layer['layer']}")
        lines.append("")
        lines.append("Tables: " + ", ".join(f"`{t}`" for t in layer["tables"]))
        lines.append("")
        lines.append(layer["rule"])
        lines.append("")
    lines.append("## Issues / Repair Targets")
    lines.append("")
    if not report["analysis"]["issues"]:
        lines.append("No major issues detected.")
    else:
        lines.append("| Priority | Table | Issue | Fix |")
        lines.append("|---|---|---|---|")
        for issue in report["analysis"]["issues"]:
            lines.append(f"| {issue.get('priority')} | `{issue.get('table')}` | {issue.get('issue')} | {issue.get('fix')} |")
    lines.append("")
    lines.append("## Static Code Map Counts")
    lines.append("")
    for key, hits in report["static_code_map"].items():
        lines.append(f"- `{key}`: {len(hits)} hits")
    lines.append("")
    lines.append("## Proposed SQL")
    lines.append("")
    lines.append(f"Review: `{PROPOSED_SQL}`")
    lines.append("")
    lines.append("Apply manually only after review:")
    lines.append("")
    lines.append("```bash")
    lines.append(f"npx wrangler d1 execute {D1_DB} --remote -c {WRANGLER_CONFIG} --file={PROPOSED_SQL}")
    lines.append("```")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply-sql", action="store_true", help="Apply generated SQL proposal to D1 after creating artifacts.")
    args = parser.parse_args()

    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)

    print("Agent Sam Command + Workflow Designer")
    print(f"repo: {REPO_ROOT}")
    print(f"d1: {D1_DB} remote={D1_REMOTE} config={WRANGLER_CONFIG}")
    print("")

    if not wrangler_available():
        print("[FAIL] npx or wrangler config missing. Run from repo root.")
        return 2

    print("[1/7] Inspecting schemas/counts/samples...")
    schema_report = inspect_all()
    for table in CORE_TABLES:
        s = schema_report["schemas"][table]
        c = schema_report["counts"][table]
        print(f"  {'OK' if s['exists'] else 'MISS'} {table} rows={c.get('count')}")

    print("[2/7] Loading existing command/workflow/model values...")
    values = existing_values(schema_report)
    for key, rows in values.items():
        print(f"  {key}: {len(rows)} rows sampled")

    print("[3/7] Inspecting recent run health...")
    run_health = find_recent_run_health(schema_report)
    for table, info in run_health.items():
        print(f"  {table}: {len(info.get('rows', [])) if info.get('exists') else 'missing'} recent rows")

    print("[4/7] Building static code map...")
    code_map = static_code_map()
    for key, hits in code_map.items():
        print(f"  {key}: {len(hits)} hits")

    print("[5/7] Analyzing relationships...")
    analysis = analyze_relationships(schema_report, values, run_health)
    p0 = [i for i in analysis["issues"] if i.get("priority") == "P0"]
    p1 = [i for i in analysis["issues"] if i.get("priority") == "P1"]
    print(f"  issues: P0={len(p0)} P1={len(p1)} total={len(analysis['issues'])}")

    print("[6/7] Generating SQL proposal...")
    sql = generate_sql(schema_report, values)
    PROPOSED_SQL.write_text(sql)
    print(f"  wrote {PROPOSED_SQL}")

    report = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "config": {
            "d1_db": D1_DB,
            "wrangler_config": WRANGLER_CONFIG,
            "d1_remote": D1_REMOTE,
        },
        "canonical_commands": CANONICAL_COMMANDS,
        "route_expectations": ROUTE_EXPECTATIONS,
        "schema_report": schema_report,
        "existing_values": values,
        "run_health": run_health,
        "static_code_map": code_map,
        "analysis": analysis,
        "artifacts": {
            "json": str(REPORT_JSON),
            "markdown": str(REPORT_MD),
            "sql": str(PROPOSED_SQL),
        },
        "cursor_repair_brief": {
            "principle": "Commands are the registry; patterns/slash commands are entry points; workflows/plans execute; command_runs/workflow_runs/tool_chain/usage/analytics prove it happened.",
            "must_not": [
                "Do not add DB columns.",
                "Do not create a second command registry in code.",
                "Do not bypass executeWorkflowGraph for workflow commands.",
                "Do not auto-run terminal/deploy/delete/db-write commands without approval.",
                "Do not hardcode GPT-4.1 runtime fallbacks.",
                "Do not send gpt-5.4 nano/mini to chat completions.",
            ],
            "ideal_flow": [
                "message -> deterministic guard",
                "guard -> agentsam_command_pattern/slash/commands candidate",
                "candidate -> route_key/workflow_key",
                "route_key -> prompt/model routing tables",
                "workflow_key -> executeWorkflowGraph OR work goal -> agentsam_plans/tasks",
                "execution -> command_runs/workflow_runs/tool_chain/usage/analytics",
                "SSE -> frontend task/workflow board",
            ],
        },
    }

    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True))
    REPORT_MD.write_text(markdown_report(report))
    print(f"  wrote {REPORT_JSON}")
    print(f"  wrote {REPORT_MD}")

    if args.apply_sql:
        print("[7/7] Applying SQL proposal...")
        apply_res = d1_file(PROPOSED_SQL)
        print(apply_res["stdout"])
        if not apply_res["ok"]:
            print(apply_res["stderr"], file=sys.stderr)
            return 3
    else:
        print("[7/7] Skipping apply. Review SQL first.")
        print(f"  npx wrangler d1 execute {D1_DB} --remote -c {WRANGLER_CONFIG} --file={PROPOSED_SQL}")

    if p0:
        print("")
        print("[FAIL] P0 table issues detected. Do not apply SQL until reviewed.")
        return 2

    print("")
    print("[PASS] Design artifacts generated.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
