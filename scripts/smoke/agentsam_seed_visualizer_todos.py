#!/usr/bin/env python3
"""
agentsam_seed_visualizer_todos.py
─────────────────────────────────
Idempotent seed: D1 canonical todos/plan/tasks + Supabase mirror (plans, plan_tasks,
workflow_runs only). Zero LLM / model calls.

Env (same family as other smoke scripts):
  CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID
  IAM_TENANT_ID, IAM_WORKSPACE_ID
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

Optional: IAM_D1_AUTH_USER_ID, IAM_USER_EMAIL

Does not write Supabase agentsam_todo (table does not exist).
Does not delete workflow runs (failed or otherwise).
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from typing import Any

import requests

# ── Config ────────────────────────────────────────────────────────────────────
CF_TOKEN = os.environ.get("CLOUDFLARE_API_TOKEN", "")
CF_ACCOUNT = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
CF_DB_ID = os.environ.get("CLOUDFLARE_D1_DATABASE_ID", "")
TENANT_ID = os.environ.get("IAM_TENANT_ID", "")
WORKSPACE_ID = os.environ.get("IAM_WORKSPACE_ID", "")
USER_ID = os.environ.get("IAM_D1_AUTH_USER_ID", os.environ.get("IAM_USER_ID", ""))
USER_EMAIL = os.environ.get("IAM_USER_EMAIL", "")

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

WORKFLOW_KEY = "wf_agent_sam_visualizer_buildout"
PROJECT_KEY = "agent_sam_visualizer"

# Stable registry row (agentsam_workflows) and MCP row (FK target for agentsam_workflow_runs)
WF_REGISTRY_ID = "wf_agent_sam_visualizer_buildout"
MCP_WORKFLOW_ID = "mcp_wf_agent_sam_visualizer_buildout"


def _utc_ymd() -> tuple[str, str]:
    now = datetime.now(timezone.utc)
    return now.strftime("%Y-%m-%d"), now.strftime("%Y%m%d")


def _require_env() -> None:
    missing = [
        k
        for k, v in [
            ("CLOUDFLARE_API_TOKEN", CF_TOKEN),
            ("CLOUDFLARE_ACCOUNT_ID", CF_ACCOUNT),
            ("CLOUDFLARE_D1_DATABASE_ID", CF_DB_ID),
            ("IAM_TENANT_ID", TENANT_ID),
            ("IAM_WORKSPACE_ID", WORKSPACE_ID),
            ("SUPABASE_URL", SUPABASE_URL),
            ("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_SERVICE_KEY),
        ]
        if not v
    ]
    if missing:
        sys.exit("ERROR: missing env: " + ", ".join(missing) + " (source load-agentsam-env.sh)")


D1_URL = ""
D1_HDR: dict[str, str] = {}


def d1(sql: str, params: list[Any] | None = None) -> list[dict[str, Any]]:
    r = requests.post(
        D1_URL, headers=D1_HDR, json={"sql": sql, "params": params or []}, timeout=45
    )
    data = r.json()
    if not r.ok or not data.get("success"):
        raise RuntimeError(f"D1 HTTP {r.status_code}: {data.get('errors', data)}")
    return data["result"][0].get("results", [])


def d1_exec(sql: str, params: list[Any] | None = None) -> None:
    r = requests.post(
        D1_URL, headers=D1_HDR, json={"sql": sql, "params": params or []}, timeout=45
    )
    data = r.json()
    if not r.ok or not data.get("success"):
        raise RuntimeError(f"D1 HTTP {r.status_code}: {data.get('errors', data)}")


def supa_headers(*, upsert: bool = False) -> dict[str, str]:
    h = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
    }
    if upsert:
        h["Prefer"] = "resolution=merge-duplicates,return=representation"
    else:
        h["Prefer"] = "return=representation"
    return h


def supa_post_upsert(table: str, row: dict[str, Any]) -> None:
    url = f"{SUPABASE_URL}/rest/v1/{table}?on_conflict=id"
    r = requests.post(url, headers=supa_headers(upsert=True), json=row, timeout=45)
    if r.status_code not in (200, 201):
        try:
            detail = r.json()
        except Exception:
            detail = r.text
        raise RuntimeError(f"Supabase {table} upsert failed {r.status_code}: {detail}")


def build_task_defs(ymd_compact: str) -> list[dict[str, Any]]:
    """Deterministic todo_id / task_id / metadata for six actionable items."""
    common_tables = [
        "agentsam_todo",
        "agentsam_plans",
        "agentsam_plan_tasks",
        "agentsam_workflows",
        "agentsam_workflow_runs",
        "agentsam_mcp_workflows",
        "agentsam_stream_events",
    ]
    return [
        {
            "slug": "hl",
            "todo_id": f"todo_viz_hl_{ymd_compact}",
            "task_id": f"task_viz_hl_{ymd_compact}",
            "title": "Fix analytics highlightRun resolution",
            "todo_priority": "high",
            "plan_priority": "P0",
            "sort_order": 10,
            "order_index": 0,
            "description": "Resolve highlightRun query param end-to-end so Overview highlights the intended run.",
            "files": [
                "src/api/analytics/overview.js",
                "dashboard/components/analytics/tabs/OverviewTab.tsx",
            ],
            "tables": common_tables
            + ["agentsam_routing_decisions", "agentsam_prompt_runs"],
            "routes": ["GET /api/analytics/overview"],
            "dashboard_routes": ["/dashboard/analytics"],
        },
        {
            "slug": "pulse",
            "todo_id": f"todo_viz_pulse_{ymd_compact}",
            "task_id": f"task_viz_pulse_{ymd_compact}",
            "title": "Remaster analytics overview into System Pulse UI",
            "todo_priority": "high",
            "plan_priority": "P0",
            "sort_order": 20,
            "order_index": 1,
            "description": "Restructure overview analytics presentation into a System Pulse layout (health, runs, errors).",
            "files": [
                "src/api/analytics/overview.js",
                "dashboard/components/analytics/tabs/OverviewTab.tsx",
                "src/api/analytics/index.js",
            ],
            "tables": common_tables + ["agentsam_error_events", "agentsam_eval_runs"],
            "routes": ["GET /api/analytics/overview"],
            "dashboard_routes": ["/dashboard/analytics"],
        },
        {
            "slug": "wfvis",
            "todo_id": f"todo_viz_wfvis_{ymd_compact}",
            "task_id": f"task_viz_wfvis_{ymd_compact}",
            "title": "Build read-only workflow visualizer route",
            "todo_priority": "medium",
            "plan_priority": "P1",
            "sort_order": 30,
            "order_index": 2,
            "description": "Add dashboard route to render agentsam_workflow_nodes/edges (read-only) for a workflow_key.",
            "files": [
                "dashboard/App.tsx",
                "src/core/router.js",
                "src/index.js",
            ],
            "tables": [
                "agentsam_workflows",
                "agentsam_workflow_nodes",
                "agentsam_workflow_edges",
                "agentsam_mcp_workflows",
            ],
            "routes": [
                "GET /api/agent/boot",
            ],
            "dashboard_routes": ["/dashboard/workflows/visualizer"],
        },
        {
            "slug": "trace",
            "todo_id": f"todo_viz_trace_{ymd_compact}",
            "task_id": f"task_viz_trace_{ymd_compact}",
            "title": "Add run trace overlay to workflow visualizer",
            "todo_priority": "medium",
            "plan_priority": "P1",
            "sort_order": 40,
            "order_index": 3,
            "description": "Overlay a selected agentsam_workflow_runs row (steps / status) on the DAG view.",
            "files": [
                "dashboard/App.tsx",
                "src/api/command-run-telemetry.js",
            ],
            "tables": [
                "agentsam_workflow_runs",
                "agentsam_stream_events",
                "agentsam_command_run",
            ],
            "routes": [],
            "dashboard_routes": ["/dashboard/workflows/visualizer"],
        },
        {
            "slug": "queue",
            "todo_id": f"todo_viz_queue_{ymd_compact}",
            "task_id": f"task_viz_queue_{ymd_compact}",
            "title": "Expose Agent Sam todo/plan queue in dashboard",
            "todo_priority": "medium",
            "plan_priority": "P1",
            "sort_order": 50,
            "order_index": 4,
            "description": "Surface D1 agentsam_todo + agentsam_plans + agentsam_plan_tasks for the workspace (read-focused UI).",
            "files": [
                "dashboard/App.tsx",
                "src/api/agent.js",
                "src/api/hub.js",
            ],
            "tables": [
                "agentsam_todo",
                "agentsam_plans",
                "agentsam_plan_tasks",
            ],
            "routes": [
                "GET /api/agent/todo",
                "GET /api/hub/*",
            ],
            "dashboard_routes": ["/dashboard/agent-sam/queue"],
        },
        {
            "slug": "failed",
            "todo_id": f"todo_viz_failed_{ymd_compact}",
            "task_id": f"task_viz_failed_{ymd_compact}",
            "title": "Make failed workflows visible instead of hiding them",
            "todo_priority": "high",
            "plan_priority": "P0",
            "sort_order": 60,
            "order_index": 5,
            "description": "Treat status=failed workflow runs as first-class observability; show error_message, completed_at, node context in analytics/UI — never delete failed runs.",
            "files": [
                "src/api/analytics/overview.js",
                "dashboard/components/analytics/tabs/OverviewTab.tsx",
            ],
            "tables": ["agentsam_workflow_runs", "agentsam_error_events"],
            "routes": ["GET /api/analytics/overview"],
            "dashboard_routes": ["/dashboard/analytics"],
        },
    ]


def main() -> None:
    _require_env()
    global D1_URL, D1_HDR
    D1_URL = (
        f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT}"
        f"/d1/database/{CF_DB_ID}/query"
    )
    D1_HDR = {
        "Authorization": f"Bearer {CF_TOKEN}",
        "Content-Type": "application/json",
    }

    plan_date, ymd_compact = _utc_ymd()
    plan_id = f"plan_visualizer_{ymd_compact}"
    run_group_id = f"viz_seed_{ymd_compact}"
    # Deterministic per day so re-running the script replaces the same proof row (no deletes).
    wrun_id = f"wrun_visualizer_seed_{ymd_compact}"

    print()
    print("=" * 72)
    print("  Agent Sam — Visualizer / analytics backlog seed (D1 + Supabase mirror)")
    print(f"  plan_id      : {plan_id}")
    print(f"  workflow_key : {WORKFLOW_KEY}")
    print(f"  workspace    : {WORKSPACE_ID}")
    print("=" * 72)

    task_defs = build_task_defs(ymd_compact)
    linked_todo_ids = [t["todo_id"] for t in task_defs]

    # ── D1: agentsam_workflows (registry) ─────────────────────────────────────
    d1_exec(
        """INSERT OR REPLACE INTO agentsam_workflows (
             id, workflow_key, display_name, description, workflow_type, trigger_type,
             default_mode, default_task_type, risk_level, requires_approval,
             max_concurrent_nodes, timeout_ms, is_platform_global, quality_gate_json,
             metadata_json, is_active, updated_at
           ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, datetime('now'))""",
        [
            WF_REGISTRY_ID,
            WORKFLOW_KEY,
            "Agent Sam — Visualizer build-out",
            "Backlog sync for analytics System Pulse, workflow visualizer, queue UI, "
            "and failed-run observability. Seeded by agentsam_seed_visualizer_todos.py.",
            "feature",
            "manual",
            "agent",
            "execute",
            "low",
            0,
            1,
            600000,
            0,
            json.dumps({"min_quality_score": 0.0}),
            json.dumps(
                {
                    "project_key": PROJECT_KEY,
                    "plan_id": plan_id,
                    "dashboard_targets": list(
                        {
                            r
                            for t in task_defs
                            for r in t.get("dashboard_routes", [])
                        }
                    ),
                }
            ),
            1,
        ],
    )

    # ── D1: agentsam_mcp_workflows (FK parent for agentsam_workflow_runs) ─────
    d1_exec(
        """INSERT OR REPLACE INTO agentsam_mcp_workflows (
             id, workflow_key, display_name, description, status, priority,
             steps_json, tools_json, acceptance_criteria_json, tenant_id, workspace_id,
             trigger_type, is_active, category, task_type, updated_at
           ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, datetime('now'))""",
        [
            MCP_WORKFLOW_ID,
            WORKFLOW_KEY,
            "Agent Sam — Visualizer build-out (MCP)",
            "MCP workflow row for workflow_runs FK linkage; mirrors registry workflow_key.",
            "ready",
            "high",
            json.dumps(
                [
                    {"key": "seed", "title": "Seed backlog"},
                    {"key": "implement", "title": "Implement dashboard + API tasks"},
                ]
            ),
            json.dumps([]),
            json.dumps(
                [
                    "D1 todos/plan/tasks created",
                    "Supabase mirror rows upserted",
                    "Zero LLM spend for this script",
                ]
            ),
            TENANT_ID,
            WORKSPACE_ID,
            "manual",
            1,
            "general",
            "agent_workflow",
        ],
    )

    # ── D1: plan ─────────────────────────────────────────────────────────────
    morning = (
        f"Visualizer + System Pulse initiative. {len(task_defs)} tracked todos "
        f"under project_key={PROJECT_KEY}. Mirror proof run: {wrun_id}."
    )
    d1_exec(
        """INSERT OR REPLACE INTO agentsam_plans (
             id, tenant_id, workspace_id, plan_date, plan_type, title, status,
             morning_brief, tasks_total, tasks_done, tasks_blocked,
             linked_project_keys, linked_todo_ids, updated_at
           ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, unixepoch())""",
        [
            plan_id,
            TENANT_ID,
            WORKSPACE_ID,
            plan_date,
            "feature",
            f"Agent Sam visualizer / System Pulse — {plan_date}",
            "active",
            morning,
            len(task_defs),
            0,
            0,
            json.dumps([PROJECT_KEY]),
            json.dumps(linked_todo_ids),
        ],
    )

    # ── D1: todos + plan_tasks ───────────────────────────────────────────────
    for t in task_defs:
        routes = list(
            dict.fromkeys((t.get("routes") or []) + (t.get("dashboard_routes") or []))
        )
        ctx = {
            "project_key": PROJECT_KEY,
            "plan_id": plan_id,
            "todo_id": t["todo_id"],
            "plan_task_id": t["task_id"],
            "files": t["files"],
            "tables": t["tables"],
            "routes": routes,
        }
        d1_exec(
            """INSERT OR REPLACE INTO agentsam_todo (
                 id, tenant_id, workspace_id, title, description, status, priority,
                 plan_id, project_key, task_type, execution_status, sort_order,
                 context_snapshot, tags, updated_at
               ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, datetime('now'))""",
            [
                t["todo_id"],
                TENANT_ID,
                WORKSPACE_ID,
                t["title"],
                t["description"],
                "open",
                t["todo_priority"],
                plan_id,
                PROJECT_KEY,
                "execute",
                "queued",
                t["sort_order"],
                json.dumps(ctx),
                json.dumps(["visualizer", "analytics", PROJECT_KEY]),
            ],
        )
        d1_exec(
            """INSERT OR REPLACE INTO agentsam_plan_tasks (
                 id, tenant_id, workspace_id, plan_id, todo_id, order_index, title,
                 description, priority, category, status,
                 files_involved, tables_involved, routes_involved
               ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            [
                t["task_id"],
                TENANT_ID,
                WORKSPACE_ID,
                plan_id,
                t["todo_id"],
                t["order_index"],
                t["title"],
                t["description"],
                t["plan_priority"],
                "frontend",
                "todo",
                json.dumps(t["files"]),
                json.dumps(t["tables"]),
                json.dumps(routes),
            ],
        )

    # ── D1: workflow run (sync proof; completed, not deleted on failure elsewhere) ─
    meta = {
        "script": "agentsam_seed_visualizer_todos.py",
        "plan_id": plan_id,
        "workflow_key": WORKFLOW_KEY,
        "todo_ids": linked_todo_ids,
        "task_ids": [t["task_id"] for t in task_defs],
    }
    d1_exec(
        """INSERT OR REPLACE INTO agentsam_workflow_runs (
             id, workflow_id, workflow_key, display_name,
             tenant_id, workspace_id, user_id, d1_auth_user_id, user_email,
             run_group_id, trigger_type, status,
             input_json, output_json, step_results_json,
             steps_completed, steps_total, error_message,
             model_used, input_tokens, output_tokens, cost_usd,
             environment, git_branch,
             supabase_sync_status, metadata_json,
             started_at, completed_at, updated_at
           ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, unixepoch(), unixepoch(), datetime('now'))""",
        [
            wrun_id,
            MCP_WORKFLOW_ID,
            WORKFLOW_KEY,
            "Visualizer backlog seed — mirror proof",
            TENANT_ID,
            WORKSPACE_ID,
            USER_ID or None,
            USER_ID or None,
            USER_EMAIL or None,
            run_group_id,
            "manual",
            "completed",
            json.dumps({"plan_id": plan_id, "seed": True}),
            json.dumps({"ok": True, "tasks": len(task_defs)}),
            json.dumps([{"step": "seed", "status": "ok"}]),
            1,
            1,
            None,
            None,
            0,
            0,
            0.0,
            "production",
            "main",
            "pending",
            json.dumps(meta),
        ],
    )

    # ── Supabase mirror (subset of columns; jsonb arrays for involvement) ─────
    supa_post_upsert(
        "agentsam_plans",
        {
            "id": plan_id,
            "plan_date": plan_date,
            "title": f"Agent Sam visualizer / System Pulse — {plan_date}",
            "status": "active",
            "morning_brief": morning,
            "tasks_total": len(task_defs),
            "tasks_done": 0,
            "tasks_blocked": 0,
        },
    )

    for t in task_defs:
        routes = list(
            dict.fromkeys((t.get("routes") or []) + (t.get("dashboard_routes") or []))
        )
        supa_post_upsert(
            "agentsam_plan_tasks",
            {
                "id": t["task_id"],
                "plan_id": plan_id,
                "order_index": t["order_index"],
                "title": t["title"],
                "description": t["description"],
                "priority": t["plan_priority"],
                "status": "todo",
                "category": "frontend",
                "files_involved": t["files"],
                "tables_involved": t["tables"],
                "routes_involved": routes,
            },
        )

    started = datetime.now(timezone.utc).isoformat()
    supa_post_upsert(
        "agentsam_workflow_runs",
        {
            "id": wrun_id,
            "d1_run_id": wrun_id,
            "tenant_id": TENANT_ID,
            "workspace_id": WORKSPACE_ID,
            "workflow_id": MCP_WORKFLOW_ID,
            "workflow_key": WORKFLOW_KEY,
            "display_name": "Visualizer backlog seed — mirror proof",
            "trigger_type": "manual",
            "status": "completed",
            "input_json": {"plan_id": plan_id, "seed": True},
            "output_json": {"ok": True, "tasks": len(task_defs)},
            "step_results_json": [{"step": "seed", "status": "ok"}],
            "steps_completed": 1,
            "steps_total": 1,
            "error_message": None,
            "model_used": None,
            "input_tokens": 0,
            "output_tokens": 0,
            "cost_usd": 0.0,
            "environment": "production",
            "retry_count": 0,
            "started_at": started,
            "completed_at": started,
        },
    )

    # ── Verify D1 ──────────────────────────────────────────────────────────────
    n_todo = d1(
        "SELECT COUNT(*) AS n FROM agentsam_todo WHERE plan_id = ? AND project_key = ?",
        [plan_id, PROJECT_KEY],
    )[0]["n"]
    n_task = d1(
        "SELECT COUNT(*) AS n FROM agentsam_plan_tasks WHERE plan_id = ?",
        [plan_id],
    )[0]["n"]
    if int(n_todo) != len(task_defs) or int(n_task) != len(task_defs):
        raise RuntimeError(f"D1 verify: expected {len(task_defs)} todos/tasks, got {n_todo}/{n_task}")

    print()
    print("OK — D1: agentsam_workflows, agentsam_mcp_workflows, plan, todos, plan_tasks, workflow_run")
    print(f"OK — Supabase: agentsam_plans, agentsam_plan_tasks ({len(task_defs)}), agentsam_workflow_runs")
    print(f"     wrun_id / d1_run_id : {wrun_id}")
    print()
    print("  Map every Cursor change to one of:")
    for t in task_defs:
        print(f"    - {t['todo_id']}  /  {t['task_id']}  — {t['title']}")
    print()


if __name__ == "__main__":
    main()
