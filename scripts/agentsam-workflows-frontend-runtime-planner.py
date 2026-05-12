#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import time
from pathlib import Path
from typing import Any

ROOT = Path.cwd()
ARTIFACTS = ROOT / "artifacts"
ARTIFACTS.mkdir(parents=True, exist_ok=True)

D1_DB = os.getenv("IAM_D1_DB", "inneranimalmedia-business")
WRANGLER_CONFIG = os.getenv("IAM_WRANGLER_CONFIG", "wrangler.production.toml")
D1_REMOTE = os.getenv("IAM_D1_REMOTE", "1").lower() not in {"0", "false", "no"}

TENANT_ID = os.getenv("AGENTSAM_TENANT_ID", "tenant_sam_primeaux")
WORKSPACE_ID = os.getenv("AGENTSAM_WORKSPACE_ID", "global")

PLAN_ID = "plan_agentsam_workflows_frontend_runtime_20260512"

OUT_REPORT = ARTIFACTS / "agentsam-workflows-frontend-runtime-report.json"
OUT_PLAN = ARTIFACTS / "agentsam-workflows-frontend-runtime-plan.md"
OUT_SQL = ARTIFACTS / "agentsam-workflows-frontend-runtime-plan.sql"
OUT_VALIDATE = ARTIFACTS / "agentsam-workflows-frontend-runtime-validate.sh"
OUT_CURSOR_PROMPT = ARTIFACTS / "agentsam-workflows-frontend-runtime-implementation-prompt.txt"

CANONICAL_SPINE = (
    "agentsam_workflows -> agentsam_workflow_runs -> agentsam_execution_steps; "
    "agentsam_plans.workflow_run_id -> agentsam_workflow_runs.id; "
    "agentsam_plan_tasks.workflow_run_id -> agentsam_workflow_runs.id; "
    "agentsam_plan_tasks.execution_step_id -> agentsam_execution_steps.id; "
    "agentsam_approval_queue.workflow_run_id/command_run_id/execution_step_id link approvals to runs"
)

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
    "agentsam_execution_dependency_graph",
    "agentsam_commands",
    "agentsam_scripts",
    "agentsam_mcp_workflows",
    "agentsam_mcp_tools",
    "agentsam_artifacts",
    "agentsam_memory",
]

SCAN_FILES = [
    "src/api/agent.js",
    "src/index.js",
    "src/core/agentsam-planner.js",
    "src/core/agentsam-task-executor.js",
    "src/core/workflow-executor.js",
    "src/core/agentsam-plan-supabase-public-sync.js",
    "src/core/capability-router.js",
    "src/core/workspace-capability-actions/index.js",
    "src/core/workspace-capability-actions/excalidraw.js",
    "dashboard/features/agent-chat/ChatAssistant.tsx",
    "dashboard/features/agent-chat/hooks/useAgentChatStream.ts",
    "dashboard/features/agent-chat/streamParsing.ts",
    "dashboard/features/agent-chat/types.ts",
    "dashboard/components/analytics/panels/AgentChatPlanTracePanel.tsx",
    "dashboard/components/MonacoSurface.tsx",
    "dashboard/components/MonacoEditorView.tsx",
    "dashboard/components/ExcalidrawView.tsx",
    "dashboard/components/BrowserView.tsx",
]

PATTERNS = {
    "workflow_tables": r"agentsam_workflows|agentsam_workflow_runs|agentsam_workflow_nodes|agentsam_workflow_edges",
    "execution_steps": r"agentsam_execution_steps|execution_step_id|executionStepId",
    "plan_linkage": r"agentsam_plans|agentsam_plan_tasks|workflow_run_id|workflowRunId",
    "workflow_events": r"workflow_start|workflow_step|workflow_complete|plan_created|task_start|task_complete|approval_required",
    "approval": r"agentsam_approval_queue|approval_required|approval_pending|plan-task/resume|proposals",
    "frontend_stream": r"EventSource|ReadableStream|consumeAgentChatSseBody|streamParsing|SSE|onToolApprovalRequest",
    "surface_monaco": r"monaco|Monaco|monaco_edit|patch_intent",
    "surface_excalidraw": r"excalidraw|Excalidraw|excalidraw_diagram|diagram_json",
    "browser_playwright": r"browser|BrowserView|playwright|screenshot|capture",
    "supabase": r"supabase|Supabase|supabase_sync|scheduleMirrorAgentChatPlanToSupabase",
}

IMPLEMENTATION_TASKS = [
    {
        "id": "task_workflows_runtime_001_catalog_audit",
        "order_index": 1,
        "title": "Audit workflow catalog and template quality",
        "description": "Prove which agentsam_workflows rows are active, which have nodes/edges, which are platform-global vs workspace-specific, and which should appear in the frontend workflow picker.",
        "priority": "P0",
        "category": "db",
        "handler_type": "db_query",
        "handler_key": "audit_agentsam_workflow_catalog",
        "risk_level": "low",
        "requires_approval": 0,
        "estimated_minutes": 35,
        "files": [],
        "tables": ["agentsam_workflows", "agentsam_workflow_nodes", "agentsam_workflow_edges"],
        "routes": [],
        "acceptance": [
            "active workflows have node_count and edge_count visible",
            "wf_agent_chat_plan exists and has required nodes",
            "frontend-eligible workflow list is defined without hardcoding"
        ],
    },
    {
        "id": "task_workflows_runtime_002_api_catalog_routes",
        "order_index": 2,
        "title": "Expose workflow catalog and run trace APIs",
        "description": "Add/verify authenticated API routes that return active workflow templates, nodes, edges, recent runs, and run detail. Frontend must not scrape D1 directly or rely on hardcoded workflow keys.",
        "priority": "P0",
        "category": "backend",
        "handler_type": "agent",
        "handler_key": "wire_workflow_catalog_api",
        "risk_level": "low",
        "requires_approval": 0,
        "estimated_minutes": 50,
        "files": ["src/api/agent.js", "src/index.js"],
        "tables": ["agentsam_workflows", "agentsam_workflow_nodes", "agentsam_workflow_edges", "agentsam_workflow_runs", "agentsam_execution_steps"],
        "routes": ["/api/agentsam/workflows", "/api/agentsam/workflows/:id", "/api/agentsam/workflow-runs/:id", "/api/agentsam/agent-chat-plan-trace"],
        "acceptance": [
            "GET workflow catalog returns templates with node_count/edge_count",
            "GET run detail returns run, steps, linked plan/tasks, approvals",
            "all routes are workspace scoped"
        ],
    },
    {
        "id": "task_workflows_runtime_003_frontend_workflow_picker",
        "order_index": 3,
        "title": "Make frontend use real agentsam_workflows catalog",
        "description": "Replace static workflow UX with a real workflow picker/list powered by the catalog API. Selecting a workflow should show nodes, edges, risk, approval requirement, and run history.",
        "priority": "P0",
        "category": "frontend",
        "handler_type": "agent",
        "handler_key": "workflow_catalog_frontend_picker",
        "risk_level": "low",
        "requires_approval": 0,
        "estimated_minutes": 65,
        "files": ["dashboard/features/agent-chat/ChatAssistant.tsx", "dashboard/features/agent-chat/hooks/useAgentChatStream.ts", "dashboard/features/agent-chat/types.ts"],
        "tables": ["agentsam_workflows", "agentsam_workflow_nodes", "agentsam_workflow_edges"],
        "routes": ["/api/agentsam/workflows"],
        "acceptance": [
            "frontend shows actual active workflows",
            "wf_agent_chat_plan is visible with nodes/edges",
            "no hardcoded workflow catalog in JSX"
        ],
    },
    {
        "id": "task_workflows_runtime_004_start_workflow_run",
        "order_index": 4,
        "title": "Start selected workflow as real workflow_run",
        "description": "When user clicks/run asks for workflow execution, create agentsam_workflow_runs linked to selected workflow_id, then create execution_steps from active workflow_nodes using execution_id = workflow_run.id.",
        "priority": "P0",
        "category": "backend",
        "handler_type": "db_query",
        "handler_key": "start_selected_workflow_run",
        "risk_level": "medium",
        "requires_approval": 0,
        "estimated_minutes": 70,
        "files": ["src/api/agent.js", "src/core/agentsam-planner.js", "src/core/agentsam-task-executor.js", "src/core/workflow-executor.js"],
        "tables": ["agentsam_workflows", "agentsam_workflow_nodes", "agentsam_workflow_edges", "agentsam_workflow_runs", "agentsam_execution_steps"],
        "routes": ["/api/agentsam/workflows/:id/run", "/api/agent/*"],
        "acceptance": [
            "new workflow_run.workflow_id references selected agentsam_workflows.id",
            "one execution_step is created per active node",
            "steps_total equals active node count",
            "no agentsam_executions parent assumption"
        ],
    },
    {
        "id": "task_workflows_runtime_005_graph_executor_edges",
        "order_index": 5,
        "title": "Execute graph edges using workflow_nodes and workflow_edges",
        "description": "Make runtime execution follow workflow_nodes and workflow_edges instead of ad-hoc planner branches. Support sequential, risk/approval edges, fallback edge, and terminal timeout edge.",
        "priority": "P0",
        "category": "backend",
        "handler_type": "agent",
        "handler_key": "execute_workflow_graph_edges",
        "risk_level": "medium",
        "requires_approval": 0,
        "estimated_minutes": 90,
        "files": ["src/core/workflow-executor.js", "src/core/agentsam-task-executor.js", "src/api/agent.js"],
        "tables": ["agentsam_workflow_nodes", "agentsam_workflow_edges", "agentsam_workflow_runs", "agentsam_execution_steps"],
        "routes": ["/api/agentsam/workflows/:id/run"],
        "acceptance": [
            "current_node_key updates during run",
            "edge_taken is written to execution_steps",
            "workflow_step SSE emits node_key, status, edge_taken",
            "workflow_complete emits final rollup"
        ],
    },
    {
        "id": "task_workflows_runtime_006_plan_task_bridge",
        "order_index": 6,
        "title": "Bridge workflow nodes to plan_tasks when run is plan-backed",
        "description": "For agent chat work goals, link plan_tasks to execution_steps generated from workflow nodes. Frontend should show one coherent board, not separate plan and workflow realities.",
        "priority": "P0",
        "category": "backend",
        "handler_type": "db_query",
        "handler_key": "bridge_workflow_nodes_to_plan_tasks",
        "risk_level": "medium",
        "requires_approval": 0,
        "estimated_minutes": 70,
        "files": ["src/core/agentsam-planner.js", "src/core/agentsam-task-executor.js"],
        "tables": ["agentsam_plans", "agentsam_plan_tasks", "agentsam_workflow_runs", "agentsam_execution_steps"],
        "routes": ["/api/agent/*"],
        "acceptance": [
            "plan.workflow_run_id is populated",
            "each plan_task.workflow_run_id matches run",
            "each plan_task.execution_step_id points to a real step",
            "task board and workflow trace show same run"
        ],
    },
    {
        "id": "task_workflows_runtime_007_approval_edges",
        "order_index": 7,
        "title": "Make approval_gate nodes first-class workflow nodes",
        "description": "Risky terminal/db/deploy/playwright nodes must route to approval_gate nodes, create command_run and approval_queue, emit approval_required, and pause until server-side approval.",
        "priority": "P0",
        "category": "infra",
        "handler_type": "approval_gate",
        "handler_key": "workflow_approval_gate_nodes",
        "risk_level": "high",
        "requires_approval": 1,
        "estimated_minutes": 75,
        "files": ["src/core/agentsam-task-executor.js", "src/api/agent.js", "dashboard/features/agent-chat/ChatAssistant.tsx"],
        "tables": ["agentsam_approval_queue", "agentsam_command_run", "agentsam_execution_steps", "agentsam_workflow_runs"],
        "routes": ["/api/agent/proposals/:id/approve", "/api/agent/proposals/:id/deny", "/api/agent/plan-task/resume"],
        "acceptance": [
            "approval_queue.workflow_run_id is set",
            "approval_queue.execution_step_id is set",
            "execution_step.status = approval_pending",
            "not_required never authorizes planner terminal execution",
            "Allow resumes exact node/task only"
        ],
    },
    {
        "id": "task_workflows_runtime_008_frontend_sse_trace",
        "order_index": 8,
        "title": "Render workflow_start/step/complete in frontend",
        "description": "Frontend stream parser must render workflow events as an execution board: nodes, statuses, edge taken, approvals, outputs, and final rollup.",
        "priority": "P0",
        "category": "frontend",
        "handler_type": "agent",
        "handler_key": "render_workflow_sse_trace",
        "risk_level": "low",
        "requires_approval": 0,
        "estimated_minutes": 65,
        "files": ["dashboard/features/agent-chat/streamParsing.ts", "dashboard/features/agent-chat/hooks/useAgentChatStream.ts", "dashboard/features/agent-chat/ChatAssistant.tsx", "dashboard/features/agent-chat/types.ts"],
        "tables": ["agentsam_workflow_runs", "agentsam_execution_steps"],
        "routes": ["/api/agent/*"],
        "acceptance": [
            "workflow_start creates visible run card",
            "workflow_step updates node status",
            "approval_required creates inline approval card",
            "workflow_complete stops spinner"
        ],
    },
    {
        "id": "task_workflows_runtime_009_supabase_cloudflare_mirror",
        "order_index": 9,
        "title": "Mirror workflow execution to Supabase and Cloudflare artifacts",
        "description": "Make workflow run data visible across Supabase mirror tables and Cloudflare/R2 deploy artifacts without making Supabase the source of truth.",
        "priority": "P1",
        "category": "infra",
        "handler_type": "script",
        "handler_key": "workflow_supabase_cloudflare_mirror",
        "risk_level": "medium",
        "requires_approval": 0,
        "estimated_minutes": 60,
        "files": ["src/core/agentsam-plan-supabase-public-sync.js", "src/core/agentsam-supabase-sync.js", "scripts/agentsam-supabase-direct-sync.py", "scripts/dev-deploy.sh"],
        "tables": ["agentsam_workflow_runs", "agentsam_execution_steps", "agent_context_snapshots", "agentsam_debug_snapshots"],
        "routes": ["/api/agentsam/agent-chat-plan-trace"],
        "acceptance": [
            "D1 run has supabase_sync_status",
            "Supabase mirror contains run/steps/events/debug snapshot when configured",
            "Supabase failure does not fail D1 run",
            "R2/deploy manifest references workflow run when deploy-triggered"
        ],
    },
    {
        "id": "task_workflows_runtime_010_workflow_dashboard_panel",
        "order_index": 10,
        "title": "Add workflow graph/run panel to dashboard Agent tab",
        "description": "Show active workflow templates, recent runs, node graph, run status, step count, approval pending count, Supabase sync status, and last error in one panel.",
        "priority": "P1",
        "category": "ux",
        "handler_type": "agent",
        "handler_key": "workflow_dashboard_panel",
        "risk_level": "low",
        "requires_approval": 0,
        "estimated_minutes": 80,
        "files": ["dashboard/components/analytics/panels/AgentChatPlanTracePanel.tsx", "dashboard/features/agent-chat/ChatAssistant.tsx"],
        "tables": ["agentsam_workflows", "agentsam_workflow_runs", "agentsam_execution_steps", "agentsam_approval_queue"],
        "routes": ["/api/agentsam/workflows", "/api/agentsam/workflow-runs/:id"],
        "acceptance": [
            "dashboard shows actual workflow graph",
            "dashboard shows recent runs",
            "dashboard highlights stuck approval_pending/running/timed_out nodes",
            "no mock data"
        ],
    },
]


def q(value: Any) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, (int, float)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def j(value: Any) -> str:
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False)


def run_cmd(cmd: list[str], timeout: int = 120) -> dict[str, Any]:
    try:
        proc = subprocess.run(cmd, cwd=str(ROOT), text=True, capture_output=True, timeout=timeout, check=False)
        return {
            "ok": proc.returncode == 0,
            "returncode": proc.returncode,
            "stdout": proc.stdout,
            "stderr": proc.stderr,
            "cmd": cmd,
        }
    except Exception as exc:
        return {"ok": False, "returncode": None, "stdout": "", "stderr": str(exc), "cmd": cmd}


def parse_json_rows(stdout: str) -> list[dict[str, Any]]:
    text = (stdout or "").strip()
    if not text:
        return []
    try:
        data = json.loads(text)
    except Exception:
        starts = [i for i in [text.find("["), text.find("{")] if i >= 0]
        if not starts:
            return []
        try:
            data = json.loads(text[min(starts):])
        except Exception:
            return []
    if isinstance(data, list) and data and isinstance(data[0], dict):
        rows = data[0].get("results") or data[0].get("result") or []
        return rows if isinstance(rows, list) else []
    if isinstance(data, dict):
        rows = data.get("results") or data.get("result") or []
        return rows if isinstance(rows, list) else []
    return []


def d1(sql: str) -> list[dict[str, Any]]:
    cmd = ["npx", "wrangler", "d1", "execute", D1_DB]
    if D1_REMOTE:
        cmd.append("--remote")
    cmd.extend(["-c", WRANGLER_CONFIG, "--json", "--command", sql])
    res = run_cmd(cmd, timeout=180)
    return parse_json_rows(res.get("stdout", "")) if res["ok"] else []


def read_file(path: str) -> str:
    try:
        return (ROOT / path).read_text(errors="replace")
    except Exception:
        return ""


def scan_repo() -> dict[str, Any]:
    out: dict[str, Any] = {}
    for path in SCAN_FILES:
        text = read_file(path)
        hits = {}
        for key, pattern in PATTERNS.items():
            rx = re.compile(pattern, re.I)
            examples = []
            for i, line in enumerate(text.splitlines(), 1):
                if rx.search(line):
                    examples.append({"line": i, "text": line.strip()[:220]})
                    if len(examples) >= 8:
                        break
            hits[key] = {"count": len(rx.findall(text)), "examples": examples}
        out[path] = {
            "exists": (ROOT / path).exists(),
            "size": len(text.encode("utf-8")),
            "hits": hits,
        }
    return out


def inspect_d1() -> dict[str, Any]:
    tables = {}
    for table in D1_TABLES:
        cols = d1(f"PRAGMA table_info({table});")
        count = None
        if cols:
            count_rows = d1(f"SELECT COUNT(*) AS n FROM {table};")
            count = count_rows[0].get("n") if count_rows else None
        tables[table] = {
            "exists": bool(cols),
            "count": count,
            "columns": [c.get("name") for c in cols],
        }

    workflow_catalog = d1("""
SELECT
  w.id,
  w.workflow_key,
  w.display_name,
  w.workspace_id,
  w.is_platform_global,
  w.is_active,
  w.risk_level,
  w.requires_approval,
  COUNT(DISTINCT n.id) AS nodes,
  COUNT(DISTINCT e.id) AS edges
FROM agentsam_workflows w
LEFT JOIN agentsam_workflow_nodes n ON n.workflow_id=w.id
LEFT JOIN agentsam_workflow_edges e ON e.workflow_id=w.id
GROUP BY w.id
ORDER BY w.updated_at DESC
LIMIT 30;
""")

    spine = d1("""
SELECT
  COUNT(*) AS step_count,
  SUM(CASE WHEN wr.id IS NULL THEN 1 ELSE 0 END) AS orphan_workflow_steps
FROM agentsam_execution_steps s
LEFT JOIN agentsam_workflow_runs wr ON wr.id=s.execution_id;
""")

    recent_runs = d1("""
SELECT
  wr.id,
  wr.workflow_key,
  wr.workflow_id,
  wr.status,
  wr.steps_completed,
  wr.steps_total,
  wr.current_node_key,
  wr.supabase_sync_status,
  wr.created_at,
  COUNT(s.id) AS step_count
FROM agentsam_workflow_runs wr
LEFT JOIN agentsam_execution_steps s ON s.execution_id=wr.id
GROUP BY wr.id
ORDER BY wr.created_at DESC
LIMIT 20;
""")

    recent_plans = d1("""
SELECT
  p.id,
  p.title,
  p.status,
  p.workflow_id,
  p.workflow_run_id,
  COUNT(t.id) AS tasks,
  SUM(CASE WHEN t.execution_step_id IS NOT NULL THEN 1 ELSE 0 END) AS tasks_with_steps,
  SUM(CASE WHEN t.workflow_run_id IS NOT NULL THEN 1 ELSE 0 END) AS tasks_with_wrun
FROM agentsam_plans p
LEFT JOIN agentsam_plan_tasks t ON t.plan_id=p.id
GROUP BY p.id
ORDER BY p.created_at DESC
LIMIT 15;
""")

    approvals = d1("""
SELECT
  id,
  status,
  workflow_run_id,
  command_run_id,
  execution_step_id,
  tool_name,
  risk_level,
  created_at,
  expires_at
FROM agentsam_approval_queue
ORDER BY created_at DESC
LIMIT 20;
""")

    return {
        "tables": tables,
        "workflow_catalog": workflow_catalog,
        "spine_check": spine[0] if spine else {},
        "recent_runs": recent_runs,
        "recent_plans": recent_plans,
        "recent_approvals": approvals,
    }


def write_report(report: dict[str, Any]) -> None:
    OUT_REPORT.write_text(json.dumps(report, indent=2, sort_keys=True))


def write_plan(report: dict[str, Any]) -> None:
    lines = []
    lines.append("# Agent Sam Workflows Frontend Runtime Implementation Plan")
    lines.append("")
    lines.append(f"Generated: `{report['generated_at']}`")
    lines.append(f"Plan ID: `{PLAN_ID}`")
    lines.append("")
    lines.append("## Goal")
    lines.append("")
    lines.append("Make `agentsam_workflows` the real frontend/runtime execution system, not just verified D1 schema.")
    lines.append("")
    lines.append("## Canonical runtime spine")
    lines.append("")
    lines.append(f"`{CANONICAL_SPINE}`")
    lines.append("")
    lines.append("## Current D1 proof")
    lines.append("")
    lines.append("### Spine check")
    lines.append("")
    lines.append("```json")
    lines.append(json.dumps(report["d1"].get("spine_check", {}), indent=2))
    lines.append("```")
    lines.append("")
    lines.append("### Workflow catalog sample")
    lines.append("")
    lines.append("| workflow_key | active | global | nodes | edges | risk | approval |")
    lines.append("|---|---:|---:|---:|---:|---|---:|")
    for row in report["d1"].get("workflow_catalog", [])[:20]:
        lines.append(
            f"| {row.get('workflow_key')} | {row.get('is_active')} | {row.get('is_platform_global')} | "
            f"{row.get('nodes')} | {row.get('edges')} | {row.get('risk_level')} | {row.get('requires_approval')} |"
        )
    lines.append("")
    lines.append("## Implementation tasks")
    lines.append("")
    for task in IMPLEMENTATION_TASKS:
        lines.append(f"### {task['order_index']}. {task['title']}")
        lines.append("")
        lines.append(f"- ID: `{task['id']}`")
        lines.append(f"- Priority: `{task['priority']}`")
        lines.append(f"- Category: `{task['category']}`")
        lines.append(f"- Handler: `{task['handler_type']}:{task['handler_key']}`")
        lines.append(f"- Risk: `{task['risk_level']}`")
        lines.append(f"- Requires approval: `{task['requires_approval']}`")
        lines.append(f"- Estimate: `{task['estimated_minutes']} min`")
        lines.append("")
        lines.append(task["description"])
        lines.append("")
        if task["files"]:
            lines.append("Files:")
            for item in task["files"]:
                lines.append(f"- `{item}`")
            lines.append("")
        if task["tables"]:
            lines.append("Tables:")
            for item in task["tables"]:
                lines.append(f"- `{item}`")
            lines.append("")
        if task["routes"]:
            lines.append("Routes:")
            for item in task["routes"]:
                lines.append(f"- `{item}`")
            lines.append("")
        lines.append("Acceptance:")
        for item in task["acceptance"]:
            lines.append(f"- {item}")
        lines.append("")
    OUT_PLAN.write_text("\n".join(lines))


def write_sql() -> None:
    now = int(time.time())
    title = "Agent Sam Workflows Frontend Runtime — Make D1 Workflows Executable in UI"
    brief = (
        "Implement agentsam_workflows as the real frontend/runtime graph system. "
        "D1 has verified workflow templates/runs/steps, but frontend must use catalog, run graph nodes/edges, "
        "stream workflow events, handle approvals, and mirror to Supabase/Cloudflare."
    )

    statements = []
    statements.append(f"""
INSERT INTO agentsam_plans (
  id, tenant_id, workspace_id, plan_date, plan_type, title, status,
  morning_brief, session_notes, tasks_total, tasks_done, tasks_blocked,
  linked_project_keys, linked_todo_ids, linked_context_ids,
  created_at, updated_at, graph_mode, risk_level, requires_approval
)
VALUES (
  {q(PLAN_ID)}, {q(TENANT_ID)}, {q(WORKSPACE_ID)}, {q('2026-05-12')}, 'feature',
  {q(title)}, 'active',
  {q(brief)},
  {q('Generated to convert verified agentsam_workflows D1 graph into real frontend/runtime execution. Do not create new schema. Use existing workflow tables and canonical spine.')},
  {len(IMPLEMENTATION_TASKS)}, 0, 0,
  {q(j(['agentsam_workflows','frontend_runtime','workflow_graph','cursor_replacement']))},
  '[]',
  {q(j(['agentsam.cursor_replacement.cli_master_plan','agentsam.workflow_optimization_sprint.20260512_deploy_checkpoint']))},
  {now}, {now}, 1, 'high', 1
)
ON CONFLICT(id) DO UPDATE SET
  title=excluded.title,
  status='active',
  morning_brief=excluded.morning_brief,
  session_notes=excluded.session_notes,
  tasks_total=excluded.tasks_total,
  linked_project_keys=excluded.linked_project_keys,
  linked_context_ids=excluded.linked_context_ids,
  updated_at={now},
  graph_mode=1,
  risk_level='high',
  requires_approval=1;
""".strip())

    for task in IMPLEMENTATION_TASKS:
        statements.append(f"""
INSERT INTO agentsam_plan_tasks (
  id, tenant_id, workspace_id, plan_id, order_index, title, description,
  priority, category, status, files_involved, tables_involved, routes_involved,
  depends_on, estimated_minutes, notes, output_summary, created_at,
  node_key, handler_key, handler_type, risk_level, requires_approval,
  quality_gate_json, edge_taken
)
VALUES (
  {q(task['id'])}, {q(TENANT_ID)}, {q(WORKSPACE_ID)}, {q(PLAN_ID)},
  {task['order_index']}, {q(task['title'])}, {q(task['description'])},
  {q(task['priority'])}, {q(task['category'])}, 'todo',
  {q(j(task['files']))},
  {q(j(task['tables']))},
  {q(j(task['routes']))},
  '[]',
  {task['estimated_minutes']},
  {q('Acceptance: ' + ' | '.join(task['acceptance']))},
  NULL,
  {now},
  {q(task['handler_key'])},
  {q(task['handler_key'])},
  {q(task['handler_type'])},
  {q(task['risk_level'])},
  {task['requires_approval']},
  {q(j({'acceptance': task['acceptance'], 'proof_required': True, 'canonical_spine': CANONICAL_SPINE}))},
  NULL
)
ON CONFLICT(id) DO UPDATE SET
  title=excluded.title,
  description=excluded.description,
  priority=excluded.priority,
  category=excluded.category,
  files_involved=excluded.files_involved,
  tables_involved=excluded.tables_involved,
  routes_involved=excluded.routes_involved,
  estimated_minutes=excluded.estimated_minutes,
  notes=excluded.notes,
  node_key=excluded.node_key,
  handler_key=excluded.handler_key,
  handler_type=excluded.handler_type,
  risk_level=excluded.risk_level,
  requires_approval=excluded.requires_approval,
  quality_gate_json=excluded.quality_gate_json;
""".strip())

    OUT_SQL.write_text("\n\n".join(statements) + "\n")


def write_validate() -> None:
    validate_sql = f"""
SELECT
  p.id,
  p.title,
  p.status,
  p.tasks_total,
  COUNT(t.id) AS tasks,
  SUM(CASE WHEN t.priority='P0' THEN 1 ELSE 0 END) AS p0_tasks,
  SUM(CASE WHEN t.requires_approval=1 THEN 1 ELSE 0 END) AS approval_tasks
FROM agentsam_plans p
LEFT JOIN agentsam_plan_tasks t ON t.plan_id=p.id
WHERE p.id='{PLAN_ID}'
GROUP BY p.id;

SELECT
  order_index,
  id,
  title,
  priority,
  category,
  handler_type,
  risk_level,
  requires_approval,
  status
FROM agentsam_plan_tasks
WHERE plan_id='{PLAN_ID}'
ORDER BY order_index;

SELECT
  w.workflow_key,
  w.display_name,
  w.is_active,
  COUNT(DISTINCT n.id) AS nodes,
  COUNT(DISTINCT e.id) AS edges
FROM agentsam_workflows w
LEFT JOIN agentsam_workflow_nodes n ON n.workflow_id=w.id
LEFT JOIN agentsam_workflow_edges e ON e.workflow_id=w.id
WHERE w.is_active=1
GROUP BY w.id
ORDER BY nodes DESC
LIMIT 20;
"""
    escaped = validate_sql.replace('"', '\\"').replace("\n", "\\n")
    OUT_VALIDATE.write_text(f"""#!/usr/bin/env bash
set -euo pipefail
cd /Users/samprimeaux/inneranimalmedia
npx wrangler d1 execute {D1_DB} --remote -c {WRANGLER_CONFIG} --command "{escaped}"
""")
    OUT_VALIDATE.chmod(0o755)


def write_prompt(report: dict[str, Any]) -> None:
    lines = []
    lines.append("AGENT SAM WORKFLOWS — FRONTEND RUNTIME IMPLEMENTATION")
    lines.append("")
    lines.append("Goal: make agentsam_workflows the real executable workflow graph in the frontend/runtime.")
    lines.append("")
    lines.append("Do not add schema. Use existing D1 tables.")
    lines.append("")
    lines.append("Canonical spine:")
    lines.append(CANONICAL_SPINE)
    lines.append("")
    lines.append("Required build order:")
    lines.append("1. Workflow catalog API")
    lines.append("2. Frontend workflow picker/trace panel")
    lines.append("3. Start workflow_run from selected agentsam_workflows row")
    lines.append("4. Generate execution_steps from active workflow_nodes")
    lines.append("5. Follow workflow_edges and update current_node_key/edge_taken")
    lines.append("6. Bridge plan_tasks to execution_steps when plan-backed")
    lines.append("7. Make approval_gate nodes first-class")
    lines.append("8. Render workflow_start/workflow_step/workflow_complete/approval_required in UI")
    lines.append("9. Mirror to Supabase best-effort")
    lines.append("10. Prove with D1 rows and UI trace")
    lines.append("")
    lines.append("Generated artifacts to read:")
    lines.append(f"- {OUT_REPORT}")
    lines.append(f"- {OUT_PLAN}")
    lines.append(f"- {OUT_SQL}")
    lines.append("")
    lines.append("Do not create new pages. Do not mock data. Do not use agentsam_executions as the parent of execution_steps.")
    lines.append("")
    lines.append("Acceptance: sending/starting a workflow from the frontend creates a real agentsam_workflow_runs row, real agentsam_execution_steps rows from workflow_nodes, visible SSE updates in the UI, and approval-gated pauses for risky nodes.")
    OUT_CURSOR_PROMPT.write_text("\n".join(lines))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply-plan", action="store_true", help="Apply generated agentsam_plans/tasks SQL to D1")
    parser.add_argument("--no-d1", action="store_true", help="Skip D1 inspection")
    args = parser.parse_args()

    print("Agent Sam Workflows Frontend Runtime Planner")
    print(f"repo: {ROOT}")
    print(f"d1: {D1_DB} remote={D1_REMOTE} config={WRANGLER_CONFIG}")
    print(f"plan_id: {PLAN_ID}")
    print("")

    print("[1/5] Scanning repo references...")
    repo_scan = scan_repo()
    for path, info in repo_scan.items():
        print(f"  {'OK' if info['exists'] else 'MISS'} {path}")

    print("[2/5] Inspecting D1 workflow tables...")
    d1_info = {"skipped": True}
    if not args.no_d1:
        d1_info = inspect_d1()
        print(f"  spine: {d1_info.get('spine_check')}")
        print(f"  workflows sampled: {len(d1_info.get('workflow_catalog', []))}")
    else:
        print("  skipped")

    report = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "plan_id": PLAN_ID,
        "tenant_id": TENANT_ID,
        "workspace_id": WORKSPACE_ID,
        "canonical_spine": CANONICAL_SPINE,
        "repo_scan": repo_scan,
        "d1": d1_info,
        "implementation_tasks": IMPLEMENTATION_TASKS,
    }

    print("[3/5] Writing artifacts...")
    write_report(report)
    write_plan(report)
    write_sql()
    write_validate()
    write_prompt(report)
    print(f"  wrote {OUT_REPORT}")
    print(f"  wrote {OUT_PLAN}")
    print(f"  wrote {OUT_SQL}")
    print(f"  wrote {OUT_VALIDATE}")
    print(f"  wrote {OUT_CURSOR_PROMPT}")

    if args.apply_plan:
        print("[4/5] Applying generated D1 plan/tasks SQL...")
        res = run_cmd(["npx", "wrangler", "d1", "execute", D1_DB, "--remote", "-c", WRANGLER_CONFIG, "--file", str(OUT_SQL)], timeout=300)
        print(res.get("stdout", ""))
        if not res["ok"]:
            print(res.get("stderr", ""))
            return 1
    else:
        print("[4/5] Apply skipped. Use --apply-plan to write plan/tasks to D1.")

    print("[5/5] Done.")
    print("")
    print("Review:")
    print(f"  cat {OUT_PLAN}")
    print("")
    print("Apply plan/tasks:")
    print(f"  python3 scripts/agentsam-workflows-frontend-runtime-planner.py --apply-plan")
    print("")
    print("Verify:")
    print(f"  bash {OUT_VALIDATE}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
