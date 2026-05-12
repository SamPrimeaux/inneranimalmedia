#!/usr/bin/env python3
"""
Agent Sam Execution Fabric Designer

Focus:
- agentsam_executions
- agentsam_execution_steps
- agentsam_execution_performance_metrics
- agentsam_execution_dependency_graph
- agentsam_execution_context
- agentsam_plans
- agentsam_plan_tasks
- agentsam_workflows
- agentsam_workflow_runs
- agentsam_workflow_nodes
- agentsam_workflow_edges

Purpose:
- Study the real D1 schemas and sampled rows.
- Infer how the tables should work together for Cursor-like "plan → approve → execute → stream → measure" behavior.
- Detect gaps, weak links, missing FK-compatible IDs, stale planner/workflow/run mismatches.
- Produce wireframe flows and phased repair instructions for Cursor/Sam tomorrow.

Generated artifacts:
- artifacts/agentsam-execution-fabric-report.json
- artifacts/agentsam-execution-fabric.md
- artifacts/agentsam-execution-fabric.mmd
- artifacts/agentsam-execution-fabric-cursor-brief.txt
- artifacts/agentsam-execution-fabric-sam-tomorrow-plan.txt

Safe by default:
- No D1 writes.
- No migrations.
- No terminal execution.
- No schema changes.

Run from repo root:
  python3 scripts/agentsam-execution-fabric-designer.py

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
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


REPO_ROOT = Path.cwd()
ARTIFACTS_DIR = REPO_ROOT / "artifacts"

REPORT_JSON = ARTIFACTS_DIR / "agentsam-execution-fabric-report.json"
REPORT_MD = ARTIFACTS_DIR / "agentsam-execution-fabric.md"
REPORT_MMD = ARTIFACTS_DIR / "agentsam-execution-fabric.mmd"
CURSOR_BRIEF = ARTIFACTS_DIR / "agentsam-execution-fabric-cursor-brief.txt"
SAM_PLAN = ARTIFACTS_DIR / "agentsam-execution-fabric-sam-tomorrow-plan.txt"

D1_DB = os.getenv("IAM_D1_DB", "inneranimalmedia-business")
WRANGLER_CONFIG = os.getenv("IAM_WRANGLER_CONFIG", "wrangler.production.toml")
D1_REMOTE = os.getenv("IAM_D1_REMOTE", "1") not in ("0", "false", "False", "no")

CORE_TABLES = [
    "agentsam_executions",
    "agentsam_execution_steps",
    "agentsam_execution_performance_metrics",
    "agentsam_execution_dependency_graph",
    "agentsam_execution_context",
    "agentsam_plans",
    "agentsam_plan_tasks",
    "agentsam_workflows",
    "agentsam_workflow_runs",
    "agentsam_workflow_nodes",
    "agentsam_workflow_edges",
]

SUPPORT_TABLES = [
    "agentsam_approval_queue",
    "agentsam_command_run",
    "agentsam_commands",
    "agentsam_command_pattern",
    "agentsam_tool_chain",
    "agentsam_usage_events",
    "agentsam_analytics",
    "agentsam_model_catalog",
    "agentsam_prompt_routes",
    "agentsam_route_requirements",
    "agentsam_routing_arms",
    "agentsam_mcp_workflows",
    "agentsam_mcp_tools",
    "agentsam_plan_task_dependencies",
    "agentsam_todo",
]

ALL_TABLES = CORE_TABLES + SUPPORT_TABLES

CANONICAL_FLOW = [
    {
        "stage": "1_chat_goal",
        "description": "User enters goal or command in Agent Sam chat.",
        "primary_tables": [],
        "state": "raw message",
    },
    {
        "stage": "2_route_and_classify",
        "description": "Deterministic guard + command patterns + nano classifier decide conversation/workflow/plan/terminal/db.",
        "primary_tables": ["agentsam_command_pattern", "agentsam_commands", "agentsam_prompt_routes", "agentsam_model_catalog"],
        "state": "route_key, workflow_key, recommended_model_key",
    },
    {
        "stage": "3_plan",
        "description": "Work goal becomes a plan and ordered tasks.",
        "primary_tables": ["agentsam_plans", "agentsam_plan_tasks"],
        "state": "plan active, tasks todo",
    },
    {
        "stage": "4_execution_session",
        "description": "A Cursor-like execution session is created to group plan/workflow/tool/terminal steps.",
        "primary_tables": ["agentsam_executions", "agentsam_execution_context"],
        "state": "execution running with context snapshot",
    },
    {
        "stage": "5_dependency_graph",
        "description": "Plan/workflow tasks are represented as a dependency graph for sequential/parallel scheduling.",
        "primary_tables": ["agentsam_execution_dependency_graph", "agentsam_workflow_nodes", "agentsam_workflow_edges"],
        "state": "DAG nodes/edges",
    },
    {
        "stage": "6_steps",
        "description": "Each task/node/command/tool call becomes an execution step with status and output.",
        "primary_tables": ["agentsam_execution_steps", "agentsam_workflow_runs", "agentsam_tool_chain"],
        "state": "step queued/running/done/failed/blocked/approval_required",
    },
    {
        "stage": "7_approval",
        "description": "Risky terminal/db/deploy steps create approval queue rows and wait for explicit Allow.",
        "primary_tables": ["agentsam_approval_queue", "agentsam_command_run"],
        "state": "pending/approved/denied",
    },
    {
        "stage": "8_execute",
        "description": "Approved runner executes model/workflow/tool/terminal/db action and streams SSE.",
        "primary_tables": ["agentsam_execution_steps", "agentsam_workflow_runs", "agentsam_plan_tasks"],
        "state": "live step output",
    },
    {
        "stage": "9_metrics",
        "description": "Latency, cost, tokens, retries, errors, and quality signals are recorded.",
        "primary_tables": ["agentsam_execution_performance_metrics", "agentsam_usage_events", "agentsam_analytics"],
        "state": "performance/cost/quality ledger",
    },
    {
        "stage": "10_finish",
        "description": "Plan/workflow/execution statuses roll up and chat task board shows final state.",
        "primary_tables": ["agentsam_executions", "agentsam_plans", "agentsam_workflow_runs"],
        "state": "complete/partial/failed",
    },
]


# ---------------------------------------------------------------------------
# Shell / D1
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


def wrangler_ready() -> bool:
    return shutil.which("npx") is not None and (REPO_ROOT / WRANGLER_CONFIG).exists()


def d1_sql(sql: str, timeout: int = 60) -> Dict[str, Any]:
    cmd = ["npx", "wrangler", "d1", "execute", D1_DB]
    if D1_REMOTE:
        cmd.append("--remote")
    cmd.extend(["-c", WRANGLER_CONFIG, "--json", "--command", sql])
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
        "stderr": res.get("stderr", "")[-1000:],
    }


def table_count(table: str) -> Dict[str, Any]:
    res = d1_sql(f"SELECT COUNT(*) AS count FROM {table};")
    rows = result_rows(res)
    return {
        "ok": res.get("ok"),
        "count": rows[0].get("count") if rows else None,
        "stderr": res.get("stderr", "")[-500:],
    }


def sample_table(table: str, cols: List[str], limit: int = 20) -> Dict[str, Any]:
    if not cols:
        return {"ok": False, "rows": [], "error": "no columns"}

    preferred = [c for c in [
        "id",
        "tenant_id",
        "workspace_id",
        "user_id",
        "session_id",
        "conversation_id",
        "plan_id",
        "task_id",
        "plan_task_id",
        "todo_id",
        "workflow_id",
        "workflow_key",
        "workflow_run_id",
        "execution_id",
        "execution_step_id",
        "parent_step_id",
        "node_id",
        "node_key",
        "edge_id",
        "source_node_id",
        "target_node_id",
        "status",
        "step_type",
        "handler_type",
        "handler_key",
        "command_run_id",
        "tool_key",
        "model_key",
        "provider",
        "risk_level",
        "approval_status",
        "requires_approval",
        "title",
        "name",
        "created_at",
        "updated_at",
        "started_at",
        "completed_at",
    ] if c in cols]

    selected = preferred or cols[:12]
    order_col = None
    for c in ["created_at", "started_at", "updated_at", "completed_at"]:
        if c in cols:
            order_col = c
            break
    order_sql = f" ORDER BY {order_col} DESC" if order_col else ""
    res = d1_sql(f"SELECT {', '.join(selected)} FROM {table}{order_sql} LIMIT {limit};")
    return {
        "ok": res.get("ok"),
        "columns": selected,
        "rows": result_rows(res),
        "stderr": res.get("stderr", "")[-500:],
    }


def distinct_statuses(table: str, cols: List[str]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for col in ["status", "approval_status", "step_status", "state", "phase"]:
        if col not in cols:
            continue
        res = d1_sql(f"SELECT {col} AS value, COUNT(*) AS count FROM {table} GROUP BY {col} ORDER BY count DESC LIMIT 30;")
        out[col] = result_rows(res)
    return out


def inspect_all_tables() -> Dict[str, Any]:
    schemas: Dict[str, Any] = {}
    counts: Dict[str, Any] = {}
    samples: Dict[str, Any] = {}
    statuses: Dict[str, Any] = {}

    for table in ALL_TABLES:
        schemas[table] = inspect_schema(table)
        if schemas[table]["exists"]:
            counts[table] = table_count(table)
            samples[table] = sample_table(table, schemas[table]["column_names"])
            statuses[table] = distinct_statuses(table, schemas[table]["column_names"])
        else:
            counts[table] = {"ok": False, "count": None}
            samples[table] = {"ok": False, "rows": []}
            statuses[table] = {}
    return {
        "schemas": schemas,
        "counts": counts,
        "samples": samples,
        "statuses": statuses,
    }


# ---------------------------------------------------------------------------
# Code grep
# ---------------------------------------------------------------------------

def read_text(path: Path) -> str:
    try:
        return path.read_text(errors="ignore")
    except Exception:
        return ""


def iter_code_files() -> List[Path]:
    ignored = {".git", "node_modules", "dist", "build", ".wrangler", ".next", "coverage"}
    roots = [REPO_ROOT / "src", REPO_ROOT / "scripts", REPO_ROOT / "migrations"]
    files: List[Path] = []
    for root in roots:
        if not root.exists():
            continue
        for p in root.rglob("*"):
            if not p.is_file():
                continue
            if any(part in ignored for part in p.parts):
                continue
            if p.suffix in {".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".py", ".sql"}:
                files.append(p)
    return files


def grep(pattern: str, *, limit: int = 250) -> List[Dict[str, Any]]:
    rx = re.compile(pattern)
    hits: List[Dict[str, Any]] = []
    for p in iter_code_files():
        text = read_text(p)
        if not text:
            continue
        for i, line in enumerate(text.splitlines(), 1):
            if rx.search(line):
                hits.append({
                    "path": str(p.relative_to(REPO_ROOT)),
                    "line": i,
                    "text": line.strip()[:700],
                })
                if len(hits) >= limit:
                    return hits
    return hits


def code_map() -> Dict[str, Any]:
    queries = {
        "execution_table_refs": r"agentsam_executions|agentsam_execution_steps|agentsam_execution_performance_metrics|agentsam_execution_dependency_graph|agentsam_execution_context",
        "plan_refs": r"agentsam_plans|agentsam_plan_tasks|createPlan|executePlan|plan_created|task_start|plan_complete",
        "workflow_refs": r"agentsam_workflows|agentsam_workflow_runs|agentsam_workflow_nodes|agentsam_workflow_edges|executeWorkflowGraph|workflow_step",
        "approval_refs": r"agentsam_approval_queue|approval_required|pending_approval|approved_by|command_run_id",
        "command_run_refs": r"agentsam_command_run\b|selected_command_slug|approval_status|completeCommand|executeCommand",
        "sse_refs": r"text/event-stream|TransformStream|consumeAgentChatSseBody|EventSource|SSE|workflow_step|task_complete",
        "metrics_refs": r"performance_metrics|usage_events|agentsam_analytics|latency|duration_ms|cost_usd|input_tokens|output_tokens",
        "dependency_refs": r"dependency_graph|workflow_edges|workflow_nodes|source_node|target_node|parent_step|depends_on|DAG|topological",
        "terminal_refs": r"TERMINAL_WS_URL|runTerminalCommandViaHttpExec|/exec|PTY|terminal",
    }
    return {name: grep(pattern) for name, pattern in queries.items()}


# ---------------------------------------------------------------------------
# Relationship inference
# ---------------------------------------------------------------------------

def cols(report: Dict[str, Any], table: str) -> List[str]:
    return report["schemas"].get(table, {}).get("column_names", [])


def has_col(report: Dict[str, Any], table: str, col: str) -> bool:
    return col in cols(report, table)


def link_score(report: Dict[str, Any], left: str, right: str) -> Dict[str, Any]:
    lcols = set(cols(report, left))
    rcols = set(cols(report, right))
    shared = sorted(list(lcols.intersection(rcols)))

    candidate_pairs = []
    keys = [
        "id", "tenant_id", "workspace_id", "user_id", "session_id",
        "plan_id", "task_id", "plan_task_id", "workflow_id", "workflow_key",
        "workflow_run_id", "execution_id", "execution_step_id",
        "node_id", "node_key", "command_run_id",
    ]

    for key in keys:
        if key in lcols and key in rcols:
            candidate_pairs.append((key, key))

    # common FK naming
    if "id" in rcols:
        for lc in lcols:
            if lc in {f"{right}_id", right.replace("agentsam_", "") + "_id"}:
                candidate_pairs.append((lc, "id"))

    score = len(candidate_pairs) * 2 + len([s for s in shared if s.endswith("_id") or s.endswith("_key")])
    return {
        "left": left,
        "right": right,
        "score": score,
        "shared_columns": shared,
        "candidate_pairs": candidate_pairs,
    }


def infer_relationships(table_report: Dict[str, Any]) -> List[Dict[str, Any]]:
    existing = [t for t in ALL_TABLES if table_report["schemas"].get(t, {}).get("exists")]
    links: List[Dict[str, Any]] = []

    important_pairs = [
        ("agentsam_plans", "agentsam_plan_tasks"),
        ("agentsam_plans", "agentsam_executions"),
        ("agentsam_plan_tasks", "agentsam_execution_steps"),
        ("agentsam_executions", "agentsam_execution_steps"),
        ("agentsam_executions", "agentsam_execution_context"),
        ("agentsam_executions", "agentsam_execution_performance_metrics"),
        ("agentsam_execution_steps", "agentsam_execution_performance_metrics"),
        ("agentsam_execution_steps", "agentsam_approval_queue"),
        ("agentsam_execution_steps", "agentsam_tool_chain"),
        ("agentsam_execution_steps", "agentsam_command_run"),
        ("agentsam_workflows", "agentsam_workflow_nodes"),
        ("agentsam_workflows", "agentsam_workflow_edges"),
        ("agentsam_workflows", "agentsam_workflow_runs"),
        ("agentsam_workflow_runs", "agentsam_execution_steps"),
        ("agentsam_workflow_runs", "agentsam_approval_queue"),
        ("agentsam_workflow_nodes", "agentsam_execution_steps"),
        ("agentsam_workflow_edges", "agentsam_execution_dependency_graph"),
        ("agentsam_execution_dependency_graph", "agentsam_execution_steps"),
        ("agentsam_command_run", "agentsam_approval_queue"),
        ("agentsam_commands", "agentsam_command_run"),
        ("agentsam_usage_events", "agentsam_execution_performance_metrics"),
        ("agentsam_analytics", "agentsam_execution_performance_metrics"),
    ]

    for left, right in important_pairs:
        if left in existing and right in existing:
            links.append(link_score(table_report, left, right))
        else:
            links.append({
                "left": left,
                "right": right,
                "score": 0,
                "missing": [t for t in [left, right] if t not in existing],
                "shared_columns": [],
                "candidate_pairs": [],
            })

    return links


def query_join_health(table_report: Dict[str, Any]) -> Dict[str, Any]:
    """
    Best-effort small join checks, only when columns exist.
    """
    health: Dict[str, Any] = {}

    # plans -> tasks
    if has_col(table_report, "agentsam_plan_tasks", "plan_id") and has_col(table_report, "agentsam_plans", "id"):
        res = d1_sql("""
SELECT
  COUNT(*) AS task_count,
  SUM(CASE WHEN p.id IS NULL THEN 1 ELSE 0 END) AS orphan_tasks
FROM agentsam_plan_tasks t
LEFT JOIN agentsam_plans p ON p.id = t.plan_id;
""".strip())
        health["plan_task_link"] = result_rows(res)

    # workflows -> nodes
    if has_col(table_report, "agentsam_workflow_nodes", "workflow_id") and has_col(table_report, "agentsam_workflows", "id"):
        res = d1_sql("""
SELECT
  COUNT(*) AS node_count,
  SUM(CASE WHEN w.id IS NULL THEN 1 ELSE 0 END) AS orphan_nodes
FROM agentsam_workflow_nodes n
LEFT JOIN agentsam_workflows w ON w.id = n.workflow_id;
""".strip())
        health["workflow_node_link"] = result_rows(res)

    # workflows -> edges
    if has_col(table_report, "agentsam_workflow_edges", "workflow_id") and has_col(table_report, "agentsam_workflows", "id"):
        res = d1_sql("""
SELECT
  COUNT(*) AS edge_count,
  SUM(CASE WHEN w.id IS NULL THEN 1 ELSE 0 END) AS orphan_edges
FROM agentsam_workflow_edges e
LEFT JOIN agentsam_workflows w ON w.id = e.workflow_id;
""".strip())
        health["workflow_edge_link"] = result_rows(res)

    # executions -> steps
    if has_col(table_report, "agentsam_execution_steps", "execution_id") and has_col(table_report, "agentsam_executions", "id"):
        res = d1_sql("""
SELECT
  COUNT(*) AS step_count,
  SUM(CASE WHEN x.id IS NULL THEN 1 ELSE 0 END) AS orphan_steps
FROM agentsam_execution_steps s
LEFT JOIN agentsam_executions x ON x.id = s.execution_id;
""".strip())
        health["execution_step_link"] = result_rows(res)

    # command_run -> approval
    if has_col(table_report, "agentsam_approval_queue", "command_run_id") and has_col(table_report, "agentsam_command_run", "id"):
        res = d1_sql("""
SELECT
  COUNT(*) AS approval_count,
  SUM(CASE WHEN r.id IS NULL AND a.command_run_id IS NOT NULL THEN 1 ELSE 0 END) AS orphan_approvals,
  SUM(CASE WHEN a.status='pending' THEN 1 ELSE 0 END) AS pending,
  SUM(CASE WHEN a.status='approved' THEN 1 ELSE 0 END) AS approved
FROM agentsam_approval_queue a
LEFT JOIN agentsam_command_run r ON r.id = a.command_run_id;
""".strip())
        health["approval_command_run_link"] = result_rows(res)

    # workflow_runs -> steps via workflow_run_id
    if has_col(table_report, "agentsam_execution_steps", "workflow_run_id") and has_col(table_report, "agentsam_workflow_runs", "id"):
        res = d1_sql("""
SELECT
  COUNT(*) AS step_count,
  SUM(CASE WHEN wr.id IS NULL AND s.workflow_run_id IS NOT NULL THEN 1 ELSE 0 END) AS orphan_workflow_steps
FROM agentsam_execution_steps s
LEFT JOIN agentsam_workflow_runs wr ON wr.id = s.workflow_run_id;
""".strip())
        health["workflow_run_step_link"] = result_rows(res)

    return health


# ---------------------------------------------------------------------------
# Analysis
# ---------------------------------------------------------------------------

def analyze(table_report: Dict[str, Any], links: List[Dict[str, Any]], joins: Dict[str, Any], code: Dict[str, Any]) -> Dict[str, Any]:
    issues: List[Dict[str, Any]] = []
    strengths: List[str] = []
    recommendations: List[Dict[str, Any]] = []

    schemas = table_report["schemas"]
    counts = table_report["counts"]

    for table in CORE_TABLES:
        if schemas.get(table, {}).get("exists"):
            strengths.append(f"{table} exists with {counts.get(table, {}).get('count')} rows.")
        else:
            issues.append({
                "priority": "P0" if table in ["agentsam_plans", "agentsam_plan_tasks", "agentsam_workflow_runs"] else "P1",
                "table": table,
                "issue": f"{table} is missing.",
                "fix": "Do not wire execution fabric against a missing table. Use existing fallback table or create explicit migration later.",
            })

    # Specific expectations
    if schemas.get("agentsam_executions", {}).get("exists") and schemas.get("agentsam_execution_steps", {}).get("exists"):
        if has_col(table_report, "agentsam_execution_steps", "execution_id"):
            strengths.append("execution_steps can link to executions through execution_id.")
        else:
            issues.append({
                "priority": "P1",
                "table": "agentsam_execution_steps",
                "issue": "No execution_id column detected.",
                "fix": "Use workflow_run_id/execution_step_id linkage for now; do not assume full execution session rollup.",
            })

    if has_col(table_report, "agentsam_execution_steps", "workflow_run_id"):
        strengths.append("execution_steps can link to workflow_runs through workflow_run_id.")
    else:
        recommendations.append({
            "priority": "P2",
            "area": "workflow_step_linkage",
            "recommendation": "If schema lacks workflow_run_id on execution steps, store workflow linkage in existing context/input/output JSON fields if present.",
        })

    if has_col(table_report, "agentsam_approval_queue", "execution_step_id"):
        strengths.append("approval_queue can link directly to execution_steps through execution_step_id.")
    else:
        recommendations.append({
            "priority": "P2",
            "area": "approval_linkage",
            "recommendation": "Approval queue has no execution_step_id; link approval through command_run_id/workflow_run_id/input_json instead.",
        })

    if has_col(table_report, "agentsam_approval_queue", "plan_id"):
        issues.append({
            "priority": "P2",
            "table": "agentsam_approval_queue",
            "issue": "approval_queue.plan_id may reference agentsam_plans_old in current production.",
            "fix": "Do not rely on approval_queue.plan_id for new planner linkage. Prefer command_run_id, workflow_run_id, execution_step_id, or JSON references.",
        })

    # Join health
    for name, rows in joins.items():
        if not rows:
            continue
        row = rows[0]
        for k, v in row.items():
            if k.startswith("orphan") and v not in (None, 0, "0"):
                issues.append({
                    "priority": "P1",
                    "table": name,
                    "issue": f"{k}={v}",
                    "fix": "Review orphaned rows before relying on this relationship for runtime routing.",
                })

    # Code coverage
    if len(code.get("execution_table_refs", [])) < 5:
        recommendations.append({
            "priority": "P1",
            "area": "runtime_wiring",
            "recommendation": "Execution fabric tables exist but code references appear light. Cursor should wire create/update calls where plans/workflows/tools execute.",
        })

    if len(code.get("sse_refs", [])) > 0:
        strengths.append("SSE/streaming code references exist; reuse current stream shape instead of inventing a second event protocol.")

    if len(code.get("approval_refs", [])) > 0:
        strengths.append("Approval references exist; terminal/db/deploy steps should integrate with that path.")

    # Tomorrow phases
    phases = [
        {
            "phase": "P0 — Freeze safety and verify live behavior",
            "owner": "Sam + Cursor",
            "goal": "Make sure terminal/db/deploy tasks require approval and cannot execute from raw planner text.",
            "steps": [
                "Run planner challenge and approval designer scripts.",
                "Grep agentsam-task-executor for not_required raw terminal authorization.",
                "Test: 'deploy the worker' and 'delete all failed R2 uploads' must produce approval-required, not execution.",
                "Keep ./scripts/dev-deploy.sh --worker as the only deploy path.",
            ],
            "done_when": "No raw terminal task executes without an approved approval_queue row or executeCommand-approved catalog command.",
        },
        {
            "phase": "P1 — Create the execution session spine",
            "owner": "Cursor",
            "goal": "Every plan/workflow run gets one canonical execution record and steps.",
            "steps": [
                "At plan creation/execution start, create agentsam_executions row if table exists.",
                "Store session/user/tenant/workspace/plan/workflow identifiers using existing columns only.",
                "For every plan task, create agentsam_execution_steps row linked by execution_id if column exists.",
                "For workflow execution, map workflow nodes to execution_steps with workflow_run_id/node_key if columns exist.",
                "Do not alter schemas; fall back to context JSON columns if present.",
            ],
            "done_when": "A chat work goal creates one execution plus N execution_steps visible in D1.",
        },
        {
            "phase": "P2 — Dependency graph and workflow DAG alignment",
            "owner": "Cursor",
            "goal": "Represent plan task ordering and workflow nodes/edges as one schedulable graph.",
            "steps": [
                "Read agentsam_workflow_nodes and agentsam_workflow_edges for explicit workflows.",
                "For planner tasks, derive simple sequential edges by order_index.",
                "Write agentsam_execution_dependency_graph rows if schema supports source/target columns.",
                "Scheduler executes only nodes whose dependencies are done.",
                "Blocked/approval_required nodes pause dependents.",
            ],
            "done_when": "Report can show a DAG for a plan/workflow and which node is currently runnable.",
        },
        {
            "phase": "P3 — Cursor-style approval and resume",
            "owner": "Cursor + Sam",
            "goal": "User clicks Allow and the approved step resumes instead of being permanently skipped.",
            "steps": [
                "Terminal/db/deploy step creates command_run and approval_queue rows.",
                "Frontend renders Allow/Deny from approval_required SSE payload.",
                "Allow sets approval_queue.status='approved'.",
                "Resume endpoint executes only the approved execution_step/task.",
                "Update command_run, execution_step, plan_task, and metrics rows.",
            ],
            "done_when": "A proposed terminal step can be approved and then runs with live output and telemetry.",
        },
        {
            "phase": "P4 — Performance metrics and self-tuning",
            "owner": "Cursor",
            "goal": "Capture model/tool/terminal performance so Agent Sam can route better.",
            "steps": [
                "On every step completion, write agentsam_execution_performance_metrics if table exists.",
                "Mirror cost/tokens/latency into agentsam_usage_events/analytics if those are existing canonical ledgers.",
                "Capture provider/model_key/tool_key/command_slug/status/error/duration.",
                "Use the metrics for future Thompson/routing memory updates.",
            ],
            "done_when": "Dashboard can chart per-step latency, cost, failure rates, approvals, and model/tool usage.",
        },
        {
            "phase": "P5 — UI wireframe polish",
            "owner": "Cursor",
            "goal": "Task board feels like Cursor: plan, steps, approvals, terminal output, artifacts, final summary.",
            "steps": [
                "Render plan card with steps grouped by status.",
                "Render dependency blockers and currently running node.",
                "Render approval cards inline with Allow/Deny.",
                "Render terminal output collapsed by default with expand.",
                "Render final execution summary using metrics.",
            ],
            "done_when": "Agent Sam chat shows a live execution board that makes D1 telemetry visible in real time.",
        },
    ]

    return {
        "strengths": strengths,
        "issues": issues,
        "recommendations": recommendations,
        "phases": phases,
    }


# ---------------------------------------------------------------------------
# Wireframes / reports
# ---------------------------------------------------------------------------

def mermaid_flow() -> str:
    return """flowchart TD
  A[User goal in Agent Sam chat] --> B[Route gate: command patterns + nano classifier]
  B -->|conversation| C[Direct chat response]
  B -->|explicit workflow| D[Resolve agentsam_workflows / mcp_workflows]
  B -->|work goal| E[Create agentsam_plans]
  E --> F[Create agentsam_plan_tasks]
  D --> G[Create agentsam_workflow_runs]

  E --> H[Create agentsam_executions]
  G --> H
  H --> I[Capture agentsam_execution_context]
  F --> J[Create agentsam_execution_steps]
  G --> K[Load workflow_nodes + workflow_edges]
  K --> J

  J --> L[Build agentsam_execution_dependency_graph]
  L --> M[Scheduler: runnable steps only]

  M -->|agent/model| N[dispatchComplete / dispatchStream]
  M -->|workflow node| O[executeWorkflowGraph]
  M -->|tool| P[tool dispatcher / MCP]
  M -->|terminal/db/deploy risky| Q[Create command_run + approval_queue]

  Q --> R{User clicks Allow?}
  R -->|No / pending| S[Step approval_required / blocked]
  R -->|Yes| T[Approved runner / executeCommand]
  T --> U[PTY / DB / deploy execution]

  N --> V[Update execution_steps]
  O --> V
  P --> V
  U --> V
  S --> V

  V --> W[Write performance metrics]
  W --> X[usage_events + analytics + routing memory]
  V --> Y[Update plan_tasks / workflow_runs / executions]
  Y --> Z[SSE task board updates]
  Z --> AA[Cursor-like final execution summary]
"""


def ascii_wireframe() -> str:
    return r"""
┌────────────────────────────────────────────────────────────────────┐
│ Agent Sam Chat                                                     │
│                                                                    │
│ User: "build/fix/deploy/audit..."                                  │
└──────────────────────────────┬─────────────────────────────────────┘
                               │
                               ▼
┌────────────────────────────────────────────────────────────────────┐
│ Route Gate                                                         │
│ deterministic guard → agentsam_command_pattern → nano classifier    │
│ output: conversation | workflow | plan | terminal | db | approval   │
└───────────────┬───────────────────────┬────────────────────────────┘
                │                       │
                ▼                       ▼
┌──────────────────────────┐   ┌─────────────────────────────────────┐
│ Explicit Workflow         │   │ Work Goal / Plan                    │
│ agentsam_workflows        │   │ agentsam_plans                      │
│ workflow_nodes/edges      │   │ agentsam_plan_tasks                 │
│ agentsam_workflow_runs    │   │                                     │
└───────────────┬──────────┘   └──────────────┬──────────────────────┘
                │                             │
                └──────────────┬──────────────┘
                               ▼
┌────────────────────────────────────────────────────────────────────┐
│ Execution Spine                                                    │
│ agentsam_executions                                                │
│ agentsam_execution_context                                         │
│ agentsam_execution_steps                                           │
│ agentsam_execution_dependency_graph                                │
└──────────────────────────────┬─────────────────────────────────────┘
                               │
                               ▼
┌────────────────────────────────────────────────────────────────────┐
│ Step Runner                                                        │
│ agent/model → dispatchComplete                                     │
│ workflow → executeWorkflowGraph                                    │
│ tool/MCP → existing dispatcher                                     │
│ terminal/db/deploy → command_run + approval_queue                  │
└──────────────────────────────┬─────────────────────────────────────┘
                               │
                 ┌─────────────┴──────────────┐
                 ▼                            ▼
┌─────────────────────────────┐  ┌───────────────────────────────────┐
│ Approval Required            │  │ Approved Execution                 │
│ agentsam_approval_queue      │  │ executeCommand / approved runner   │
│ Allow / Deny in chat         │  │ PTY/DB/deploy only after Allow      │
└─────────────────────────────┘  └──────────────────┬────────────────┘
                                                     ▼
┌────────────────────────────────────────────────────────────────────┐
│ Metrics + Rollup                                                   │
│ agentsam_execution_performance_metrics                             │
│ agentsam_usage_events / agentsam_analytics                         │
│ update plan_tasks, workflow_runs, executions                        │
└──────────────────────────────┬─────────────────────────────────────┘
                               ▼
┌────────────────────────────────────────────────────────────────────┐
│ Cursor-like UI                                                     │
│ live task board, approval cards, terminal output, final summary     │
└────────────────────────────────────────────────────────────────────┘
"""


def md_report(report: Dict[str, Any]) -> str:
    lines: List[str] = []
    lines.append("# Agent Sam Execution Fabric Report")
    lines.append("")
    lines.append(f"Generated: `{report['generated_at']}`")
    lines.append(f"DB: `{report['config']['d1_db']}` remote=`{report['config']['d1_remote']}`")
    lines.append("")
    lines.append("## Goal")
    lines.append("")
    lines.append("Design the Cursor-like execution fabric that connects plans, tasks, workflows, workflow runs, execution steps, dependency graphs, approvals, metrics, and live chat UI.")
    lines.append("")
    lines.append("## Wireframe")
    lines.append("")
    lines.append("```text")
    lines.append(ascii_wireframe().strip("\n"))
    lines.append("```")
    lines.append("")
    lines.append("## Core table counts")
    lines.append("")
    lines.append("| Table | Exists | Rows | Key columns detected |")
    lines.append("|---|---:|---:|---|")
    for table in CORE_TABLES:
        s = report["tables"]["schemas"].get(table, {})
        c = report["tables"]["counts"].get(table, {})
        key_cols = [x for x in s.get("column_names", []) if x in {
            "id", "tenant_id", "workspace_id", "user_id", "session_id", "plan_id", "task_id",
            "workflow_id", "workflow_key", "workflow_run_id", "execution_id",
            "execution_step_id", "status", "created_at", "updated_at",
        }]
        lines.append(f"| `{table}` | {s.get('exists')} | {c.get('count')} | `{', '.join(key_cols[:12])}` |")
    lines.append("")
    lines.append("## Support table counts")
    lines.append("")
    lines.append("| Table | Exists | Rows |")
    lines.append("|---|---:|---:|")
    for table in SUPPORT_TABLES:
        s = report["tables"]["schemas"].get(table, {})
        c = report["tables"]["counts"].get(table, {})
        lines.append(f"| `{table}` | {s.get('exists')} | {c.get('count')} |")
    lines.append("")
    lines.append("## Inferred table relationships")
    lines.append("")
    lines.append("| Left | Right | Score | Candidate pairs |")
    lines.append("|---|---|---:|---|")
    for link in report["relationships"][:80]:
        pairs = ", ".join([f"{a}→{b}" for a, b in link.get("candidate_pairs", [])])
        missing = ""
        if link.get("missing"):
            missing = " missing: " + ",".join(link["missing"])
        lines.append(f"| `{link['left']}` | `{link['right']}` | {link.get('score', 0)} | {pairs}{missing} |")
    lines.append("")
    lines.append("## Join health")
    lines.append("")
    if not report["join_health"]:
        lines.append("No join-health checks could be run with detected columns.")
    else:
        for name, rows in report["join_health"].items():
            lines.append(f"### `{name}`")
            lines.append("")
            lines.append("```json")
            lines.append(json.dumps(rows, indent=2))
            lines.append("```")
            lines.append("")
    lines.append("")
    lines.append("## Strengths")
    lines.append("")
    for item in report["analysis"]["strengths"]:
        lines.append(f"- {item}")
    lines.append("")
    lines.append("## Issues")
    lines.append("")
    if not report["analysis"]["issues"]:
        lines.append("No major issues detected.")
    else:
        lines.append("| Priority | Table | Issue | Fix |")
        lines.append("|---|---|---|---|")
        for issue in report["analysis"]["issues"]:
            lines.append(f"| {issue.get('priority')} | `{issue.get('table', '')}` | {issue.get('issue')} | {issue.get('fix')} |")
    lines.append("")
    lines.append("## Recommendations")
    lines.append("")
    if not report["analysis"]["recommendations"]:
        lines.append("No extra recommendations.")
    else:
        for rec in report["analysis"]["recommendations"]:
            lines.append(f"- **{rec.get('priority')} / {rec.get('area')}**: {rec.get('recommendation')}")
    lines.append("")
    lines.append("## Phased Cursor/Sam repair plan for tomorrow")
    lines.append("")
    for phase in report["analysis"]["phases"]:
        lines.append(f"### {phase['phase']}")
        lines.append("")
        lines.append(f"Owner: `{phase['owner']}`")
        lines.append("")
        lines.append(f"Goal: {phase['goal']}")
        lines.append("")
        for step in phase["steps"]:
            lines.append(f"- {step}")
        lines.append("")
        lines.append(f"Done when: {phase['done_when']}")
        lines.append("")
    lines.append("## Mermaid")
    lines.append("")
    lines.append("```mermaid")
    lines.append(mermaid_flow())
    lines.append("```")
    lines.append("")
    return "\n".join(lines)


def cursor_brief(report: Dict[str, Any]) -> str:
    return f"""AGENT SAM EXECUTION FABRIC — CURSOR IMPLEMENTATION BRIEF

Mission:
Build Cursor-like execution quality by wiring the execution fabric around the real D1 tables.

Core principle:
- Chat handler orchestrates.
- DB tables configure and record.
- Execution spine tracks every run.
- Approval queue gates risky work.
- SSE shows live state.
- Metrics feed routing/quality improvements.

Tables to use:
- agentsam_plans / agentsam_plan_tasks for user-facing plan and task board.
- agentsam_executions for one canonical execution session per plan/workflow run, if table exists.
- agentsam_execution_context for prompt/env/session/context snapshots.
- agentsam_execution_steps for each model/tool/workflow/terminal/db step.
- agentsam_execution_dependency_graph for plan/workflow step dependencies.
- agentsam_workflows / agentsam_workflow_nodes / agentsam_workflow_edges for explicit workflow DAGs.
- agentsam_workflow_runs for actual workflow run records.
- agentsam_execution_performance_metrics for per-step/run metrics.
- agentsam_approval_queue + agentsam_command_run for Cursor-style Allow/Deny execution.

Hard rules:
- No new DB columns.
- Use actual detected columns only.
- Do not depend on agentsam_approval_queue.plan_id if it points to agentsam_plans_old.
- Prefer command_run_id, workflow_run_id, execution_step_id, and JSON context links.
- Do not auto-run terminal/db/deploy from planner text.
- User approval must produce/update agentsam_approval_queue.status='approved'.
- Terminal execution after approval must be tied to command_run_id or executeCommand-approved catalog command.
- Keep existing SSE envelope shape if the frontend already expects data: {{ type, ... }}.
- Deploy only with ./scripts/dev-deploy.sh --worker.

Target runtime flow:
1. User sends work goal.
2. Route gate decides plan/workflow/conversation.
3. Plan path creates agentsam_plans + agentsam_plan_tasks.
4. Create agentsam_executions row for the plan/workflow.
5. Create agentsam_execution_context snapshot.
6. Create agentsam_execution_steps for each plan task or workflow node.
7. Create dependency graph:
   - plan tasks: sequential order_index edges.
   - workflow: workflow_nodes/workflow_edges.
8. Scheduler runs steps whose dependencies are complete.
9. Risky terminal/db/deploy steps create approval_queue + command_run and stop.
10. UI shows Allow/Deny.
11. On Allow, resume only that step.
12. Write execution_performance_metrics + usage/analytics.
13. Roll up statuses to plan/workflow/execution.
14. Stream task board updates throughout.

Tomorrow phased work:
{json.dumps(report['analysis']['phases'], indent=2)}

Validation:
- A work goal creates plan + tasks + execution + steps.
- An explicit workflow creates workflow_run + execution + steps from nodes.
- A terminal/deploy/delete task creates approval_required and does not run.
- Clicking Allow approves queue row and resumes that exact step.
- Metrics rows appear after each completed/failed step.
- UI shows live status and final summary.
"""


def sam_tomorrow_plan(report: Dict[str, Any]) -> str:
    lines = []
    lines.append("AGENT SAM — TOMORROW EXECUTION FABRIC PLAN")
    lines.append("")
    lines.append("Morning objective:")
    lines.append("Turn the new planner/task executor into a Cursor-like execution system with real DB state, approval, resume, and metrics.")
    lines.append("")
    lines.append("Start here:")
    lines.append("1. Read artifacts/agentsam-execution-fabric.md.")
    lines.append("2. Open artifacts/agentsam-execution-fabric.mmd for the flow diagram.")
    lines.append("3. Give artifacts/agentsam-execution-fabric-cursor-brief.txt to Cursor.")
    lines.append("")
    lines.append("Order of operations:")
    for idx, phase in enumerate(report["analysis"]["phases"], 1):
        lines.append(f"{idx}. {phase['phase']}")
        lines.append(f"   Goal: {phase['goal']}")
        lines.append(f"   Done when: {phase['done_when']}")
    lines.append("")
    lines.append("Do not let Cursor start with UI polish.")
    lines.append("First make D1 prove the execution spine:")
    lines.append("- agentsam_plans row")
    lines.append("- agentsam_plan_tasks rows")
    lines.append("- agentsam_executions row")
    lines.append("- agentsam_execution_steps rows")
    lines.append("- approval_queue row for risky tasks")
    lines.append("- performance metrics row after completion")
    lines.append("")
    lines.append("Only after those exist should Cursor polish the chat task board.")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-joins", action="store_true", help="Skip join-health queries.")
    args = parser.parse_args()

    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)

    print("Agent Sam Execution Fabric Designer")
    print(f"repo: {REPO_ROOT}")
    print(f"d1: {D1_DB} remote={D1_REMOTE} config={WRANGLER_CONFIG}")
    print("")

    if not wrangler_ready():
        print("[FAIL] npx or wrangler config missing. Run from repo root.")
        return 2

    print("[1/6] Inspecting target and support tables...")
    table_report = inspect_all_tables()
    for table in CORE_TABLES:
        s = table_report["schemas"][table]
        c = table_report["counts"][table]
        print(f"  {'OK' if s['exists'] else 'MISS'} {table} rows={c.get('count')}")

    print("[2/6] Inferring relationships...")
    relationships = infer_relationships(table_report)
    for link in relationships[:12]:
        print(f"  {link['left']} -> {link['right']} score={link.get('score', 0)}")

    print("[3/6] Running join-health checks...")
    join_health = {} if args.no_joins else query_join_health(table_report)
    for name, rows in join_health.items():
        print(f"  {name}: {rows}")

    print("[4/6] Grepping code references...")
    code = code_map()
    for name, hits in code.items():
        print(f"  {name}: {len(hits)} hits")

    print("[5/6] Analyzing phased plan...")
    analysis = analyze(table_report, relationships, join_health, code)
    p0 = [x for x in analysis["issues"] if x.get("priority") == "P0"]
    p1 = [x for x in analysis["issues"] if x.get("priority") == "P1"]
    print(f"  issues: P0={len(p0)} P1={len(p1)} total={len(analysis['issues'])}")

    report = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "config": {
            "d1_db": D1_DB,
            "wrangler_config": WRANGLER_CONFIG,
            "d1_remote": D1_REMOTE,
        },
        "canonical_flow": CANONICAL_FLOW,
        "tables": table_report,
        "relationships": relationships,
        "join_health": join_health,
        "code_map": code,
        "analysis": analysis,
        "artifacts": {
            "json": str(REPORT_JSON),
            "markdown": str(REPORT_MD),
            "mermaid": str(REPORT_MMD),
            "cursor_brief": str(CURSOR_BRIEF),
            "sam_plan": str(SAM_PLAN),
        },
    }

    print("[6/6] Writing artifacts...")
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True))
    REPORT_MD.write_text(md_report(report))
    REPORT_MMD.write_text(mermaid_flow())
    CURSOR_BRIEF.write_text(cursor_brief(report))
    SAM_PLAN.write_text(sam_tomorrow_plan(report))

    print(f"  {REPORT_JSON}")
    print(f"  {REPORT_MD}")
    print(f"  {REPORT_MMD}")
    print(f"  {CURSOR_BRIEF}")
    print(f"  {SAM_PLAN}")

    if p0:
        print("")
        print("[FAIL] P0 issues found. Use report before implementation.")
        return 2

    print("")
    print("[PASS] Execution fabric design artifacts generated.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
