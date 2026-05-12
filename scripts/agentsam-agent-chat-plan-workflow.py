#!/usr/bin/env python3
"""
Agent Sam Workflow Template Installer

Installs / validates the reusable Cursor-quality planner workflow template:

  agentsam_workflows.workflow_key = agent_chat_plan
    -> agentsam_workflow_nodes
    -> agentsam_workflow_edges

It also validates the proven production execution spine:

  agentsam_workflow_runs.id -> agentsam_execution_steps.execution_id

Safe default:
- Dry-run only.
- Writes generated SQL to artifacts/agentsam-agent-chat-plan-workflow.sql.
- Writes report to artifacts/agentsam-agent-chat-plan-workflow-report.json.
- Use --apply to execute the generated SQL against D1.
- Use --validate-only to skip SQL generation/apply and only inspect.

Run from repo root:
  python3 scripts/agentsam-agent-chat-plan-workflow.py

Apply:
  python3 scripts/agentsam-agent-chat-plan-workflow.py --apply

Env:
  IAM_D1_DB=inneranimalmedia-business
  IAM_WRANGLER_CONFIG=wrangler.production.toml
  IAM_D1_REMOTE=1
  IAM_TENANT_ID=tenant_sam_primeaux
  IAM_WORKSPACE_ID=global
  IAM_WORKFLOW_KEY=agent_chat_plan
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


REPO_ROOT = Path.cwd()
ARTIFACTS = REPO_ROOT / "artifacts"

SQL_PATH = ARTIFACTS / "agentsam-agent-chat-plan-workflow.sql"
REPORT_PATH = ARTIFACTS / "agentsam-agent-chat-plan-workflow-report.json"
MD_PATH = ARTIFACTS / "agentsam-agent-chat-plan-workflow-report.md"

D1_DB = os.getenv("IAM_D1_DB", "inneranimalmedia-business")
WRANGLER_CONFIG = os.getenv("IAM_WRANGLER_CONFIG", "wrangler.production.toml")
D1_REMOTE = os.getenv("IAM_D1_REMOTE", "1") not in {"0", "false", "False", "no"}

TENANT_ID = os.getenv("IAM_TENANT_ID", "tenant_sam_primeaux")
WORKSPACE_ID = os.getenv("IAM_WORKSPACE_ID", "global")
WORKFLOW_KEY = os.getenv("IAM_WORKFLOW_KEY", "agent_chat_plan")

TARGET_TABLES = [
    "agentsam_workflows",
    "agentsam_workflow_nodes",
    "agentsam_workflow_edges",
    "agentsam_workflow_runs",
    "agentsam_execution_steps",
    "agentsam_plans",
    "agentsam_plan_tasks",
    "agentsam_approval_queue",
    "agentsam_command_run",
    "agentsam_execution_performance_metrics",
]

WORKFLOW_SPEC = {
    "id": f"wf_{WORKFLOW_KEY}",
    "tenant_id": TENANT_ID,
    "workspace_id": WORKSPACE_ID,
    "workflow_key": WORKFLOW_KEY,
    "display_name": "Agent Chat Plan Execution",
    "description": "Cursor-quality Agent Sam chat planner workflow: classify, plan, create execution steps, execute tasks, request approval, resume approved terminal work, and roll up the run.",
    "workflow_type": "agentic",
    "trigger_type": "agent",
    "default_mode": "agent",
    "default_task_type": "planning",
    "risk_level": "medium",
    "requires_approval": 0,
    "max_concurrent_nodes": 1,
    "timeout_ms": 300000,
    "quality_gate_json": {
        "require_d1_trace": True,
        "spine": "agentsam_workflow_runs.id -> agentsam_execution_steps.execution_id",
        "approval_required_for": ["terminal", "deploy", "db_write", "r2_delete", "secret_change"],
    },
    "metadata_json": {
        "source": "agentsam-agent-chat-plan-workflow.py",
        "purpose": "cursor_quality_execution_fabric",
        "execution_step_parent": "agentsam_workflow_runs.id",
    },
    "is_active": 1,
    "is_platform_global": 1,
}

NODE_SPECS = [
    {
        "node_key": "classify_goal",
        "node_type": "agent",
        "title": "Classify goal",
        "description": "Classify the chat message as conversation, workflow request, plan-worthy work goal, terminal request, db request, or unclear.",
        "handler_key": "gpt-5.4-nano",
        "sort_order": 10,
        "risk_level": "low",
        "requires_approval": 0,
        "timeout_ms": 30000,
        "input_schema_json": {"message": "string"},
        "output_schema_json": {
            "message_type": "conversation|work_goal|workflow_request|terminal_request|db_request|tool_request|unclear",
            "should_create_plan": "boolean",
            "requires_approval": "boolean",
        },
        "quality_gate_json": {"json_only": True, "fallback": "conversation"},
    },
    {
        "node_key": "create_plan",
        "node_type": "agent",
        "title": "Create plan",
        "description": "Create agentsam_plans and agentsam_plan_tasks rows from a work goal.",
        "handler_key": "gpt-5.4-mini",
        "sort_order": 20,
        "risk_level": "low",
        "requires_approval": 0,
        "timeout_ms": 90000,
        "input_schema_json": {"goal": "string", "route": "object"},
        "output_schema_json": {"plan_id": "string", "tasks": "array"},
        "quality_gate_json": {"min_tasks": 1, "max_tasks": 8},
    },
    {
        "node_key": "create_execution_steps",
        "node_type": "db_query",
        "title": "Create execution steps",
        "description": "Create a workflow_run for the plan and one execution_step per plan task. execution_steps.execution_id must equal workflow_run.id.",
        "handler_key": "create_plan_execution_steps",
        "sort_order": 30,
        "risk_level": "medium",
        "requires_approval": 0,
        "timeout_ms": 30000,
        "input_schema_json": {"plan_id": "string", "tasks": "array"},
        "output_schema_json": {"workflow_run_id": "string", "execution_steps": "array"},
        "quality_gate_json": {
            "must_set": [
                "agentsam_plans.workflow_run_id",
                "agentsam_plan_tasks.workflow_run_id",
                "agentsam_plan_tasks.execution_step_id",
                "agentsam_execution_steps.execution_id",
            ]
        },
    },
    {
        "node_key": "execute_task",
        "node_type": "agent",
        "title": "Execute task",
        "description": "Execute safe agent/db read/tool tasks, or route risky work to approval_gate.",
        "handler_key": "execute_plan_task",
        "sort_order": 40,
        "risk_level": "medium",
        "requires_approval": 0,
        "timeout_ms": 120000,
        "input_schema_json": {"task_id": "string", "execution_step_id": "string"},
        "output_schema_json": {"status": "success|failed|approval_required|skipped", "output": "string"},
        "quality_gate_json": {"no_raw_terminal_without_approval": True},
    },
    {
        "node_key": "approval_gate",
        "node_type": "approval_gate",
        "title": "Approval gate",
        "description": "Create command_run + approval_queue rows for risky terminal/db/deploy work and wait for explicit Allow/Deny.",
        "handler_key": "approval_queue",
        "sort_order": 50,
        "risk_level": "high",
        "requires_approval": 1,
        "timeout_ms": 300000,
        "input_schema_json": {"task_id": "string", "execution_step_id": "string", "command_preview": "string"},
        "output_schema_json": {"approval_id": "string", "command_run_id": "string", "status": "pending|approved|denied|expired"},
        "quality_gate_json": {"approval_source": "agentsam_approval_queue.status='approved'"},
    },
    {
        "node_key": "resume_approved_task",
        "node_type": "terminal",
        "title": "Resume approved task",
        "description": "After approval verification, resume and execute the exact approved terminal/db/deploy task.",
        "handler_key": "resume_approved_plan_task",
        "sort_order": 60,
        "risk_level": "high",
        "requires_approval": 1,
        "timeout_ms": 300000,
        "input_schema_json": {"approval_id": "string", "command_run_id": "string", "execution_step_id": "string"},
        "output_schema_json": {"exit_code": "number", "stdout": "string", "stderr": "string"},
        "quality_gate_json": {
            "forbidden": ["approval_status_not_required_as_proof", "frontend_state_as_approval"],
            "must_verify": ["approval_queue.status", "expires_at", "command_run_id", "execution_step_id"],
        },
    },
    {
        "node_key": "rollup_run",
        "node_type": "db_query",
        "title": "Roll up run",
        "description": "Roll up plan tasks, execution steps, workflow_run status, metrics, and final SSE summary.",
        "handler_key": "rollup_plan_workflow_run",
        "sort_order": 70,
        "risk_level": "low",
        "requires_approval": 0,
        "timeout_ms": 30000,
        "input_schema_json": {"workflow_run_id": "string", "plan_id": "string"},
        "output_schema_json": {"status": "completed|failed|cancelled|timeout|running", "summary": "object"},
        "quality_gate_json": {"write_metrics": True, "update_plan_counts": True},
    },
]

EDGE_SPECS = [
    {
        "from_node_key": "classify_goal",
        "to_node_key": "create_plan",
        "condition_type": "status",
        "condition_json": {"when": "work_goal"},
        "priority": 10,
        "is_fallback": 0,
        "label": "work goal",
    },
    {
        "from_node_key": "create_plan",
        "to_node_key": "create_execution_steps",
        "condition_type": "status",
        "condition_json": {"when": "plan_created"},
        "priority": 20,
        "is_fallback": 0,
        "label": "persist plan",
    },
    {
        "from_node_key": "create_execution_steps",
        "to_node_key": "execute_task",
        "condition_type": "status",
        "condition_json": {"when": "steps_created"},
        "priority": 30,
        "is_fallback": 0,
        "label": "run tasks",
    },
    {
        "from_node_key": "execute_task",
        "to_node_key": "approval_gate",
        "condition_type": "risk",
        "condition_json": {"risk_level": ["high", "critical"], "requires_approval": True},
        "priority": 40,
        "is_fallback": 0,
        "label": "approval needed",
    },
    {
        "from_node_key": "approval_gate",
        "to_node_key": "resume_approved_task",
        "condition_type": "manual",
        "condition_json": {"approval_status": "approved"},
        "priority": 50,
        "is_fallback": 0,
        "label": "user allowed",
    },
    {
        "from_node_key": "execute_task",
        "to_node_key": "rollup_run",
        "condition_type": "status",
        "condition_json": {"when": ["success", "failed", "skipped", "approval_required"]},
        "priority": 60,
        "is_fallback": 1,
        "label": "roll up task result",
    },
    {
        "from_node_key": "resume_approved_task",
        "to_node_key": "rollup_run",
        "condition_type": "status",
        "condition_json": {"when": ["success", "failed"]},
        "priority": 70,
        "is_fallback": 0,
        "label": "roll up resumed task",
    },
]


# ---------------------------------------------------------------------------
# command helpers
# ---------------------------------------------------------------------------

def run_cmd(cmd: List[str], timeout: int = 120) -> Dict[str, Any]:
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


def d1_sql(sql: str, timeout: int = 120) -> Dict[str, Any]:
    cmd = ["npx", "wrangler", "d1", "execute", D1_DB]
    if D1_REMOTE:
        cmd.append("--remote")
    cmd.extend(["-c", WRANGLER_CONFIG, "--json", "--command", sql])
    return run_cmd(cmd, timeout=timeout)


def d1_file(path: Path, timeout: int = 180) -> Dict[str, Any]:
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


def rows(result: Dict[str, Any]) -> List[Dict[str, Any]]:
    parsed = parse_jsonish(result.get("stdout", ""))
    if isinstance(parsed, list) and parsed:
        return parsed[0].get("results") or parsed[0].get("result") or []
    if isinstance(parsed, dict):
        return parsed.get("results") or parsed.get("result") or []
    return []


def sql_quote(v: Any) -> str:
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, int) or isinstance(v, float):
        return str(v)
    if isinstance(v, (dict, list)):
        v = json.dumps(v, separators=(",", ":"), sort_keys=True)
    s = str(v)
    return "'" + s.replace("'", "''") + "'"


def schema(table: str) -> Dict[str, Any]:
    res = d1_sql(f"PRAGMA table_info({table});")
    r = rows(res)
    return {
        "table": table,
        "exists": bool(r),
        "columns": r,
        "column_names": [x.get("name") for x in r],
        "notnull": [x.get("name") for x in r if x.get("notnull")],
        "pk": [x.get("name") for x in r if x.get("pk")],
        "stderr": res.get("stderr", "")[-1000:],
    }


def table_count(table: str) -> Dict[str, Any]:
    res = d1_sql(f"SELECT COUNT(*) AS count FROM {table};")
    r = rows(res)
    return {
        "ok": res.get("ok"),
        "count": r[0].get("count") if r else None,
        "stderr": res.get("stderr", "")[-500:],
    }


# ---------------------------------------------------------------------------
# schema-aware SQL generation
# ---------------------------------------------------------------------------

def col_value_for_workflow(col: str, spec: Dict[str, Any]) -> Any:
    mapping = {
        "id": spec["id"],
        "tenant_id": spec["tenant_id"],
        "workspace_id": spec["workspace_id"],
        "workflow_key": spec["workflow_key"],
        "display_name": spec["display_name"],
        "description": spec["description"],
        "workflow_type": spec["workflow_type"],
        "trigger_type": spec["trigger_type"],
        "default_mode": spec["default_mode"],
        "default_task_type": spec["default_task_type"],
        "risk_level": spec["risk_level"],
        "requires_approval": spec["requires_approval"],
        "max_concurrent_nodes": spec["max_concurrent_nodes"],
        "timeout_ms": spec["timeout_ms"],
        "quality_gate_json": spec["quality_gate_json"],
        "metadata_json": spec["metadata_json"],
        "is_active": spec["is_active"],
        "is_platform_global": spec["is_platform_global"],
    }
    if col in {"created_at", "updated_at"}:
        return "__DATETIME__"
    return mapping.get(col)


def col_value_for_node(col: str, spec: Dict[str, Any], workflow_id: str) -> Any:
    node_id = f"wnode_{WORKFLOW_KEY}_{spec['node_key']}"
    mapping = {
        "id": node_id,
        "workflow_id": workflow_id,
        "node_key": spec["node_key"],
        "node_type": spec["node_type"],
        "title": spec["title"],
        "description": spec["description"],
        "handler_key": spec["handler_key"],
        "input_schema_json": spec["input_schema_json"],
        "output_schema_json": spec["output_schema_json"],
        "timeout_ms": spec["timeout_ms"],
        "retry_policy_json": {"max_retries": 2, "backoff": "exponential", "delay_ms": 1000},
        "quality_gate_json": spec["quality_gate_json"],
        "risk_level": spec["risk_level"],
        "requires_approval": spec["requires_approval"],
        "is_active": 1,
        "sort_order": spec["sort_order"],
    }
    if col in {"created_at", "updated_at"}:
        return "__DATETIME__"
    return mapping.get(col)


def col_value_for_edge(col: str, spec: Dict[str, Any], workflow_id: str) -> Any:
    edge_id = f"wedge_{WORKFLOW_KEY}_{spec['from_node_key']}_to_{spec['to_node_key']}"
    mapping = {
        "id": edge_id,
        "workflow_id": workflow_id,
        "from_node_key": spec["from_node_key"],
        "to_node_key": spec["to_node_key"],
        "condition_json": spec["condition_json"],
        "condition_type": spec["condition_type"],
        "priority": spec["priority"],
        "is_fallback": spec["is_fallback"],
        "label": spec["label"],
    }
    if col == "created_at":
        return "__DATETIME__"
    return mapping.get(col)


def insert_or_ignore(table: str, cols: List[str], notnull: List[str], value_fn) -> str:
    insert_cols: List[str] = []
    values: List[Any] = []

    # Start with actual table order so SQL is stable.
    for col in cols:
        value = value_fn(col)
        if value is None and col in notnull and col != "id":
            # Last resort for unknown required fields.
            value = ""
        if value is None:
            continue
        insert_cols.append(col)
        values.append(value)

    if not insert_cols:
        raise RuntimeError(f"No insertable columns for {table}")

    value_sql = []
    for v in values:
        if v == "__DATETIME__":
            value_sql.append("datetime('now')")
        elif v == "__UNIXEPOCH__":
            value_sql.append("unixepoch()")
        else:
            value_sql.append(sql_quote(v))

    return f"INSERT OR IGNORE INTO {table} ({', '.join(insert_cols)}) VALUES ({', '.join(value_sql)});"


def update_existing(table: str, key_where: str, cols: List[str], value_fn, skip_cols: Optional[set] = None) -> Optional[str]:
    skip_cols = skip_cols or {"id", "created_at"}
    sets: List[str] = []
    for col in cols:
        if col in skip_cols:
            continue
        value = value_fn(col)
        if value is None:
            continue
        if value == "__DATETIME__":
            sets.append(f"{col}=datetime('now')")
        elif value == "__UNIXEPOCH__":
            sets.append(f"{col}=unixepoch()")
        else:
            sets.append(f"{col}={sql_quote(value)}")
    if not sets:
        return None
    return f"UPDATE {table} SET {', '.join(sets)} WHERE {key_where};"


def generate_sql(schemas: Dict[str, Any]) -> str:
    required = ["agentsam_workflows", "agentsam_workflow_nodes", "agentsam_workflow_edges"]
    missing = [t for t in required if not schemas.get(t, {}).get("exists")]
    if missing:
        raise RuntimeError(f"Missing required tables: {missing}")

    wf_cols = schemas["agentsam_workflows"]["column_names"]
    wf_notnull = schemas["agentsam_workflows"]["notnull"]
    node_cols = schemas["agentsam_workflow_nodes"]["column_names"]
    node_notnull = schemas["agentsam_workflow_nodes"]["notnull"]
    edge_cols = schemas["agentsam_workflow_edges"]["column_names"]
    edge_notnull = schemas["agentsam_workflow_edges"]["notnull"]

    wf_id = WORKFLOW_SPEC["id"]
    lines = [
        "-- Agent Sam Cursor-quality planner workflow template",
        "-- Generated by agentsam-agent-chat-plan-workflow.py",
        "-- This is schema-aware SQL using existing columns only.",
        "",
        "BEGIN TRANSACTION;",
        "",
        "-- Workflow template",
    ]

    lines.append(insert_or_ignore(
        "agentsam_workflows",
        wf_cols,
        wf_notnull,
        lambda col: col_value_for_workflow(col, WORKFLOW_SPEC),
    ))

    wf_update = update_existing(
        "agentsam_workflows",
        f"id={sql_quote(wf_id)}",
        wf_cols,
        lambda col: col_value_for_workflow(col, WORKFLOW_SPEC),
        skip_cols={"id", "created_at"},
    )
    if wf_update:
        lines.append(wf_update)

    lines.append("")
    lines.append("-- Workflow nodes")
    for spec in NODE_SPECS:
        lines.append(insert_or_ignore(
            "agentsam_workflow_nodes",
            node_cols,
            node_notnull,
            lambda col, spec=spec: col_value_for_node(col, spec, wf_id),
        ))
        node_update = update_existing(
            "agentsam_workflow_nodes",
            f"workflow_id={sql_quote(wf_id)} AND node_key={sql_quote(spec['node_key'])}",
            node_cols,
            lambda col, spec=spec: col_value_for_node(col, spec, wf_id),
            skip_cols={"id", "workflow_id", "node_key", "created_at"},
        )
        if node_update:
            lines.append(node_update)

    lines.append("")
    lines.append("-- Workflow edges")
    for spec in EDGE_SPECS:
        lines.append(insert_or_ignore(
            "agentsam_workflow_edges",
            edge_cols,
            edge_notnull,
            lambda col, spec=spec: col_value_for_edge(col, spec, wf_id),
        ))
        edge_update = update_existing(
            "agentsam_workflow_edges",
            f"workflow_id={sql_quote(wf_id)} AND from_node_key={sql_quote(spec['from_node_key'])} AND to_node_key={sql_quote(spec['to_node_key'])}",
            edge_cols,
            lambda col, spec=spec: col_value_for_edge(col, spec, wf_id),
            skip_cols={"id", "workflow_id", "from_node_key", "to_node_key", "created_at"},
        )
        if edge_update:
            lines.append(edge_update)

    lines.extend([
        "",
        "COMMIT;",
        "",
    ])
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# validation queries
# ---------------------------------------------------------------------------

def validate() -> Dict[str, Any]:
    out: Dict[str, Any] = {}

    out["workflow"] = rows(d1_sql(f"""
SELECT id, workflow_key, display_name, workflow_type, trigger_type, risk_level, requires_approval, is_active
FROM agentsam_workflows
WHERE workflow_key={sql_quote(WORKFLOW_KEY)}
ORDER BY updated_at DESC
LIMIT 10;
""".strip()))

    out["nodes"] = rows(d1_sql(f"""
SELECT n.node_key, n.node_type, n.title, n.handler_key, n.risk_level, n.requires_approval, n.sort_order
FROM agentsam_workflow_nodes n
JOIN agentsam_workflows w ON w.id = n.workflow_id
WHERE w.workflow_key={sql_quote(WORKFLOW_KEY)}
ORDER BY n.sort_order, n.node_key;
""".strip()))

    out["edges"] = rows(d1_sql(f"""
SELECT e.from_node_key, e.to_node_key, e.condition_type, e.priority, e.is_fallback, e.label
FROM agentsam_workflow_edges e
JOIN agentsam_workflows w ON w.id = e.workflow_id
WHERE w.workflow_key={sql_quote(WORKFLOW_KEY)}
ORDER BY e.priority, e.from_node_key, e.to_node_key;
""".strip()))

    out["spine"] = rows(d1_sql("""
SELECT
  COUNT(*) AS step_count,
  SUM(CASE WHEN wr.id IS NULL THEN 1 ELSE 0 END) AS orphan_workflow_steps
FROM agentsam_execution_steps s
LEFT JOIN agentsam_workflow_runs wr ON wr.id = s.execution_id;
""".strip()))

    out["recent_plan_linkage"] = rows(d1_sql("""
SELECT
  p.id,
  p.title,
  p.status,
  p.workflow_run_id,
  COUNT(t.id) AS tasks,
  SUM(CASE WHEN t.execution_step_id IS NOT NULL THEN 1 ELSE 0 END) AS tasks_with_steps,
  SUM(CASE WHEN t.workflow_run_id IS NOT NULL THEN 1 ELSE 0 END) AS tasks_with_wrun
FROM agentsam_plans p
LEFT JOIN agentsam_plan_tasks t ON t.plan_id = p.id
GROUP BY p.id
ORDER BY p.created_at DESC
LIMIT 10;
""".strip()))

    out["recent_workflow_run_details"] = rows(d1_sql("""
SELECT
  wr.id,
  wr.workflow_key,
  wr.status,
  wr.created_at,
  COUNT(s.id) AS steps,
  SUM(CASE WHEN s.status IN ('success','completed','done') THEN 1 ELSE 0 END) AS done_steps,
  SUM(CASE WHEN s.status IN ('failed','error') THEN 1 ELSE 0 END) AS failed_steps,
  SUM(CASE WHEN s.status IN ('running','in_progress') THEN 1 ELSE 0 END) AS running_steps
FROM agentsam_workflow_runs wr
LEFT JOIN agentsam_execution_steps s ON s.execution_id = wr.id
GROUP BY wr.id
ORDER BY wr.created_at DESC
LIMIT 20;
""".strip()))

    expected_nodes = {n["node_key"] for n in NODE_SPECS}
    actual_nodes = {n.get("node_key") for n in out["nodes"]}
    expected_edges = {(e["from_node_key"], e["to_node_key"]) for e in EDGE_SPECS}
    actual_edges = {(e.get("from_node_key"), e.get("to_node_key")) for e in out["edges"]}

    out["checks"] = {
        "workflow_exists": len(out["workflow"]) >= 1,
        "has_all_nodes": expected_nodes.issubset(actual_nodes),
        "missing_nodes": sorted(list(expected_nodes - actual_nodes)),
        "has_all_edges": expected_edges.issubset(actual_edges),
        "missing_edges": sorted([f"{a}->{b}" for a, b in expected_edges - actual_edges]),
        "orphan_workflow_steps": (out["spine"][0].get("orphan_workflow_steps") if out["spine"] else None),
    }

    return out


def markdown_report(report: Dict[str, Any]) -> str:
    lines = []
    lines.append("# Agent Sam Agent Chat Plan Workflow Template Report")
    lines.append("")
    lines.append(f"Generated: `{report['generated_at']}`")
    lines.append(f"Workflow key: `{WORKFLOW_KEY}`")
    lines.append(f"Tenant: `{TENANT_ID}`")
    lines.append(f"Workspace: `{WORKSPACE_ID}`")
    lines.append("")
    lines.append("## Checks")
    lines.append("")
    for k, v in report["validation"].get("checks", {}).items():
        lines.append(f"- `{k}`: `{v}`")
    lines.append("")
    lines.append("## Workflow rows")
    lines.append("")
    lines.append("```json")
    lines.append(json.dumps(report["validation"].get("workflow", []), indent=2))
    lines.append("```")
    lines.append("")
    lines.append("## Nodes")
    lines.append("")
    lines.append("| node_key | node_type | handler_key | risk | approval |")
    lines.append("|---|---|---|---|---:|")
    for n in report["validation"].get("nodes", []):
        lines.append(f"| `{n.get('node_key')}` | `{n.get('node_type')}` | `{n.get('handler_key')}` | `{n.get('risk_level')}` | {n.get('requires_approval')} |")
    lines.append("")
    lines.append("## Edges")
    lines.append("")
    lines.append("| from | to | condition | label |")
    lines.append("|---|---|---|---|")
    for e in report["validation"].get("edges", []):
        lines.append(f"| `{e.get('from_node_key')}` | `{e.get('to_node_key')}` | `{e.get('condition_type')}` | {e.get('label')} |")
    lines.append("")
    lines.append("## Spine")
    lines.append("")
    lines.append("```json")
    lines.append(json.dumps(report["validation"].get("spine", []), indent=2))
    lines.append("```")
    lines.append("")
    lines.append("## Next implementation standard")
    lines.append("")
    lines.append("New planner runs must follow:")
    lines.append("")
    lines.append("```text")
    lines.append("agentsam_workflows.workflow_key='agent_chat_plan'")
    lines.append("  -> agentsam_workflow_runs.workflow_id = agentsam_workflows.id")
    lines.append("  -> agentsam_plans.workflow_run_id = agentsam_workflow_runs.id")
    lines.append("  -> agentsam_plan_tasks.workflow_run_id = agentsam_workflow_runs.id")
    lines.append("  -> agentsam_plan_tasks.execution_step_id = agentsam_execution_steps.id")
    lines.append("  -> agentsam_execution_steps.execution_id = agentsam_workflow_runs.id")
    lines.append("  -> approval_queue.execution_step_id / command_run_id for risky work")
    lines.append("```")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Apply generated SQL to D1.")
    parser.add_argument("--validate-only", action="store_true", help="Only validate; do not generate/apply SQL.")
    args = parser.parse_args()

    ARTIFACTS.mkdir(parents=True, exist_ok=True)

    print("Agent Sam Agent Chat Plan Workflow Installer")
    print(f"repo: {REPO_ROOT}")
    print(f"d1: {D1_DB} remote={D1_REMOTE} config={WRANGLER_CONFIG}")
    print(f"workflow_key: {WORKFLOW_KEY}")
    print(f"tenant_id: {TENANT_ID}")
    print(f"workspace_id: {WORKSPACE_ID}")
    print("")

    if not wrangler_ready():
        print("[FAIL] npx or wrangler config missing. Run from repo root.")
        return 2

    print("[1/5] Inspecting schemas...")
    schemas: Dict[str, Any] = {}
    counts: Dict[str, Any] = {}
    for table in TARGET_TABLES:
        schemas[table] = schema(table)
        counts[table] = table_count(table) if schemas[table]["exists"] else {"count": None}
        print(f"  {'OK' if schemas[table]['exists'] else 'MISS'} {table} rows={counts[table].get('count')}")

    sql_text = ""
    apply_result = None

    if not args.validate_only:
        print("[2/5] Generating schema-aware SQL...")
        sql_text = generate_sql(schemas)
        SQL_PATH.write_text(sql_text)
        print(f"  wrote {SQL_PATH}")

        if args.apply:
            print("[3/5] Applying SQL...")
            apply_result = d1_file(SQL_PATH)
            print(apply_result.get("stdout", ""))
            if not apply_result["ok"]:
                print(apply_result.get("stderr", ""), file=sys.stderr)
                # still validate/report
        else:
            print("[3/5] Dry-run only. Apply with:")
            print(f"  python3 scripts/agentsam-agent-chat-plan-workflow.py --apply")
    else:
        print("[2/5] Validate-only mode; skipping SQL generation.")
        print("[3/5] Skipping apply.")

    print("[4/5] Validating installed workflow/template/spine...")
    validation = validate()
    checks = validation.get("checks", {})
    for k, v in checks.items():
        print(f"  {k}: {v}")

    report = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "config": {
            "d1_db": D1_DB,
            "wrangler_config": WRANGLER_CONFIG,
            "d1_remote": D1_REMOTE,
            "tenant_id": TENANT_ID,
            "workspace_id": WORKSPACE_ID,
            "workflow_key": WORKFLOW_KEY,
        },
        "schemas": schemas,
        "counts": counts,
        "workflow_spec": WORKFLOW_SPEC,
        "node_specs": NODE_SPECS,
        "edge_specs": EDGE_SPECS,
        "sql_path": str(SQL_PATH),
        "apply_result": apply_result,
        "validation": validation,
    }

    print("[5/5] Writing reports...")
    REPORT_PATH.write_text(json.dumps(report, indent=2, sort_keys=True))
    MD_PATH.write_text(markdown_report(report))
    print(f"  wrote {REPORT_PATH}")
    print(f"  wrote {MD_PATH}")

    failed = []
    if not checks.get("workflow_exists"):
        failed.append("workflow_exists")
    if not checks.get("has_all_nodes"):
        failed.append("has_all_nodes")
    if not checks.get("has_all_edges"):
        failed.append("has_all_edges")
    if checks.get("orphan_workflow_steps") not in (0, "0", None):
        failed.append("orphan_workflow_steps")

    if apply_result and not apply_result["ok"]:
        failed.append("apply_sql")

    if failed:
        print("")
        print(f"[FAIL] checks failed: {failed}")
        return 2

    if args.apply:
        print("")
        print("[PASS] Workflow template applied and validated.")
    else:
        print("")
        print("[PASS] Dry-run/validation complete. SQL ready to apply.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
