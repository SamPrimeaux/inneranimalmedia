#!/usr/bin/env python3
"""
Agent Sam E2E Workflow Runner + Supabase Parity Planner

This is the Python-only path for the Agent Sam workflow fabric.

It handles:
1. D1 source-of-truth validation.
2. D1 agent_chat_plan template verification.
3. Optional creation of one end-to-end D1 smoke workflow run:
   agentsam_plans -> agentsam_plan_tasks -> agentsam_workflow_runs -> agentsam_execution_steps
4. Supabase parity planning for the exact Supabase mirror tables found through MCP:
   public.agentsam_workflows
   public.agentsam_workflow_runs
   public.agentsam_workflow_steps
   public.agentsam_workflow_events
   public.agentsam_debug_snapshots
5. Generates Supabase SQL, but does not require secrets and does not apply by default.
6. Optional Supabase apply if SUPABASE_DB_URL is set and psql exists.

Important production truth:
- D1 agentsam_execution_steps.execution_id stores agentsam_workflow_runs.id.
- Do NOT join execution_steps.execution_id to agentsam_executions.id.
- D1 agentsam_workflow_nodes/edges exist, but Supabase does NOT have mirror node/edge tables.
  Therefore nodes/edges must be mirrored into Supabase agentsam_workflows.definition_json.

Run from repo root:
  python3 scripts/agentsam-e2e-workflow-runner.py --plan-only

Create D1 smoke run:
  python3 scripts/agentsam-e2e-workflow-runner.py --create-d1-smoke-run

Generate Supabase SQL for latest agent_chat_plan:
  python3 scripts/agentsam-e2e-workflow-runner.py --create-d1-smoke-run --write-supabase-sql

Apply Supabase SQL only if you have SUPABASE_DB_URL:
  SUPABASE_DB_URL="postgresql://..." python3 scripts/agentsam-e2e-workflow-runner.py --apply-supabase

Environment:
  IAM_D1_DB=inneranimalmedia-business
  IAM_WRANGLER_CONFIG=wrangler.production.toml
  IAM_D1_REMOTE=1
  IAM_TENANT_ID=tenant_sam_primeaux
  IAM_WORKSPACE_ID=global
  IAM_USER_ID=sam_primeaux
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


REPO_ROOT = Path.cwd()
ARTIFACTS = REPO_ROOT / "artifacts"
BACKUPS = ARTIFACTS / "backups"

REPORT_PATH = ARTIFACTS / "agentsam-e2e-workflow-runner-report.json"
MD_PATH = ARTIFACTS / "agentsam-e2e-workflow-runner-report.md"
D1_SQL_PATH = ARTIFACTS / "agentsam-e2e-workflow-runner-d1.sql"
SUPABASE_SQL_PATH = ARTIFACTS / "agentsam-e2e-workflow-runner-supabase.sql"

D1_DB = os.getenv("IAM_D1_DB", "inneranimalmedia-business")
WRANGLER_CONFIG = os.getenv("IAM_WRANGLER_CONFIG", "wrangler.production.toml")
D1_REMOTE = os.getenv("IAM_D1_REMOTE", "1") not in {"0", "false", "False", "no"}

TENANT_ID = os.getenv("IAM_TENANT_ID", "tenant_sam_primeaux")
WORKSPACE_ID = os.getenv("IAM_WORKSPACE_ID", "global")
USER_ID = os.getenv("IAM_USER_ID", "sam_primeaux")
WORKFLOW_KEY = os.getenv("IAM_WORKFLOW_KEY", "agent_chat_plan")
WORKFLOW_ID = os.getenv("IAM_WORKFLOW_ID", "wf_agent_chat_plan")

# Supabase mirror tables discovered through MCP:
SUPABASE_MIRROR_TABLES = [
    "agentsam_workflows",
    "agentsam_workflow_runs",
    "agentsam_workflow_steps",
    "agentsam_workflow_events",
    "agentsam_debug_snapshots",
]

# D1 source-of-truth tables:
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


# ---------------------------------------------------------------------------
# Shell / SQL helpers
# ---------------------------------------------------------------------------

def run_cmd(cmd: List[str], timeout: int = 120, input_text: Optional[str] = None) -> Dict[str, Any]:
    start = time.time()
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(REPO_ROOT),
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
        return "TRUE" if v else "FALSE"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, (dict, list)):
        v = json.dumps(v, separators=(",", ":"), sort_keys=True)
    s = str(v)
    return "'" + s.replace("'", "''") + "'"


def sqlite_q(v: Any) -> str:
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


def now_id() -> str:
    return time.strftime("%Y%m%d%H%M%S", time.gmtime())


def schema(table: str) -> Dict[str, Any]:
    r = rows(d1_sql(f"PRAGMA table_info({table});"))
    return {
        "table": table,
        "exists": bool(r),
        "columns": r,
        "column_names": [x.get("name") for x in r],
        "notnull": [x.get("name") for x in r if x.get("notnull")],
        "pk": [x.get("name") for x in r if x.get("pk")],
    }


def has_col(schemas: Dict[str, Any], table: str, col: str) -> bool:
    return col in schemas.get(table, {}).get("column_names", [])


# ---------------------------------------------------------------------------
# D1 inspection / backup
# ---------------------------------------------------------------------------

def inspect_d1() -> Dict[str, Any]:
    schemas: Dict[str, Any] = {}
    counts: Dict[str, Any] = {}
    for t in D1_TABLES:
        schemas[t] = schema(t)
        if schemas[t]["exists"]:
            counts[t] = rows(d1_sql(f"SELECT COUNT(*) AS count FROM {t};"))[0]
        else:
            counts[t] = {"count": None}
    return {"schemas": schemas, "counts": counts}


def validate_d1_template_and_spine() -> Dict[str, Any]:
    out: Dict[str, Any] = {}

    out["workflow"] = rows(d1_sql(f"""
SELECT id, workflow_key, display_name, workflow_type, trigger_type, is_active
FROM agentsam_workflows
WHERE id={sqlite_q(WORKFLOW_ID)} OR workflow_key={sqlite_q(WORKFLOW_KEY)}
ORDER BY updated_at DESC
LIMIT 5;
""".strip()))

    out["nodes"] = rows(d1_sql(f"""
SELECT n.node_key, n.node_type, n.title, n.handler_key, n.risk_level, n.requires_approval, n.sort_order
FROM agentsam_workflow_nodes n
JOIN agentsam_workflows w ON w.id=n.workflow_id
WHERE w.workflow_key={sqlite_q(WORKFLOW_KEY)}
ORDER BY n.sort_order, n.node_key;
""".strip()))

    out["edges"] = rows(d1_sql(f"""
SELECT e.from_node_key, e.to_node_key, e.condition_type, e.priority, e.is_fallback, e.label
FROM agentsam_workflow_edges e
JOIN agentsam_workflows w ON w.id=e.workflow_id
WHERE w.workflow_key={sqlite_q(WORKFLOW_KEY)}
ORDER BY e.priority, e.from_node_key, e.to_node_key;
""".strip()))

    out["spine"] = rows(d1_sql("""
SELECT
  COUNT(*) AS step_count,
  SUM(CASE WHEN wr.id IS NULL THEN 1 ELSE 0 END) AS orphan_workflow_steps
FROM agentsam_execution_steps s
LEFT JOIN agentsam_workflow_runs wr ON wr.id = s.execution_id;
""".strip()))

    required_nodes = {
        "classify_goal",
        "create_plan",
        "create_execution_steps",
        "execute_task",
        "approval_gate",
        "resume_approved_task",
        "rollup_run",
    }
    actual_nodes = {n.get("node_key") for n in out["nodes"]}

    out["checks"] = {
        "workflow_exists": len(out["workflow"]) > 0,
        "has_required_nodes": required_nodes.issubset(actual_nodes),
        "missing_nodes": sorted(list(required_nodes - actual_nodes)),
        "orphan_workflow_steps": out["spine"][0].get("orphan_workflow_steps") if out["spine"] else None,
    }
    return out


def backup_d1_agent_chat_plan() -> Path:
    ts = now_id()
    bdir = BACKUPS / f"agentsam_e2e_{ts}"
    bdir.mkdir(parents=True, exist_ok=True)

    queries = {
        "d1_agentsam_workflows_agent_chat_plan.json": f"""
SELECT * FROM agentsam_workflows
WHERE id={sqlite_q(WORKFLOW_ID)} OR workflow_key={sqlite_q(WORKFLOW_KEY)};
""",
        "d1_agentsam_workflow_nodes_agent_chat_plan.json": f"""
SELECT n.*
FROM agentsam_workflow_nodes n
JOIN agentsam_workflows w ON w.id=n.workflow_id
WHERE w.workflow_key={sqlite_q(WORKFLOW_KEY)}
ORDER BY n.sort_order, n.node_key;
""",
        "d1_agentsam_workflow_edges_agent_chat_plan.json": f"""
SELECT e.*
FROM agentsam_workflow_edges e
JOIN agentsam_workflows w ON w.id=e.workflow_id
WHERE w.workflow_key={sqlite_q(WORKFLOW_KEY)}
ORDER BY e.priority, e.from_node_key, e.to_node_key;
""",
        "d1_recent_agent_chat_plan_runs.json": f"""
SELECT *
FROM agentsam_workflow_runs
WHERE workflow_id={sqlite_q(WORKFLOW_ID)} OR workflow_key={sqlite_q(WORKFLOW_KEY)}
ORDER BY created_at DESC
LIMIT 20;
""",
    }

    for filename, sql in queries.items():
        res = d1_sql(sql.strip())
        (bdir / filename).write_text(res.get("stdout", "") or json.dumps(res, indent=2))

    rollback = f"""-- Rollback only the reusable D1 agent_chat_plan template.
-- Do NOT run if live workflow runs depend on wf_agent_chat_plan.
-- First check:
-- SELECT COUNT(*) FROM agentsam_workflow_runs WHERE workflow_id='wf_agent_chat_plan' OR workflow_key='agent_chat_plan';

DELETE FROM agentsam_workflow_edges WHERE workflow_id={sqlite_q(WORKFLOW_ID)};
DELETE FROM agentsam_workflow_nodes WHERE workflow_id={sqlite_q(WORKFLOW_ID)};
DELETE FROM agentsam_workflows WHERE id={sqlite_q(WORKFLOW_ID)} AND workflow_key={sqlite_q(WORKFLOW_KEY)};
"""
    (bdir / "rollback_d1_agent_chat_plan.sql").write_text(rollback)
    return bdir


# ---------------------------------------------------------------------------
# D1 smoke run generation
# ---------------------------------------------------------------------------

def generate_d1_smoke_sql() -> Dict[str, Any]:
    """
    Generate FK-safe D1 smoke SQL.

    Correct insert order:
      1. agentsam_workflow_runs
      2. agentsam_plans
      3. agentsam_execution_steps
      4. agentsam_plan_tasks

    Why:
      - agentsam_plans.workflow_run_id references agentsam_workflow_runs.id
      - agentsam_plan_tasks.execution_step_id references agentsam_execution_steps.id
      - agentsam_plan_tasks.workflow_run_id references agentsam_workflow_runs.id
      - agentsam_plan_tasks.plan_id references agentsam_plans.id
    """
    run_suffix = now_id()
    plan_id = f"plan_agent_chat_plan_smoke_{run_suffix}"
    workflow_run_id = f"wrun_agent_chat_plan_smoke_{run_suffix}"

    task_specs = [
        {
            "id": f"task_smoke_{run_suffix}_001_classify",
            "order_index": 0,
            "title": "Classify goal",
            "description": "Classify the smoke test goal and confirm it is a plan-worthy work goal.",
            "priority": "P1",
            "category": "backend",
            "handler_type": "agent",
            "handler_key": "gpt-5.4-nano",
            "node_key": "classify_goal",
            "risk_level": "low",
            "requires_approval": 0,
        },
        {
            "id": f"task_smoke_{run_suffix}_002_create_steps",
            "order_index": 1,
            "title": "Create execution spine",
            "description": "Create and validate workflow_run and execution_step linkage for Agent Sam planner runs.",
            "priority": "P0",
            "category": "db",
            "handler_type": "db_query",
            "handler_key": "create_plan_execution_steps",
            "node_key": "create_execution_steps",
            "risk_level": "medium",
            "requires_approval": 0,
        },
        {
            "id": f"task_smoke_{run_suffix}_003_approval_gate",
            "order_index": 2,
            "title": "Verify terminal approval gate",
            "description": "Confirm risky terminal execution would require an approval_queue row before running.",
            "priority": "P0",
            "category": "infra",
            "handler_type": "approval_gate",
            "handler_key": "approval_queue",
            "node_key": "approval_gate",
            "risk_level": "high",
            "requires_approval": 1,
        },
        {
            "id": f"task_smoke_{run_suffix}_004_rollup",
            "order_index": 3,
            "title": "Roll up run",
            "description": "Roll up the smoke run status and prove D1 linkage.",
            "priority": "P1",
            "category": "backend",
            "handler_type": "db_query",
            "handler_key": "rollup_plan_workflow_run",
            "node_key": "rollup_run",
            "risk_level": "low",
            "requires_approval": 0,
        },
    ]

    step_specs = []
    for t in task_specs:
        step_id = f"estep_{t['id'].replace('task_', '')}"
        step_specs.append({
            "id": step_id,
            "task_id": t["id"],
            "node_key": t["node_key"],
            "node_type": t["handler_type"],
            "status": "pending",
            "input_json": {
                "source": "agentsam-e2e-workflow-runner.py",
                "plan_id": plan_id,
                "task_id": t["id"],
                "workflow_run_id": workflow_run_id,
                "handler_type": t["handler_type"],
                "handler_key": t["handler_key"],
                "title": t["title"],
                "description": t["description"],
                "risk_level": t["risk_level"],
                "requires_approval": bool(t["requires_approval"]),
            },
        })

    lines = [
        "-- D1 E2E smoke run for Agent Sam workflow fabric.",
        "-- Generated by agentsam-e2e-workflow-runner.py",
        "-- FK-safe insert order: workflow_run -> plan -> execution_steps -> plan_tasks.",
        "-- No explicit transaction statements for Wrangler D1 remote compatibility.",
        "",
    ]

    # 1. Workflow run first because plans/tasks reference it.
    lines.append(f"""
INSERT OR IGNORE INTO agentsam_workflow_runs (
  id, workflow_id, workflow_key, display_name,
  tenant_id, workspace_id, user_id, session_id, run_group_id,
  trigger_type, status, input_json, output_json, step_results_json,
  steps_completed, steps_total, model_used, environment, metadata_json,
  started_at, created_at, updated_at, graph_mode
) VALUES (
  {sqlite_q(workflow_run_id)}, {sqlite_q(WORKFLOW_ID)}, {sqlite_q(WORKFLOW_KEY)}, 'Agent Chat Plan E2E Smoke',
  {sqlite_q(TENANT_ID)}, {sqlite_q(WORKSPACE_ID)}, {sqlite_q(USER_ID)}, {sqlite_q('smoke_'+run_suffix)}, {sqlite_q('grp_'+run_suffix)},
  'agent', 'running',
  {sqlite_q({"source":"agentsam-e2e-workflow-runner.py","plan_id":plan_id,"goal":"E2E smoke run"})},
  '{{}}', '[]',
  0, {len(task_specs)}, 'gpt-5.4-mini', 'production',
  {sqlite_q({"template":WORKFLOW_KEY,"spine":"workflow_runs.id -> execution_steps.execution_id"})},
  unixepoch(), strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'), 1
);
""".strip())

    # 2. Plan after workflow_run exists.
    lines.append(f"""
INSERT OR IGNORE INTO agentsam_plans (
  id, tenant_id, workspace_id, session_id, plan_date, plan_type, title, status,
  default_model, tasks_total, tasks_done, tasks_blocked,
  workflow_id, workflow_run_id, graph_mode, risk_level, requires_approval
) VALUES (
  {sqlite_q(plan_id)}, {sqlite_q(TENANT_ID)}, {sqlite_q(WORKSPACE_ID)}, {sqlite_q('smoke_'+run_suffix)},
  date('now'), 'feature', 'Agent Chat Plan E2E Smoke {run_suffix}', 'active',
  'gpt-5.4-mini', {len(task_specs)}, 0, 0,
  {sqlite_q(WORKFLOW_ID)}, {sqlite_q(workflow_run_id)}, 1, 'medium', 0
);
""".strip())

    # 3. Execution steps before plan_tasks because plan_tasks.execution_step_id FK points here.
    for s in step_specs:
        lines.append(f"""
INSERT OR IGNORE INTO agentsam_execution_steps (
  id, execution_id, node_key, node_type, status, input_json,
  output_json, error_json, attempt, created_at
) VALUES (
  {sqlite_q(s['id'])}, {sqlite_q(workflow_run_id)}, {sqlite_q(s['node_key'])}, {sqlite_q(s['node_type'])},
  {sqlite_q(s['status'])}, {sqlite_q(s['input_json'])}, '{{}}', '{{}}', 1,
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
);
""".strip())

    # 4. Plan tasks last because they reference plan, workflow_run, and execution_step.
    for t, s in zip(task_specs, step_specs):
        lines.append(f"""
INSERT OR IGNORE INTO agentsam_plan_tasks (
  id, tenant_id, workspace_id, plan_id, order_index, title, description,
  priority, category, status, estimated_minutes,
  node_key, execution_step_id, workflow_run_id, handler_key, handler_type,
  risk_level, requires_approval, quality_gate_json
) VALUES (
  {sqlite_q(t['id'])}, {sqlite_q(TENANT_ID)}, {sqlite_q(WORKSPACE_ID)}, {sqlite_q(plan_id)},
  {t['order_index']}, {sqlite_q(t['title'])}, {sqlite_q(t['description'])},
  {sqlite_q(t['priority'])}, {sqlite_q(t['category'])}, 'todo', 5,
  {sqlite_q(t['node_key'])}, {sqlite_q(s['id'])}, {sqlite_q(workflow_run_id)}, {sqlite_q(t['handler_key'])}, {sqlite_q(t['handler_type'])},
  {sqlite_q(t['risk_level'])}, {int(t['requires_approval'])},
  {sqlite_q({"smoke":True,"requires_d1_trace":True})}
);
""".strip())

    D1_SQL_PATH.write_text("\n\n".join(lines) + "\n")
    return {
        "plan_id": plan_id,
        "workflow_run_id": workflow_run_id,
        "task_specs": task_specs,
        "step_specs": step_specs,
        "sql_path": str(D1_SQL_PATH),
    }

def validate_smoke_run(workflow_run_id: str, plan_id: str) -> Dict[str, Any]:
    return {
        "plan": rows(d1_sql(f"""
SELECT p.id, p.title, p.workflow_run_id, p.tasks_total,
       COUNT(t.id) AS tasks,
       SUM(CASE WHEN t.execution_step_id IS NOT NULL THEN 1 ELSE 0 END) AS tasks_with_steps,
       SUM(CASE WHEN t.workflow_run_id IS NOT NULL THEN 1 ELSE 0 END) AS tasks_with_wrun
FROM agentsam_plans p
LEFT JOIN agentsam_plan_tasks t ON t.plan_id = p.id
WHERE p.id={sqlite_q(plan_id)}
GROUP BY p.id;
""".strip())),
        "steps": rows(d1_sql(f"""
SELECT t.id AS task_id, t.workflow_run_id, t.execution_step_id,
       s.id AS step_id, s.execution_id AS step_wrun_id, s.node_key, s.node_type, s.status
FROM agentsam_plan_tasks t
LEFT JOIN agentsam_execution_steps s ON s.id=t.execution_step_id
WHERE t.plan_id={sqlite_q(plan_id)}
ORDER BY t.order_index;
""".strip())),
        "workflow_run": rows(d1_sql(f"""
SELECT wr.id, wr.workflow_id, wr.workflow_key, wr.status, wr.steps_total,
       COUNT(s.id) AS steps
FROM agentsam_workflow_runs wr
LEFT JOIN agentsam_execution_steps s ON s.execution_id=wr.id
WHERE wr.id={sqlite_q(workflow_run_id)}
GROUP BY wr.id;
""".strip())),
    }


# ---------------------------------------------------------------------------
# Supabase parity SQL
# ---------------------------------------------------------------------------

def get_d1_template_for_supabase() -> Dict[str, Any]:
    workflow = rows(d1_sql(f"""
SELECT * FROM agentsam_workflows
WHERE id={sqlite_q(WORKFLOW_ID)} OR workflow_key={sqlite_q(WORKFLOW_KEY)}
LIMIT 1;
""".strip()))
    nodes = rows(d1_sql(f"""
SELECT n.*
FROM agentsam_workflow_nodes n
JOIN agentsam_workflows w ON w.id=n.workflow_id
WHERE w.workflow_key={sqlite_q(WORKFLOW_KEY)}
ORDER BY n.sort_order, n.node_key;
""".strip()))
    edges = rows(d1_sql(f"""
SELECT e.*
FROM agentsam_workflow_edges e
JOIN agentsam_workflows w ON w.id=e.workflow_id
WHERE w.workflow_key={sqlite_q(WORKFLOW_KEY)}
ORDER BY e.priority, e.from_node_key, e.to_node_key;
""".strip()))
    return {"workflow": workflow[0] if workflow else None, "nodes": nodes, "edges": edges}


def get_d1_run_for_supabase(workflow_run_id: Optional[str]) -> Dict[str, Any]:
    if workflow_run_id:
        wr_where = f"wr.id={sqlite_q(workflow_run_id)}"
    else:
        wr_where = f"wr.workflow_key={sqlite_q(WORKFLOW_KEY)}"

    runs = rows(d1_sql(f"""
SELECT wr.*
FROM agentsam_workflow_runs wr
WHERE {wr_where}
ORDER BY wr.created_at DESC
LIMIT 1;
""".strip()))

    run = runs[0] if runs else None
    if not run:
        return {"run": None, "steps": []}

    steps = rows(d1_sql(f"""
SELECT *
FROM agentsam_execution_steps
WHERE execution_id={sqlite_q(run['id'])}
ORDER BY created_at, node_key;
""".strip()))
    return {"run": run, "steps": steps}


def generate_supabase_sql(workflow_run_id: Optional[str] = None) -> Dict[str, Any]:
    template = get_d1_template_for_supabase()
    run_bundle = get_d1_run_for_supabase(workflow_run_id)

    workflow = template["workflow"]
    nodes = template["nodes"]
    edges = template["edges"]
    run = run_bundle["run"]
    steps = run_bundle["steps"]

    lines: List[str] = [
        "-- Supabase parity SQL for Agent Sam workflow fabric.",
        "-- Generated by agentsam-e2e-workflow-runner.py",
        "-- Uses Supabase mirror tables discovered through MCP.",
        "-- Apply only if you intend to mirror D1 source-of-truth into Supabase.",
        "",
    ]

    if workflow:
        definition = {
            "d1_workflow": workflow,
            "nodes": nodes,
            "edges": edges,
            "source": "d1_agentsam_workflows_nodes_edges",
            "spine": "agentsam_workflow_runs.id -> agentsam_execution_steps.execution_id",
        }
        lines.append(f"""
INSERT INTO public.agentsam_workflows (
  id, d1_workflow_id, tenant_id, workspace_id, workflow_key, name,
  description, status, trigger_type, definition_json, metadata, updated_at
) VALUES (
  {q('sb_'+workflow['id'])},
  {q(workflow['id'])},
  {q(workflow.get('tenant_id') or TENANT_ID)},
  {q(workflow.get('workspace_id') or WORKSPACE_ID)},
  {q(workflow.get('workflow_key') or WORKFLOW_KEY)},
  {q(workflow.get('display_name') or workflow.get('workflow_key') or WORKFLOW_KEY)},
  {q(workflow.get('description'))},
  {q('active' if workflow.get('is_active', 1) else 'inactive')},
  {q(workflow.get('trigger_type') or 'agent')},
  {q(definition)}::jsonb,
  {q({"source":"d1","synced_by":"agentsam-e2e-workflow-runner.py"})}::jsonb,
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
        metadata = {
            "source": "d1",
            "d1_run_id": run.get("id"),
            "workflow_id": run.get("workflow_id"),
            "workflow_key": run.get("workflow_key"),
            "synced_by": "agentsam-e2e-workflow-runner.py",
        }
        lines.append(f"""
INSERT INTO public.agentsam_workflow_runs (
  id, d1_run_id, tenant_id, workspace_id, workflow_id, workflow_key, display_name,
  trigger_type, status, input_json, output_json, step_results_json,
  steps_completed, steps_total, error_message, model_used,
  input_tokens, output_tokens, cost_usd, duration_ms, environment,
  retry_count, parent_run_id, started_at, completed_at,
  supabase_sync_status, supabase_synced_at, session_id, conversation_id,
  user_id, run_group_id, mode, provider, model_key, total_tokens,
  estimated_cost_usd, latency_ms, metadata, updated_at
) VALUES (
  {q(run.get('id'))},
  {q(run.get('id'))},
  {q(run.get('tenant_id') or TENANT_ID)},
  {q(run.get('workspace_id') or WORKSPACE_ID)},
  {q(run.get('workflow_id'))},
  {q(run.get('workflow_key'))},
  {q(run.get('display_name'))},
  {q(run.get('trigger_type') or 'agent')},
  {q(run.get('status') or 'running')},
  {q(json.loads(run.get('input_json') or '{}') if isinstance(run.get('input_json'), str) else (run.get('input_json') or {}))}::jsonb,
  {q(json.loads(run.get('output_json') or '{}') if isinstance(run.get('output_json'), str) else (run.get('output_json') or {}))}::jsonb,
  {q(json.loads(run.get('step_results_json') or '[]') if isinstance(run.get('step_results_json'), str) else (run.get('step_results_json') or []))}::jsonb,
  {q(run.get('steps_completed') or 0)},
  {q(run.get('steps_total') or len(steps))},
  {q(run.get('error_message'))},
  {q(run.get('model_used'))},
  {q(run.get('input_tokens') or 0)},
  {q(run.get('output_tokens') or 0)},
  {q(run.get('cost_usd') or 0)},
  {q(run.get('duration_ms'))},
  {q(run.get('environment') or 'production')},
  {q(run.get('retry_count') or 0)},
  {q(run.get('parent_run_id'))},
  to_timestamp({q(run.get('started_at') or int(time.time()))}),
  NULL,
  'synced',
  now(),
  {q(run.get('session_id'))},
  {q(run.get('conversation_id'))},
  {q(run.get('user_id'))},
  {q(run.get('run_group_id'))},
  {q(run.get('default_mode') or run.get('mode'))},
  {q(run.get('provider'))},
  {q(run.get('model_key'))},
  {q((run.get('input_tokens') or 0) + (run.get('output_tokens') or 0))},
  {q(run.get('cost_usd') or 0)},
  {q(run.get('duration_ms'))},
  {q(metadata)}::jsonb,
  now()
)
ON CONFLICT (id) DO UPDATE SET
  d1_run_id=EXCLUDED.d1_run_id,
  workflow_id=EXCLUDED.workflow_id,
  workflow_key=EXCLUDED.workflow_key,
  display_name=EXCLUDED.display_name,
  status=EXCLUDED.status,
  input_json=EXCLUDED.input_json,
  output_json=EXCLUDED.output_json,
  step_results_json=EXCLUDED.step_results_json,
  steps_completed=EXCLUDED.steps_completed,
  steps_total=EXCLUDED.steps_total,
  error_message=EXCLUDED.error_message,
  input_tokens=EXCLUDED.input_tokens,
  output_tokens=EXCLUDED.output_tokens,
  cost_usd=EXCLUDED.cost_usd,
  duration_ms=EXCLUDED.duration_ms,
  supabase_sync_status='synced',
  supabase_synced_at=now(),
  metadata=EXCLUDED.metadata,
  updated_at=now();
""".strip())

        for idx, step in enumerate(steps):
            input_json = json.loads(step.get("input_json") or "{}") if isinstance(step.get("input_json"), str) else (step.get("input_json") or {})
            output_json = json.loads(step.get("output_json") or "{}") if isinstance(step.get("output_json"), str) else (step.get("output_json") or {})
            error_json = json.loads(step.get("error_json") or "{}") if isinstance(step.get("error_json"), str) else (step.get("error_json") or {})
            error_message = None
            if error_json:
                error_message = error_json.get("message") or json.dumps(error_json)[:500]
            lines.append(f"""
INSERT INTO public.agentsam_workflow_steps (
  id, run_id, tenant_id, workspace_id, step_index, step_key, step_type,
  status, tool_key, command_key, provider, model_key,
  input_json, output_json, error_message, latency_ms, metadata, updated_at
) VALUES (
  {q(step.get('id'))},
  {q(run.get('id'))},
  {q(run.get('tenant_id') or TENANT_ID)},
  {q(run.get('workspace_id') or WORKSPACE_ID)},
  {q(idx)},
  {q(step.get('node_key'))},
  {q(step.get('node_type') or 'agent')},
  {q(step.get('status') or 'started')},
  {q(input_json.get('handler_key'))},
  {q(input_json.get('handler_key'))},
  {q(input_json.get('provider'))},
  {q(input_json.get('model_key'))},
  {q(input_json)}::jsonb,
  {q(output_json)}::jsonb,
  {q(error_message)},
  {q(step.get('latency_ms'))},
  {q({"d1_execution_step_id":step.get("id"),"d1_execution_id":step.get("execution_id"),"approval_id":step.get("approval_id")})}::jsonb,
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
  {q(run.get('id'))},
  {q(step.get('id'))},
  {q(run.get('tenant_id') or TENANT_ID)},
  {q(run.get('workspace_id') or WORKSPACE_ID)},
  {q('step_' + str(step.get('status') or 'updated'))},
  'info',
  {q(f"Step {step.get('node_key')} is {step.get('status')}")},
  {q({"node_key":step.get("node_key"),"node_type":step.get("node_type"),"status":step.get("status"),"source":"d1_mirror"})}::jsonb
);
""".strip())

        lines.append(f"""
INSERT INTO public.agentsam_debug_snapshots (
  tenant_id, workspace_id, run_id, snapshot_key, source, status,
  request_json, response_json, environment_json, notes
) VALUES (
  {q(run.get('tenant_id') or TENANT_ID)},
  {q(run.get('workspace_id') or WORKSPACE_ID)},
  {q(run.get('id'))},
  {q('d1_parity_'+now_id())},
  'agentsam-e2e-workflow-runner.py',
  'captured',
  {q({"workflow_run_id":run.get("id"),"workflow_key":run.get("workflow_key")})}::jsonb,
  {q({"steps":len(steps),"status":run.get("status")})}::jsonb,
  {q({"d1_db":D1_DB,"supabase_project":"inneranimalmedia-business-supabase"})}::jsonb,
  'D1 to Supabase parity snapshot for Agent Sam workflow run.'
);
""".strip())

    SUPABASE_SQL_PATH.write_text("\n\n".join(lines) + "\n")
    return {
        "sql_path": str(SUPABASE_SQL_PATH),
        "workflow_present": bool(workflow),
        "run_present": bool(run),
        "step_count": len(steps),
        "workflow_run_id": run.get("id") if run else None,
    }


def apply_supabase_sql(sql_path: Path) -> Dict[str, Any]:
    db_url = os.getenv("SUPABASE_DB_URL")
    if not db_url:
        return {"ok": False, "error": "SUPABASE_DB_URL not set; refusing to apply Supabase SQL."}
    if not shutil.which("psql"):
        return {"ok": False, "error": "psql not found in PATH."}
    sql = sql_path.read_text()
    return run_cmd(["psql", db_url, "-v", "ON_ERROR_STOP=1"], input_text=sql, timeout=180)


# ---------------------------------------------------------------------------
# report
# ---------------------------------------------------------------------------

def md_report(report: Dict[str, Any]) -> str:
    lines = []
    lines.append("# Agent Sam E2E Workflow Runner Report")
    lines.append("")
    lines.append(f"Generated: `{report['generated_at']}`")
    lines.append("")
    lines.append("## Supabase MCP finding")
    lines.append("")
    lines.append("The Supabase project is `inneranimalmedia-business-supabase` (`dpmuvynqixblxsilnlut`).")
    lines.append("")
    lines.append("Workflow parity tables to include in Python:")
    for t in SUPABASE_MIRROR_TABLES:
        lines.append(f"- `public.{t}`")
    lines.append("")
    lines.append("Important mapping:")
    lines.append("")
    lines.append("```text")
    lines.append("D1 agentsam_workflows/nodes/edges -> Supabase agentsam_workflows.definition_json")
    lines.append("D1 agentsam_workflow_runs -> Supabase agentsam_workflow_runs")
    lines.append("D1 agentsam_execution_steps -> Supabase agentsam_workflow_steps")
    lines.append("D1 step/status updates -> Supabase agentsam_workflow_events")
    lines.append("D1 run parity proof -> Supabase agentsam_debug_snapshots")
    lines.append("```")
    lines.append("")
    lines.append("## D1 validation")
    lines.append("")
    lines.append("```json")
    lines.append(json.dumps(report.get("d1_validation", {}), indent=2))
    lines.append("```")
    lines.append("")
    lines.append("## D1 smoke run")
    lines.append("")
    lines.append("```json")
    lines.append(json.dumps(report.get("d1_smoke", {}), indent=2))
    lines.append("```")
    lines.append("")
    lines.append("## Supabase SQL")
    lines.append("")
    lines.append(f"- Path: `{SUPABASE_SQL_PATH}`")
    lines.append(f"- Summary: `{report.get('supabase_sql_summary')}`")
    lines.append("")
    lines.append("## Next runtime standard")
    lines.append("")
    lines.append("Every functional Agent Sam workflow run should now do:")
    lines.append("")
    lines.append("```text")
    lines.append("D1: workflow_run -> execution_steps")
    lines.append("D1: plan -> plan_tasks -> workflow_run/execution_step links")
    lines.append("D1: approval_queue -> command_run + execution_step for risky work")
    lines.append("Supabase: mirror workflow_run into agentsam_workflow_runs")
    lines.append("Supabase: mirror execution_steps into agentsam_workflow_steps")
    lines.append("Supabase: append proof events into agentsam_workflow_events")
    lines.append("Supabase: capture debug snapshot into agentsam_debug_snapshots")
    lines.append("```")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--plan-only", action="store_true", help="Inspect and report only.")
    parser.add_argument("--backup", action="store_true", help="Backup D1 agent_chat_plan rows before any run.")
    parser.add_argument("--create-d1-smoke-run", action="store_true", help="Create one D1 smoke workflow run and linked steps.")
    parser.add_argument("--write-supabase-sql", action="store_true", help="Generate Supabase parity SQL from latest/smoke D1 run.")
    parser.add_argument("--apply-supabase", action="store_true", help="Apply generated Supabase SQL via SUPABASE_DB_URL + psql.")
    args = parser.parse_args()

    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    BACKUPS.mkdir(parents=True, exist_ok=True)

    print("Agent Sam E2E Workflow Runner")
    print(f"repo: {REPO_ROOT}")
    print(f"d1: {D1_DB} remote={D1_REMOTE} config={WRANGLER_CONFIG}")
    print("supabase project from MCP: inneranimalmedia-business-supabase / dpmuvynqixblxsilnlut")
    print("")

    if not wrangler_ready():
        print("[FAIL] npx or wrangler config missing. Run from repo root.")
        return 2

    print("[1/6] Inspecting D1 source-of-truth schemas...")
    d1 = inspect_d1()
    for t in D1_TABLES:
        print(f"  {'OK' if d1['schemas'][t]['exists'] else 'MISS'} {t} rows={d1['counts'][t].get('count')}")

    print("[2/6] Validating D1 agent_chat_plan template and workflow-run spine...")
    d1_validation = validate_d1_template_and_spine()
    for k, v in d1_validation.get("checks", {}).items():
        print(f"  {k}: {v}")

    backup_dir = None
    if args.backup:
        print("[3/6] Creating D1 backup snapshot...")
        backup_dir = backup_d1_agent_chat_plan()
        print(f"  backup: {backup_dir}")
    else:
        print("[3/6] Backup skipped. Use --backup to create local JSON + rollback SQL.")

    d1_smoke: Dict[str, Any] = {}
    if args.create_d1_smoke_run:
        print("[4/6] Creating D1 smoke run SQL and applying...")
        smoke = generate_d1_smoke_sql()
        print(f"  wrote {smoke['sql_path']}")
        res = d1_file(D1_SQL_PATH)
        print(res.get("stdout", ""))
        if not res["ok"]:
            print(res.get("stderr", ""), file=sys.stderr)
            d1_smoke = {"ok": False, "apply_result": res, **smoke}
        else:
            smoke_validation = validate_smoke_run(smoke["workflow_run_id"], smoke["plan_id"])
            d1_smoke = {"ok": True, "apply_result": res, "validation": smoke_validation, **smoke}
            print(f"  smoke workflow_run_id: {smoke['workflow_run_id']}")
            print(f"  smoke plan_id: {smoke['plan_id']}")
    else:
        print("[4/6] D1 smoke run skipped. Use --create-d1-smoke-run.")

    supabase_summary: Dict[str, Any] = {}
    apply_supabase_result = None
    if args.write_supabase_sql or args.apply_supabase:
        print("[5/6] Generating Supabase parity SQL...")
        workflow_run_id = d1_smoke.get("workflow_run_id") if d1_smoke else None
        supabase_summary = generate_supabase_sql(workflow_run_id=workflow_run_id)
        print(f"  wrote {SUPABASE_SQL_PATH}")
        print(f"  run_present={supabase_summary.get('run_present')} step_count={supabase_summary.get('step_count')}")
        if args.apply_supabase:
            print("  applying Supabase SQL with SUPABASE_DB_URL + psql...")
            apply_supabase_result = apply_supabase_sql(SUPABASE_SQL_PATH)
            print(apply_supabase_result.get("stdout", ""))
            if not apply_supabase_result.get("ok"):
                print(apply_supabase_result.get("stderr") or apply_supabase_result.get("error"), file=sys.stderr)
    else:
        print("[5/6] Supabase SQL skipped. Use --write-supabase-sql.")

    print("[6/6] Writing report...")
    report = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "config": {
            "d1_db": D1_DB,
            "wrangler_config": WRANGLER_CONFIG,
            "d1_remote": D1_REMOTE,
            "tenant_id": TENANT_ID,
            "workspace_id": WORKSPACE_ID,
            "user_id": USER_ID,
            "workflow_key": WORKFLOW_KEY,
            "workflow_id": WORKFLOW_ID,
            "supabase_project_id": "dpmuvynqixblxsilnlut",
            "supabase_project_name": "inneranimalmedia-business-supabase",
        },
        "d1": d1,
        "d1_validation": d1_validation,
        "backup_dir": str(backup_dir) if backup_dir else None,
        "d1_smoke": d1_smoke,
        "supabase_mirror_tables": SUPABASE_MIRROR_TABLES,
        "supabase_sql_path": str(SUPABASE_SQL_PATH),
        "supabase_sql_summary": supabase_summary,
        "apply_supabase_result": apply_supabase_result,
    }

    REPORT_PATH.write_text(json.dumps(report, indent=2, sort_keys=True))
    MD_PATH.write_text(md_report(report))
    print(f"  wrote {REPORT_PATH}")
    print(f"  wrote {MD_PATH}")

    checks = d1_validation.get("checks", {})
    failed = []
    if not checks.get("workflow_exists"):
        failed.append("workflow_exists")
    if not checks.get("has_required_nodes"):
        failed.append("has_required_nodes")
    if checks.get("orphan_workflow_steps") not in (0, "0", None):
        failed.append("orphan_workflow_steps")

    if args.create_d1_smoke_run and not d1_smoke.get("ok"):
        failed.append("d1_smoke_run")
    if args.apply_supabase and not (apply_supabase_result and apply_supabase_result.get("ok")):
        failed.append("apply_supabase")

    if failed:
        print("")
        print(f"[FAIL] {failed}")
        return 2

    print("")
    print("[PASS] Agent Sam E2E workflow runner completed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
