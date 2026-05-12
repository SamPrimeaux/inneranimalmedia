#!/usr/bin/env python3
"""
Agent Sam TRUE E2E Workflow Runner v2

This script is intentionally boring and hard to break.

It does the actual end-to-end D1 proof:

  1. Validate installed agent_chat_plan workflow template.
  2. Backup relevant rows locally.
  3. Create a real agentsam_workflow_runs row.
  4. Create a real agentsam_plans row linked to that workflow run.
  5. Create real agentsam_execution_steps rows where:
       agentsam_execution_steps.execution_id = agentsam_workflow_runs.id
  6. Create real agentsam_plan_tasks rows linked to:
       agentsam_plan_tasks.workflow_run_id = agentsam_workflow_runs.id
       agentsam_plan_tasks.execution_step_id = agentsam_execution_steps.id
  7. Create an approval-backed terminal proposal:
       agentsam_command_run
       agentsam_approval_queue.command_run_id
       agentsam_approval_queue.execution_step_id
  8. Validate all joins.
  9. Generate Supabase parity SQL for:
       public.agentsam_workflows
       public.agentsam_workflow_runs
       public.agentsam_workflow_steps
       public.agentsam_workflow_events
       public.agentsam_debug_snapshots

It does NOT run terminal commands.
It does NOT approve anything automatically.
It does NOT use BEGIN/COMMIT.
It does NOT use --file for D1 apply.
It applies D1 one statement at a time with --command so the exact failing statement is visible.

Run:
  python3 scripts/agentsam-true-e2e-workflow-runner.py --run

Plan only:
  python3 scripts/agentsam-true-e2e-workflow-runner.py --plan

Generate Supabase SQL after D1 run:
  python3 scripts/agentsam-true-e2e-workflow-runner.py --run --supabase-sql

Optional Supabase apply through local psql:
  SUPABASE_DB_URL="postgresql://..." python3 scripts/agentsam-true-e2e-workflow-runner.py --run --supabase-sql --apply-supabase

Environment:
  IAM_D1_DB=inneranimalmedia-business
  IAM_WRANGLER_CONFIG=wrangler.production.toml
  IAM_D1_REMOTE=1
  IAM_TENANT_ID=tenant_sam_primeaux
  IAM_WORKSPACE_ID=global
  IAM_USER_ID=sam_primeaux
  IAM_WORKFLOW_ID=wf_agent_chat_plan
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
from typing import Any, Dict, List, Optional


ROOT = Path.cwd()
ARTIFACTS = ROOT / "artifacts"
BACKUPS = ARTIFACTS / "backups"

D1_DB = os.getenv("IAM_D1_DB", "inneranimalmedia-business")
WRANGLER_CONFIG = os.getenv("IAM_WRANGLER_CONFIG", "wrangler.production.toml")
D1_REMOTE = os.getenv("IAM_D1_REMOTE", "1") not in {"0", "false", "False", "no"}

TENANT_ID = os.getenv("IAM_TENANT_ID", "tenant_sam_primeaux")
WORKSPACE_ID = os.getenv("IAM_WORKSPACE_ID", "global")
USER_ID = os.getenv("IAM_USER_ID", "sam_primeaux")
WORKFLOW_ID = os.getenv("IAM_WORKFLOW_ID", "wf_agent_chat_plan")
WORKFLOW_KEY = os.getenv("IAM_WORKFLOW_KEY", "agent_chat_plan")

REPORT_JSON = ARTIFACTS / "agentsam-true-e2e-workflow-runner-report.json"
REPORT_MD = ARTIFACTS / "agentsam-true-e2e-workflow-runner-report.md"
D1_SQL_LOG = ARTIFACTS / "agentsam-true-e2e-workflow-runner-d1-statements.sql"
SUPABASE_SQL = ARTIFACTS / "agentsam-true-e2e-workflow-runner-supabase.sql"

D1_TABLES = [
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

REQUIRED_TEMPLATE_NODES = [
    "classify_goal",
    "create_plan",
    "create_execution_steps",
    "execute_task",
    "approval_gate",
    "resume_approved_task",
    "rollup_run",
]


def run_cmd(cmd: List[str], timeout: int = 120, input_text: Optional[str] = None) -> Dict[str, Any]:
    start = time.time()
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(ROOT),
            input=input_text,
            text=True,
            capture_output=True,
            timeout=timeout,
        )
        return {
            "ok": proc.returncode == 0,
            "returncode": proc.returncode,
            "stdout": proc.stdout,
            "stderr": proc.stderr,
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


def require_ready() -> None:
    if not shutil.which("npx"):
        raise SystemExit("[FAIL] npx not found")
    if not (ROOT / WRANGLER_CONFIG).exists():
        raise SystemExit(f"[FAIL] {WRANGLER_CONFIG} not found. Run from repo root.")


def d1_cmd_base() -> List[str]:
    cmd = ["npx", "wrangler", "d1", "execute", D1_DB]
    if D1_REMOTE:
        cmd.append("--remote")
    cmd.extend(["-c", WRANGLER_CONFIG])
    return cmd


def d1_sql(sql: str, *, json_out: bool = True, timeout: int = 120) -> Dict[str, Any]:
    cmd = d1_cmd_base()
    if json_out:
        cmd.append("--json")
    cmd.extend(["--command", sql])
    return run_cmd(cmd, timeout=timeout)


def parse_rows(res: Dict[str, Any]) -> List[Dict[str, Any]]:
    text = (res.get("stdout") or "").strip()
    if not text:
        return []
    try:
        parsed = json.loads(text)
    except Exception:
        # Wrangler sometimes prints decoration before JSON.
        first = min([i for i in [text.find("["), text.find("{")] if i >= 0], default=-1)
        if first < 0:
            return []
        try:
            parsed = json.loads(text[first:])
        except Exception:
            return []
    if isinstance(parsed, list) and parsed:
        first = parsed[0]
        if isinstance(first, dict):
            return first.get("results") or first.get("result") or []
    if isinstance(parsed, dict):
        return parsed.get("results") or parsed.get("result") or []
    return []


def q(v: Any) -> str:
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, (dict, list)):
        v = json.dumps(v, separators=(",", ":"), sort_keys=True)
    s = str(v)
    return "'" + s.replace("'", "''") + "'"


def pq(v: Any) -> str:
    """Postgres SQL quote"""
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, (dict, list)):
        v = json.dumps(v, separators=(",", ":"), sort_keys=True)
    s = str(v)
    return "'" + s.replace("'", "''") + "'"


def now_suffix() -> str:
    return time.strftime("%Y%m%d%H%M%S", time.gmtime())


def schema(table: str) -> Dict[str, Any]:
    res = d1_sql(f"PRAGMA table_info({table});")
    rows = parse_rows(res)
    return {
        "table": table,
        "exists": bool(rows),
        "columns": rows,
        "column_names": [r.get("name") for r in rows],
        "notnull": [r.get("name") for r in rows if r.get("notnull")],
    }


def has_col(schemas: Dict[str, Any], table: str, col: str) -> bool:
    return col in schemas.get(table, {}).get("column_names", [])


def count_table(table: str) -> Optional[int]:
    res = d1_sql(f"SELECT COUNT(*) AS n FROM {table};")
    rows = parse_rows(res)
    return rows[0].get("n") if rows else None


def inspect_schemas() -> Dict[str, Any]:
    out = {}
    for table in D1_TABLES:
        out[table] = schema(table)
    return out


def validate_template() -> Dict[str, Any]:
    workflow = parse_rows(d1_sql(f"""
SELECT id, workflow_key, display_name, workflow_type, trigger_type, is_active
FROM agentsam_workflows
WHERE id={q(WORKFLOW_ID)} OR workflow_key={q(WORKFLOW_KEY)}
ORDER BY updated_at DESC
LIMIT 5;
"""))

    nodes = parse_rows(d1_sql(f"""
SELECT n.node_key, n.node_type, n.title, n.handler_key, n.risk_level, n.requires_approval, n.sort_order
FROM agentsam_workflow_nodes n
JOIN agentsam_workflows w ON w.id=n.workflow_id
WHERE w.workflow_key={q(WORKFLOW_KEY)}
ORDER BY n.sort_order, n.node_key;
"""))

    edges = parse_rows(d1_sql(f"""
SELECT e.from_node_key, e.to_node_key, e.condition_type, e.priority, e.is_fallback, e.label
FROM agentsam_workflow_edges e
JOIN agentsam_workflows w ON w.id=e.workflow_id
WHERE w.workflow_key={q(WORKFLOW_KEY)}
ORDER BY e.priority, e.from_node_key, e.to_node_key;
"""))

    spine = parse_rows(d1_sql("""
SELECT
  COUNT(*) AS step_count,
  SUM(CASE WHEN wr.id IS NULL THEN 1 ELSE 0 END) AS orphan_workflow_steps
FROM agentsam_execution_steps s
LEFT JOIN agentsam_workflow_runs wr ON wr.id=s.execution_id;
"""))

    actual = {n.get("node_key") for n in nodes}
    missing = [n for n in REQUIRED_TEMPLATE_NODES if n not in actual]
    return {
        "workflow": workflow,
        "nodes": nodes,
        "edges": edges,
        "spine": spine,
        "checks": {
            "workflow_exists": bool(workflow),
            "has_required_nodes": len(missing) == 0,
            "missing_nodes": missing,
            "orphan_workflow_steps": spine[0].get("orphan_workflow_steps") if spine else None,
        },
    }


def backup() -> Path:
    bdir = BACKUPS / f"true_e2e_{now_suffix()}"
    bdir.mkdir(parents=True, exist_ok=True)
    queries = {
        "agent_chat_plan_workflow.json": f"SELECT * FROM agentsam_workflows WHERE id={q(WORKFLOW_ID)} OR workflow_key={q(WORKFLOW_KEY)};",
        "agent_chat_plan_nodes.json": f"""
SELECT n.* FROM agentsam_workflow_nodes n
JOIN agentsam_workflows w ON w.id=n.workflow_id
WHERE w.workflow_key={q(WORKFLOW_KEY)}
ORDER BY n.sort_order, n.node_key;
""",
        "agent_chat_plan_edges.json": f"""
SELECT e.* FROM agentsam_workflow_edges e
JOIN agentsam_workflows w ON w.id=e.workflow_id
WHERE w.workflow_key={q(WORKFLOW_KEY)}
ORDER BY e.priority, e.from_node_key, e.to_node_key;
""",
        "recent_agent_chat_plan_runs.json": f"""
SELECT * FROM agentsam_workflow_runs
WHERE workflow_id={q(WORKFLOW_ID)} OR workflow_key={q(WORKFLOW_KEY)}
ORDER BY created_at DESC LIMIT 20;
""",
    }
    for name, sql in queries.items():
        res = d1_sql(sql)
        (bdir / name).write_text(res.get("stdout", "") or json.dumps(res, indent=2))

    (bdir / "rollback_agent_chat_plan_template.sql").write_text(f"""-- Do not run if workflow runs depend on this template.
DELETE FROM agentsam_workflow_edges WHERE workflow_id={q(WORKFLOW_ID)};
DELETE FROM agentsam_workflow_nodes WHERE workflow_id={q(WORKFLOW_ID)};
DELETE FROM agentsam_workflows WHERE id={q(WORKFLOW_ID)} AND workflow_key={q(WORKFLOW_KEY)};
""")
    return bdir


def insert_sql(table: str, values: Dict[str, Any], schemas: Dict[str, Any]) -> str:
    cols = [c for c in values.keys() if has_col(schemas, table, c)]
    if not cols:
        raise ValueError(f"No matching columns for {table}")
    return f"INSERT OR IGNORE INTO {table} ({', '.join(cols)}) VALUES ({', '.join(q(values[c]) for c in cols)});"


def update_sql(table: str, values: Dict[str, Any], where: str, schemas: Dict[str, Any]) -> Optional[str]:
    parts = []
    for c, v in values.items():
        if has_col(schemas, table, c):
            parts.append(f"{c}={q(v)}")
    if not parts:
        return None
    return f"UPDATE {table} SET {', '.join(parts)} WHERE {where};"


def build_true_e2e_statements(schemas: Dict[str, Any]) -> Dict[str, Any]:
    suffix = now_suffix()
    run_id = f"wrun_true_e2e_{suffix}"
    plan_id = f"plan_true_e2e_{suffix}"
    command_run_id = f"run_true_e2e_{suffix}"
    approval_id = f"appr_true_e2e_{suffix}"

    tasks = [
        {
            "id": f"task_true_e2e_{suffix}_001_classify",
            "step_id": f"estep_true_e2e_{suffix}_001_classify",
            "order_index": 0,
            "node_key": "classify_goal",
            "node_type": "agent",
            "handler_type": "agent",
            "handler_key": "gpt-5.4-nano",
            "title": "Classify goal",
            "description": "Classify the Agent Sam E2E smoke goal.",
            "category": "backend",
            "priority": "P1",
            "risk_level": "low",
            "requires_approval": 0,
            "status": "done",
            "step_status": "success",
            "output": {"summary": "classified as work_goal", "message_type": "work_goal"},
        },
        {
            "id": f"task_true_e2e_{suffix}_002_create_steps",
            "step_id": f"estep_true_e2e_{suffix}_002_create_steps",
            "order_index": 1,
            "node_key": "create_execution_steps",
            "node_type": "db_query",
            "handler_type": "db_query",
            "handler_key": "create_plan_execution_steps",
            "title": "Create execution spine",
            "description": "Create workflow_run and execution_step linkage.",
            "category": "db",
            "priority": "P0",
            "risk_level": "medium",
            "requires_approval": 0,
            "status": "done",
            "step_status": "success",
            "output": {"summary": "workflow_run and execution_steps linked"},
        },
        {
            "id": f"task_true_e2e_{suffix}_003_terminal_proposal",
            "step_id": f"estep_true_e2e_{suffix}_003_terminal_proposal",
            "order_index": 2,
            "node_key": "approval_gate",
            "node_type": "approval_gate",
            "handler_type": "approval_gate",
            "handler_key": "approval_queue",
            "title": "Create terminal approval proposal",
            "description": "Propose a safe terminal validation command but do not execute it without approval.",
            "category": "infra",
            "priority": "P0",
            "risk_level": "high",
            "requires_approval": 1,
            "status": "skipped",
            "step_status": "running",
            "output": {"summary": "approval_required; command not executed", "command_preview": "echo agent_chat_plan_approval_gate"},
        },
        {
            "id": f"task_true_e2e_{suffix}_004_rollup",
            "step_id": f"estep_true_e2e_{suffix}_004_rollup",
            "order_index": 3,
            "node_key": "rollup_run",
            "node_type": "db_query",
            "handler_type": "db_query",
            "handler_key": "rollup_plan_workflow_run",
            "title": "Roll up run",
            "description": "Roll up the smoke run and prove D1 traceability.",
            "category": "backend",
            "priority": "P1",
            "risk_level": "low",
            "requires_approval": 0,
            "status": "done",
            "step_status": "success",
            "output": {"summary": "rollup complete with approval pending for terminal proposal"},
        },
    ]

    statements: List[str] = []

    # 1. workflow run first.
    wr_values = {
        "id": run_id,
        "workflow_id": WORKFLOW_ID,
        "workflow_key": WORKFLOW_KEY,
        "display_name": "Agent Chat Plan TRUE E2E",
        "tenant_id": TENANT_ID,
        "workspace_id": WORKSPACE_ID,
        "user_id": USER_ID,
        "session_id": f"true_e2e_{suffix}",
        "run_group_id": f"grp_true_e2e_{suffix}",
        "trigger_type": "agent",
        "status": "running",
        "input_json": {"source": "agentsam-true-e2e-workflow-runner.py", "goal": "true e2e proof", "plan_id": plan_id},
        "output_json": {},
        "step_results_json": [],
        "steps_completed": 3,
        "steps_total": len(tasks),
        "model_used": "gpt-5.4-mini",
        "input_tokens": 0,
        "output_tokens": 0,
        "cost_usd": 0,
        "environment": "production",
        "metadata_json": {"template": WORKFLOW_KEY, "spine": "workflow_runs.id -> execution_steps.execution_id"},
        "started_at": int(time.time()),
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()),
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()),
        "graph_mode": 1,
        "current_node_key": "approval_gate",
        "supabase_sync_status": "pending",
    }
    statements.append(insert_sql("agentsam_workflow_runs", wr_values, schemas))

    # 2. plan second.
    plan_values = {
        "id": plan_id,
        "tenant_id": TENANT_ID,
        "workspace_id": WORKSPACE_ID,
        "session_id": f"true_e2e_{suffix}",
        "plan_date": time.strftime("%Y-%m-%d", time.gmtime()),
        "plan_type": "feature",
        "title": f"Agent Chat Plan TRUE E2E {suffix}",
        "status": "active",
        "default_model": "gpt-5.4-mini",
        "tasks_total": len(tasks),
        "tasks_done": 3,
        "tasks_blocked": 1,
        "workflow_id": WORKFLOW_ID,
        "workflow_run_id": run_id,
        "graph_mode": 1,
        "risk_level": "medium",
        "requires_approval": 0,
        "created_at": int(time.time()),
        "updated_at": int(time.time()),
    }
    statements.append(insert_sql("agentsam_plans", plan_values, schemas))

    # 3. execution steps third.
    for t in tasks:
        step_values = {
            "id": t["step_id"],
            "execution_id": run_id,
            "node_key": t["node_key"],
            "node_type": t["node_type"],
            "status": t["step_status"],
            "input_json": {
                "plan_id": plan_id,
                "task_id": t["id"],
                "workflow_run_id": run_id,
                "handler_type": t["handler_type"],
                "handler_key": t["handler_key"],
                "title": t["title"],
                "description": t["description"],
                "risk_level": t["risk_level"],
                "requires_approval": bool(t["requires_approval"]),
                "source": "agentsam-true-e2e-workflow-runner.py",
            },
            "output_json": t["output"],
            "error_json": {},
            "latency_ms": 1,
            "tokens_in": 0,
            "tokens_out": 0,
            "cost_usd": 0,
            "quality_score": 1,
            "gate_results_json": {"e2e": True, "approval_required": bool(t["requires_approval"])},
            # FK-safe: do not set approval_id until agentsam_approval_queue exists.
            "approval_id": None,
            "attempt": 1,
            "edge_taken": "approval_gate" if t["requires_approval"] else "rollup_run",
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()),
        }
        statements.append(insert_sql("agentsam_execution_steps", step_values, schemas))

    # 4. command run before plan_tasks because plan_tasks.command_run_id FKs to it.
    command_run_values = {
        "id": command_run_id,
        "workspace_id": WORKSPACE_ID,
        "session_id": f"true_e2e_{suffix}",
        "conversation_id": f"true_e2e_{suffix}",
        "user_input": "echo agent_chat_plan_approval_gate",
        "normalized_intent": "terminal approval smoke proposal",
        "intent_category": "worker",
        "tier_used": 0,
        "model_id": "gpt-5.4-mini",
        "commands_json": [{"command": "echo agent_chat_plan_approval_gate", "source": "true_e2e_smoke"}],
        "result_json": {},
        "output_text": "PENDING APPROVAL: command not executed",
        "confidence_score": 1,
        "success": 0,
        "input_tokens": 0,
        "output_tokens": 0,
        "cost_usd": 0,
        "created_at": int(time.time()),
        "selected_command_slug": "agent-chat-plan-approval-smoke",
        "risk_level": "high",
        "requires_confirmation": 1,
        "approval_status": "pending_approval",
        "tenant_id": TENANT_ID,
        "user_id": USER_ID,
    }
    statements.append(insert_sql("agentsam_command_run", command_run_values, schemas))

    # 5. plan tasks after command_run because approval task references command_run_id.
    for t in tasks:
        task_values = {
            "id": t["id"],
            "tenant_id": TENANT_ID,
            "workspace_id": WORKSPACE_ID,
            "plan_id": plan_id,
            "command_run_id": command_run_id if t["requires_approval"] else None,
            "order_index": t["order_index"],
            "title": t["title"],
            "description": t["description"],
            "priority": t["priority"],
            "category": t["category"],
            "status": t["status"],
            "estimated_minutes": 5,
            "output_summary": json.dumps(t["output"], separators=(",", ":")),
            "tokens_used": 0,
            "cost_usd": 0,
            "started_at": int(time.time()),
            "completed_at": int(time.time()) if t["status"] == "done" else None,
            "created_at": int(time.time()),
            "node_key": t["node_key"],
            "execution_step_id": t["step_id"],
            "workflow_run_id": run_id,
            "handler_key": t["handler_key"],
            "handler_type": t["handler_type"],
            "risk_level": t["risk_level"],
            "requires_approval": t["requires_approval"],
            "quality_gate_json": {"e2e": True},
            "edge_taken": "approval_gate" if t["requires_approval"] else "rollup_run",
        }
        statements.append(insert_sql("agentsam_plan_tasks", task_values, schemas))



    # 6. approval queue proposal.
    approval_values = {
        "id": approval_id,
        "tenant_id": TENANT_ID,
        "workspace_id": WORKSPACE_ID,
        "user_id": USER_ID,
        "session_id": f"true_e2e_{suffix}",
        # DO NOT use plan_id because this FK may reference agentsam_plans_old.
        "workflow_run_id": run_id,
        "command_run_id": command_run_id,
        "tool_name": "terminal",
        "tool_key": "resume_approved_plan_task",
        "action_summary": "Approve running: echo agent_chat_plan_approval_gate",
        "input_json": {
            "command_preview": "echo agent_chat_plan_approval_gate",
            "plan_id": plan_id,
            "workflow_run_id": run_id,
            "execution_step_id": tasks[2]["step_id"],
            "source": "agentsam-true-e2e-workflow-runner.py",
        },
        "risk_level": "high",
        "approval_type": "terminal",
        "status": "pending",
        "expires_at": int(time.time()) + 3600,
        "created_at": int(time.time()),
        "execution_step_id": tasks[2]["step_id"],
    }
    statements.append(insert_sql("agentsam_approval_queue", approval_values, schemas))

    # 7. update approval step after approval queue exists.
    up = update_sql(
        "agentsam_execution_steps",
        {
            "approval_id": approval_id,
            "output_json": {"summary": "approval_required; command not executed", "approval_id": approval_id, "command_run_id": command_run_id},
            "gate_results_json": {"approval_required": True, "approval_id": approval_id, "command_run_id": command_run_id},
        },
        f"id={q(tasks[2]['step_id'])}",
        schemas,
    )
    if up:
        statements.append(up)

    # 8. optional metric rows if schema supports minimal fields. Keep this best-effort and schema-aware.
    if schemas.get("agentsam_execution_performance_metrics", {}).get("exists"):
        for t in tasks:
            metric_values = {
                "id": f"metric_{t['step_id']}",
                "tenant_id": TENANT_ID,
                "workspace_id": WORKSPACE_ID,
                "workflow_run_id": run_id,
                "execution_step_id": t["step_id"],
                "node_key": t["node_key"],
                "node_type": t["node_type"],
                "status": t["step_status"],
                "latency_ms": 1,
                "input_tokens": 0,
                "output_tokens": 0,
                "cost_usd": 0,
                "model_key": t["handler_key"] if t["handler_key"].startswith("gpt-") else None,
                "provider": "openai" if t["handler_key"].startswith("gpt-") else None,
                "created_at": int(time.time()),
                "metadata_json": {"source": "agentsam-true-e2e-workflow-runner.py"},
            }
            try:
                statements.append(insert_sql("agentsam_execution_performance_metrics", metric_values, schemas))
            except Exception:
                pass

    return {
        "suffix": suffix,
        "workflow_run_id": run_id,
        "plan_id": plan_id,
        "command_run_id": command_run_id,
        "approval_id": approval_id,
        "tasks": tasks,
        "statements": statements,
    }


def apply_statements(statements: List[str]) -> Dict[str, Any]:
    D1_SQL_LOG.write_text("\n\n".join(statements) + "\n")
    results = []
    for i, stmt in enumerate(statements, 1):
        print(f"    [{i}/{len(statements)}] {stmt.splitlines()[0][:90]}")
        res = d1_sql(stmt, json_out=False, timeout=120)
        results.append({
            "index": i,
            "ok": res["ok"],
            "returncode": res["returncode"],
            "stderr": res.get("stderr", "")[-2000:],
            "stdout": res.get("stdout", "")[-2000:],
            "statement": stmt,
        })
        if not res["ok"]:
            return {"ok": False, "failed_index": i, "results": results, "failed_statement": stmt, "error": res.get("stderr")}
    return {"ok": True, "results": results}


def validate_created(run_id: str, plan_id: str, approval_id: str, command_run_id: str) -> Dict[str, Any]:
    plan = parse_rows(d1_sql(f"""
SELECT
  p.id,
  p.title,
  p.status,
  p.workflow_run_id,
  COUNT(t.id) AS tasks,
  SUM(CASE WHEN t.execution_step_id IS NOT NULL THEN 1 ELSE 0 END) AS tasks_with_steps,
  SUM(CASE WHEN t.workflow_run_id IS NOT NULL THEN 1 ELSE 0 END) AS tasks_with_wrun
FROM agentsam_plans p
LEFT JOIN agentsam_plan_tasks t ON t.plan_id=p.id
WHERE p.id={q(plan_id)}
GROUP BY p.id;
"""))

    task_steps = parse_rows(d1_sql(f"""
SELECT
  t.id,
  t.plan_id,
  t.workflow_run_id,
  t.execution_step_id,
  t.status AS task_status,
  t.command_run_id,
  s.execution_id AS step_wrun_id,
  s.node_key,
  s.node_type,
  s.status AS step_status,
  s.approval_id
FROM agentsam_plan_tasks t
LEFT JOIN agentsam_execution_steps s ON s.id=t.execution_step_id
WHERE t.plan_id={q(plan_id)}
ORDER BY t.order_index;
"""))

    run = parse_rows(d1_sql(f"""
SELECT
  wr.id,
  wr.workflow_id,
  wr.workflow_key,
  wr.status,
  wr.steps_total,
  COUNT(s.id) AS steps,
  SUM(CASE WHEN s.execution_id=wr.id THEN 1 ELSE 0 END) AS steps_linked_to_run
FROM agentsam_workflow_runs wr
LEFT JOIN agentsam_execution_steps s ON s.execution_id=wr.id
WHERE wr.id={q(run_id)}
GROUP BY wr.id;
"""))

    approval = parse_rows(d1_sql(f"""
SELECT
  a.id,
  a.status,
  a.command_run_id,
  a.workflow_run_id,
  a.execution_step_id,
  a.risk_level,
  r.approval_status,
  r.user_input
FROM agentsam_approval_queue a
LEFT JOIN agentsam_command_run r ON r.id=a.command_run_id
WHERE a.id={q(approval_id)}
  AND a.command_run_id={q(command_run_id)};
"""))

    checks = {
        "plan_exists": bool(plan),
        "plan_has_workflow_run_id": bool(plan and plan[0].get("workflow_run_id") == run_id),
        "tasks_with_steps_equals_tasks": bool(plan and plan[0].get("tasks") == plan[0].get("tasks_with_steps")),
        "tasks_with_wrun_equals_tasks": bool(plan and plan[0].get("tasks") == plan[0].get("tasks_with_wrun")),
        "all_task_steps_join_to_workflow_run": bool(task_steps and all(r.get("workflow_run_id") == r.get("step_wrun_id") == run_id for r in task_steps)),
        "workflow_run_exists": bool(run),
        "run_steps_linked": bool(run and run[0].get("steps") == run[0].get("steps_linked_to_run")),
        "approval_exists": bool(approval),
        "approval_is_pending": bool(approval and approval[0].get("status") == "pending"),
        "approval_links_command_run": bool(approval and approval[0].get("command_run_id") == command_run_id),
    }

    return {
        "plan": plan,
        "task_steps": task_steps,
        "workflow_run": run,
        "approval": approval,
        "checks": checks,
    }


def fetch_template_bundle() -> Dict[str, Any]:
    workflow = parse_rows(d1_sql(f"SELECT * FROM agentsam_workflows WHERE id={q(WORKFLOW_ID)} OR workflow_key={q(WORKFLOW_KEY)} LIMIT 1;"))
    nodes = parse_rows(d1_sql(f"""
SELECT n.* FROM agentsam_workflow_nodes n
JOIN agentsam_workflows w ON w.id=n.workflow_id
WHERE w.workflow_key={q(WORKFLOW_KEY)}
ORDER BY n.sort_order, n.node_key;
"""))
    edges = parse_rows(d1_sql(f"""
SELECT e.* FROM agentsam_workflow_edges e
JOIN agentsam_workflows w ON w.id=e.workflow_id
WHERE w.workflow_key={q(WORKFLOW_KEY)}
ORDER BY e.priority, e.from_node_key, e.to_node_key;
"""))
    return {"workflow": workflow[0] if workflow else None, "nodes": nodes, "edges": edges}


def generate_supabase_sql(run_id: str) -> Dict[str, Any]:
    bundle = fetch_template_bundle()
    workflow = bundle["workflow"]
    nodes = bundle["nodes"]
    edges = bundle["edges"]

    runs = parse_rows(d1_sql(f"SELECT * FROM agentsam_workflow_runs WHERE id={q(run_id)} LIMIT 1;"))
    run = runs[0] if runs else None
    steps = parse_rows(d1_sql(f"SELECT * FROM agentsam_execution_steps WHERE execution_id={q(run_id)} ORDER BY created_at, node_key;")) if run else []

    lines = [
        "-- Supabase parity SQL generated from D1 source-of-truth.",
        "-- Tables discovered by Supabase MCP:",
        "-- public.agentsam_workflows, agentsam_workflow_runs, agentsam_workflow_steps, agentsam_workflow_events, agentsam_debug_snapshots",
        "",
    ]

    if workflow:
        definition = {"d1_workflow": workflow, "nodes": nodes, "edges": edges}
        lines.append(f"""
INSERT INTO public.agentsam_workflows (
  id, d1_workflow_id, tenant_id, workspace_id, workflow_key, name,
  description, status, trigger_type, definition_json, metadata, updated_at
) VALUES (
  {pq('sb_'+workflow.get('id'))},
  {pq(workflow.get('id'))},
  {pq(workflow.get('tenant_id') or TENANT_ID)},
  {pq(workflow.get('workspace_id') or WORKSPACE_ID)},
  {pq(workflow.get('workflow_key') or WORKFLOW_KEY)},
  {pq(workflow.get('display_name') or WORKFLOW_KEY)},
  {pq(workflow.get('description'))},
  'active',
  {pq(workflow.get('trigger_type') or 'agent')},
  {pq(definition)}::jsonb,
  {pq({"source":"d1","synced_by":"agentsam-true-e2e-workflow-runner.py"})}::jsonb,
  now()
)
ON CONFLICT (d1_workflow_id) DO UPDATE SET
  workflow_key=EXCLUDED.workflow_key,
  name=EXCLUDED.name,
  description=EXCLUDED.description,
  status=EXCLUDED.status,
  trigger_type=EXCLUDED.trigger_type,
  definition_json=EXCLUDED.definition_json,
  metadata=EXCLUDED.metadata,
  updated_at=now();
""".strip())

    if run:
        lines.append(f"""
INSERT INTO public.agentsam_workflow_runs (
  id, d1_run_id, tenant_id, workspace_id, workflow_id, workflow_key,
  display_name, trigger_type, status, input_json, output_json, step_results_json,
  steps_completed, steps_total, error_message, model_used,
  input_tokens, output_tokens, cost_usd, duration_ms, environment,
  supabase_sync_status, supabase_synced_at, session_id, user_id, run_group_id,
  metadata, updated_at
) VALUES (
  {pq(run.get('id'))},
  {pq(run.get('id'))},
  {pq(run.get('tenant_id') or TENANT_ID)},
  {pq(run.get('workspace_id') or WORKSPACE_ID)},
  {pq(run.get('workflow_id'))},
  {pq(run.get('workflow_key'))},
  {pq(run.get('display_name'))},
  {pq(run.get('trigger_type') or 'agent')},
  {pq(run.get('status') or 'running')},
  {pq(json.loads(run.get('input_json') or '{}'))}::jsonb,
  {pq(json.loads(run.get('output_json') or '{}'))}::jsonb,
  {pq(json.loads(run.get('step_results_json') or '[]'))}::jsonb,
  {pq(run.get('steps_completed') or 0)},
  {pq(run.get('steps_total') or len(steps))},
  {pq(run.get('error_message'))},
  {pq(run.get('model_used'))},
  {pq(run.get('input_tokens') or 0)},
  {pq(run.get('output_tokens') or 0)},
  {pq(run.get('cost_usd') or 0)},
  {pq(run.get('duration_ms'))},
  {pq(run.get('environment') or 'production')},
  'synced',
  now(),
  {pq(run.get('session_id'))},
  {pq(run.get('user_id'))},
  {pq(run.get('run_group_id'))},
  {pq({"source":"d1","synced_by":"agentsam-true-e2e-workflow-runner.py"})}::jsonb,
  now()
)
ON CONFLICT (id) DO UPDATE SET
  status=EXCLUDED.status,
  input_json=EXCLUDED.input_json,
  output_json=EXCLUDED.output_json,
  step_results_json=EXCLUDED.step_results_json,
  steps_completed=EXCLUDED.steps_completed,
  steps_total=EXCLUDED.steps_total,
  supabase_sync_status='synced',
  supabase_synced_at=now(),
  metadata=EXCLUDED.metadata,
  updated_at=now();
""".strip())

        for i, step in enumerate(steps):
            input_json = json.loads(step.get("input_json") or "{}")
            output_json = json.loads(step.get("output_json") or "{}")
            error_json = json.loads(step.get("error_json") or "{}")
            lines.append(f"""
INSERT INTO public.agentsam_workflow_steps (
  id, run_id, tenant_id, workspace_id, step_index, step_key, step_type,
  status, tool_key, command_key, provider, model_key,
  input_json, output_json, error_message, latency_ms, metadata, updated_at
) VALUES (
  {pq(step.get('id'))},
  {pq(run.get('id'))},
  {pq(run.get('tenant_id') or TENANT_ID)},
  {pq(run.get('workspace_id') or WORKSPACE_ID)},
  {i},
  {pq(step.get('node_key'))},
  {pq(step.get('node_type') or 'agent')},
  {pq(step.get('status'))},
  {pq(input_json.get('handler_key'))},
  {pq(input_json.get('handler_key'))},
  {pq('openai' if str(input_json.get('handler_key', '')).startswith('gpt-') else None)},
  {pq(input_json.get('handler_key') if str(input_json.get('handler_key', '')).startswith('gpt-') else None)},
  {pq(input_json)}::jsonb,
  {pq(output_json)}::jsonb,
  {pq(json.dumps(error_json) if error_json else None)},
  {pq(step.get('latency_ms'))},
  {pq({"d1_execution_id":step.get("execution_id"),"approval_id":step.get("approval_id")})}::jsonb,
  now()
)
ON CONFLICT (id) DO UPDATE SET
  status=EXCLUDED.status,
  input_json=EXCLUDED.input_json,
  output_json=EXCLUDED.output_json,
  error_message=EXCLUDED.error_message,
  latency_ms=EXCLUDED.latency_ms,
  metadata=EXCLUDED.metadata,
  updated_at=now();
""".strip())

            lines.append(f"""
INSERT INTO public.agentsam_workflow_events (
  run_id, step_id, tenant_id, workspace_id, event_type, event_level, message, payload_json
) VALUES (
  {pq(run.get('id'))},
  {pq(step.get('id'))},
  {pq(run.get('tenant_id') or TENANT_ID)},
  {pq(run.get('workspace_id') or WORKSPACE_ID)},
  {pq('step_' + str(step.get('status') or 'updated'))},
  'info',
  {pq('Step ' + str(step.get('node_key')) + ' is ' + str(step.get('status')))},
  {pq({"node_key":step.get("node_key"),"node_type":step.get("node_type"),"status":step.get("status")})}::jsonb
);
""".strip())

        lines.append(f"""
INSERT INTO public.agentsam_debug_snapshots (
  tenant_id, workspace_id, run_id, snapshot_key, source, status,
  request_json, response_json, environment_json, notes
) VALUES (
  {pq(run.get('tenant_id') or TENANT_ID)},
  {pq(run.get('workspace_id') or WORKSPACE_ID)},
  {pq(run.get('id'))},
  {pq('true_e2e_' + now_suffix())},
  'agentsam-true-e2e-workflow-runner.py',
  'captured',
  {pq({"workflow_run_id":run.get("id"),"workflow_key":run.get("workflow_key")})}::jsonb,
  {pq({"steps":len(steps),"status":run.get("status")})}::jsonb,
  {pq({"d1_db":D1_DB,"supabase_project":"dpmuvynqixblxsilnlut"})}::jsonb,
  'D1 to Supabase parity proof for Agent Sam TRUE E2E run.'
);
""".strip())

    SUPABASE_SQL.write_text("\n\n".join(lines) + "\n")
    return {"path": str(SUPABASE_SQL), "run_id": run_id, "steps": len(steps), "has_run": bool(run)}


def apply_supabase_sql() -> Dict[str, Any]:
    db_url = os.getenv("SUPABASE_DB_URL")
    if not db_url:
        return {"ok": False, "error": "SUPABASE_DB_URL not set"}
    if not shutil.which("psql"):
        return {"ok": False, "error": "psql not found"}
    return run_cmd(["psql", db_url, "-v", "ON_ERROR_STOP=1"], input_text=SUPABASE_SQL.read_text(), timeout=180)


def write_report(report: Dict[str, Any]) -> None:
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True))
    lines = [
        "# Agent Sam TRUE E2E Workflow Runner Report",
        "",
        f"Generated: `{report['generated_at']}`",
        "",
        "## Result",
        "",
        "```json",
        json.dumps(report.get("result", {}), indent=2),
        "```",
        "",
        "## Validation",
        "",
        "```json",
        json.dumps(report.get("created_validation", {}), indent=2),
        "```",
        "",
        "## Supabase SQL",
        "",
        f"`{SUPABASE_SQL}`",
    ]
    REPORT_MD.write_text("\n".join(lines))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--plan", action="store_true", help="Inspect only.")
    parser.add_argument("--run", action="store_true", help="Create the actual D1 E2E proof chain.")
    parser.add_argument("--backup", action="store_true", help="Create local backup snapshot before run.")
    parser.add_argument("--supabase-sql", action="store_true", help="Generate Supabase parity SQL for the created run.")
    parser.add_argument("--apply-supabase", action="store_true", help="Apply Supabase SQL using SUPABASE_DB_URL + psql.")
    args = parser.parse_args()

    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    BACKUPS.mkdir(parents=True, exist_ok=True)
    require_ready()

    print("Agent Sam TRUE E2E Workflow Runner v2")
    print(f"repo: {ROOT}")
    print(f"d1: {D1_DB} remote={D1_REMOTE} config={WRANGLER_CONFIG}")
    print(f"workflow: {WORKFLOW_ID} / {WORKFLOW_KEY}")
    print("")

    print("[1/7] Inspecting D1 schemas...")
    schemas = inspect_schemas()
    for t in D1_TABLES:
        print(f"  {'OK' if schemas[t]['exists'] else 'MISS'} {t} rows={count_table(t) if schemas[t]['exists'] else None}")

    print("[2/7] Validating template + existing spine...")
    template_validation = validate_template()
    for k, v in template_validation["checks"].items():
        print(f"  {k}: {v}")

    failures = []
    if not template_validation["checks"]["workflow_exists"]:
        failures.append("missing agent_chat_plan workflow")
    if not template_validation["checks"]["has_required_nodes"]:
        failures.append("missing required template nodes")
    if template_validation["checks"]["orphan_workflow_steps"] not in (0, "0", None):
        failures.append("existing orphan_workflow_steps")

    backup_dir = None
    if args.backup or args.run:
        print("[3/7] Creating backup snapshot...")
        backup_dir = backup()
        print(f"  backup: {backup_dir}")
    else:
        print("[3/7] Backup skipped.")

    e2e = None
    apply_result = None
    created_validation = None

    if args.run:
        print("[4/7] Building TRUE E2E D1 statements...")
        e2e = build_true_e2e_statements(schemas)
        print(f"  workflow_run_id: {e2e['workflow_run_id']}")
        print(f"  plan_id: {e2e['plan_id']}")
        print(f"  approval_id: {e2e['approval_id']}")
        print(f"  command_run_id: {e2e['command_run_id']}")
        print(f"  statements: {len(e2e['statements'])}")

        print("[5/7] Applying D1 statements one-by-one...")
        apply_result = apply_statements(e2e["statements"])
        if not apply_result["ok"]:
            print("[FAIL] D1 statement failed")
            print("failed index:", apply_result.get("failed_index"))
            print("failed statement:")
            print(apply_result.get("failed_statement"))
            print("error:")
            print(apply_result.get("error"))
            failures.append("d1_apply_failed")
        else:
            print("  D1 apply ok")

        print("[6/7] Validating created D1 chain...")
        if apply_result["ok"]:
            created_validation = validate_created(
                e2e["workflow_run_id"],
                e2e["plan_id"],
                e2e["approval_id"],
                e2e["command_run_id"],
            )
            for k, v in created_validation["checks"].items():
                print(f"  {k}: {v}")
                if not v:
                    failures.append(f"created_check_failed:{k}")
    else:
        print("[4/7] D1 E2E run skipped. Use --run.")
        print("[5/7] D1 apply skipped.")
        print("[6/7] Created chain validation skipped.")

    supabase_summary = None
    supabase_apply_result = None

    if args.supabase_sql:
        print("[7/7] Generating Supabase parity SQL...")
        if "d1_apply_failed" in failures:
            print("  skipped because D1 apply failed")
            run_id = None
        else:
            run_id = e2e["workflow_run_id"] if e2e else None
        if not run_id:
            # use latest agent_chat_plan run if no new one in this invocation
            latest = parse_rows(d1_sql(f"SELECT id FROM agentsam_workflow_runs WHERE workflow_key={q(WORKFLOW_KEY)} ORDER BY created_at DESC LIMIT 1;"))
            run_id = latest[0]["id"] if latest else None
        if run_id:
            supabase_summary = generate_supabase_sql(run_id)
            print(f"  wrote {SUPABASE_SQL}")
            print(f"  run={run_id} steps={supabase_summary['steps']}")
            if args.apply_supabase:
                supabase_apply_result = apply_supabase_sql()
                if not supabase_apply_result.get("ok"):
                    print("[WARN] Supabase apply failed/skipped:", supabase_apply_result.get("error") or supabase_apply_result.get("stderr"))
                else:
                    print("  Supabase apply ok")
        else:
            print("  no workflow_run_id found for Supabase SQL")
            failures.append("no_run_for_supabase_sql")
    else:
        print("[7/7] Supabase SQL skipped. Use --supabase-sql.")

    report = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "config": {
            "d1_db": D1_DB,
            "wrangler_config": WRANGLER_CONFIG,
            "tenant_id": TENANT_ID,
            "workspace_id": WORKSPACE_ID,
            "user_id": USER_ID,
            "workflow_id": WORKFLOW_ID,
            "workflow_key": WORKFLOW_KEY,
            "supabase_project": "dpmuvynqixblxsilnlut",
        },
        "template_validation": template_validation,
        "backup_dir": str(backup_dir) if backup_dir else None,
        "result": {
            "failures": failures,
            "workflow_run_id": e2e["workflow_run_id"] if e2e else None,
            "plan_id": e2e["plan_id"] if e2e else None,
            "approval_id": e2e["approval_id"] if e2e else None,
            "command_run_id": e2e["command_run_id"] if e2e else None,
            "d1_sql_log": str(D1_SQL_LOG),
            "supabase_sql": str(SUPABASE_SQL),
        },
        "d1_apply_result": apply_result,
        "created_validation": created_validation,
        "supabase_summary": supabase_summary,
        "supabase_apply_result": supabase_apply_result,
    }
    write_report(report)
    print(f"report: {REPORT_JSON}")
    print(f"markdown: {REPORT_MD}")

    if failures:
        print("")
        print("[FAIL]", failures)
        return 2

    print("")
    print("[PASS] TRUE E2E workflow chain created and validated." if args.run else "[PASS] Plan/inspection completed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
