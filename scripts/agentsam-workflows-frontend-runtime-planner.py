#!/usr/bin/env python3
"""
Agent Sam Workflows Frontend Runtime Planner — v2

Changes from v1:
  - agentsam_workflow_handlers + agentsam_executions added to D1 inspection
  - Handler catalog audit: executor_kind breakdown, unresolved node handler_keys
  - Executions health: type/status breakdown, linkage check
  - Canonical spine updated
  - Creates agentsam_patch_sessions record when --apply-plan
  - Self-registers in agentsam_scripts via CF REST API
  - Logs to agentsam_script_runs via CF REST API
  - Sends HTML email report via RESEND_API_KEY (urllib only, no deps)

Governed by: primetech_agentic_flow_protocol
Python output: primetech_primeaux_paste_protocol

Run from repo root:
  python3 scripts/agentsam-workflows-frontend-runtime-planner.py

With plan write:
  python3 scripts/agentsam-workflows-frontend-runtime-planner.py --apply-plan

Env:
  CLOUDFLARE_ACCOUNT_ID   required
  CLOUDFLARE_API_TOKEN    required
  IAM_D1_DB               optional (default: inneranimalmedia-business)
  IAM_WRANGLER_CONFIG     optional (default: wrangler.production.toml)
  IAM_D1_REMOTE           optional (default: 1)
  AGENTSAM_TENANT_ID      optional (default: tenant_sam_primeaux)
  AGENTSAM_WORKSPACE_ID   optional (default: ws_inneranimalmedia)
  AGENTSAM_USER_ID        optional (default: au_871d920d1233cbd1)
  RESEND_API_KEY          optional — enables email report
  RESEND_FROM             optional (default: agent@inneranimalmedia.com)
  RESEND_TO               optional (default: sam@inneranimalmedia.com)
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

ROOT = Path.cwd()
ARTIFACTS = ROOT / "artifacts"
ARTIFACTS.mkdir(parents=True, exist_ok=True)

D1_DB          = os.getenv("IAM_D1_DB", "inneranimalmedia-business")
D1_DB_ID       = "cf87b717-d4e2-4cf8-bab0-a81268e32d49"
WRANGLER_CFG   = os.getenv("IAM_WRANGLER_CONFIG", "wrangler.production.toml")
D1_REMOTE      = os.getenv("IAM_D1_REMOTE", "1").lower() not in {"0", "false", "no"}
TENANT_ID      = os.getenv("AGENTSAM_TENANT_ID",    "tenant_sam_primeaux")
WORKSPACE_ID   = os.getenv("AGENTSAM_WORKSPACE_ID", "ws_inneranimalmedia")
USER_ID        = os.getenv("AGENTSAM_USER_ID",      "au_871d920d1233cbd1")
RESEND_KEY     = os.getenv("RESEND_API_KEY", "")
RESEND_FROM    = os.getenv("RESEND_FROM", "agent@inneranimalmedia.com")
RESEND_TO      = os.getenv("RESEND_TO",   "sam@inneranimalmedia.com")

PLAN_ID        = "plan_agentsam_workflows_frontend_runtime_20260523_v2"
SCRIPT_ID      = "scr_b07d1598"
SCRIPT_SLUG    = "agentsam_workflows_frontend_runtime_planner"
RULE_ID        = "primetech_agentic_flow_protocol"

OUT_REPORT     = ARTIFACTS / "agentsam-workflows-frontend-runtime-report.json"
OUT_PLAN       = ARTIFACTS / "agentsam-workflows-frontend-runtime-plan.md"
OUT_SQL        = ARTIFACTS / "agentsam-workflows-frontend-runtime-plan.sql"
OUT_VALIDATE   = ARTIFACTS / "agentsam-workflows-frontend-runtime-validate.sh"
OUT_PROMPT     = ARTIFACTS / "agentsam-workflows-frontend-runtime-cursor-prompt.txt"

CANONICAL_SPINE = (
    "agentsam_workflows → agentsam_workflow_nodes (handler_key) "
    "→ agentsam_workflow_handlers (executor_kind) "
    "→ agentsam_workflow_runs → agentsam_execution_steps; "
    "agentsam_executions cross-links plan_id + workflow_run_id + execution_step_id + subagent_id; "
    "agentsam_plans.workflow_run_id → agentsam_workflow_runs.id; "
    "agentsam_plan_tasks.execution_step_id → agentsam_execution_steps.id; "
    "agentsam_approval_queue.workflow_run_id / execution_step_id pause risky nodes"
)

D1_TABLES = [
    "agentsam_workflows",
    "agentsam_workflow_nodes",
    "agentsam_workflow_edges",
    "agentsam_workflow_handlers",
    "agentsam_workflow_runs",
    "agentsam_executions",
    "agentsam_execution_steps",
    "agentsam_plans",
    "agentsam_plan_tasks",
    "agentsam_approval_queue",
    # trace tables
    "agentsam_patch_sessions",
    "agentsam_script_runs",
    "agentsam_scripts",
]

SCAN_FILES = [
    "src/api/agent.js",
    "src/index.js",
    "src/core/agentsam-planner.js",
    "src/core/agentsam-task-executor.js",
    "src/core/workflow-executor.js",
    "src/core/agentsam-plan-supabase-public-sync.js",
    "src/core/capability-router.js",
    "src/core/resolveModel.js",
    "src/core/provider.js",
    "dashboard/features/agent-chat/ChatAssistant.tsx",
    "dashboard/features/agent-chat/hooks/useAgentChatStream.ts",
    "dashboard/features/agent-chat/streamParsing.ts",
    "dashboard/features/agent-chat/types.ts",
    "dashboard/components/analytics/panels/AgentChatPlanTracePanel.tsx",
    "dashboard/App.tsx",
]

PATTERNS = {
    "workflow_tables":    r"agentsam_workflows|agentsam_workflow_runs|agentsam_workflow_nodes|agentsam_workflow_edges",
    "workflow_handlers":  r"agentsam_workflow_handlers|handler_key|executor_kind|handler_config",
    "execution_steps":    r"agentsam_execution_steps|execution_step_id|executionStepId",
    "executions_table":   r"agentsam_executions|execution_type|subagent_id",
    "plan_linkage":       r"agentsam_plans|agentsam_plan_tasks|workflow_run_id|workflowRunId",
    "workflow_events":    r"workflow_start|workflow_step|workflow_complete|plan_created|task_start|task_complete",
    "approval":           r"agentsam_approval_queue|approval_required|approval_pending|plan-task/resume",
    "frontend_stream":    r"EventSource|ReadableStream|consumeAgentChatSseBody|streamParsing|SSE",
    "surface_monaco":     r"monaco|Monaco|monaco_edit|patch_intent",
    "surface_excalidraw": r"excalidraw|Excalidraw|excalidraw_diagram",
    "browser_playwright": r"browser|BrowserView|playwright|screenshot",
    "supabase":           r"supabase|Supabase|scheduleMirrorAgentChatPlan",
    "trace_tables":       r"agentsam_patch_sessions|agentsam_script_runs|patch_session_id|script_run_id",
}

IMPLEMENTATION_TASKS = [
    {
        "id": "task_wfrt_001_handler_catalog",
        "order_index": 1,
        "title": "Audit handler catalog — resolve every node handler_key",
        "description": (
            "Every agentsam_workflow_nodes row must resolve to a real agentsam_workflow_handlers row. "
            "Identify nodes with empty handler_config_json and no matching handler. "
            "Populate handler_config_json for the five most-used node types. "
            "This is the prerequisite for any real execution."
        ),
        "priority": "P0", "category": "db",
        "handler_type": "db_query", "handler_key": "audit_workflow_handler_catalog",
        "risk_level": "low", "requires_approval": 0, "estimated_minutes": 40,
        "files": [],
        "tables": ["agentsam_workflow_nodes", "agentsam_workflow_handlers"],
        "routes": [],
        "acceptance": [
            "zero nodes with handler_key NOT IN agentsam_workflow_handlers",
            "handler_config_json populated for agent_llm, approval, terminal, d1_sql, eval nodes",
            "executor_kind breakdown visible in D1 audit query",
        ],
    },
    {
        "id": "task_wfrt_002_catalog_api",
        "order_index": 2,
        "title": "Expose workflow catalog + handler registry APIs",
        "description": (
            "Add GET /api/agentsam/workflows (templates, node/edge counts, risk), "
            "GET /api/agentsam/workflows/:id (full nodes + edges + handlers), "
            "GET /api/agentsam/workflow-runs/:id (run + steps + approvals). "
            "Frontend must never query D1 directly or hardcode workflow keys."
        ),
        "priority": "P0", "category": "backend",
        "handler_type": "agent", "handler_key": "wire_workflow_catalog_api",
        "risk_level": "low", "requires_approval": 0, "estimated_minutes": 55,
        "files": ["src/api/agent.js", "src/index.js"],
        "tables": ["agentsam_workflows", "agentsam_workflow_nodes", "agentsam_workflow_edges",
                   "agentsam_workflow_handlers", "agentsam_workflow_runs", "agentsam_execution_steps"],
        "routes": ["/api/agentsam/workflows", "/api/agentsam/workflows/:id",
                   "/api/agentsam/workflow-runs/:id", "/api/agentsam/agent-chat-plan-trace"],
        "acceptance": [
            "GET catalog returns templates with node_count, edge_count, handler_count",
            "GET /:id returns nodes with resolved handler executor_kind",
            "all routes are workspace-scoped",
        ],
    },
    {
        "id": "task_wfrt_003_frontend_picker",
        "order_index": 3,
        "title": "Frontend: real workflow picker from catalog API",
        "description": (
            "Replace any static/hardcoded workflow UX with a live picker. "
            "Show nodes, edges, handler types, risk level, approval requirement, and recent run history. "
            "No mock data anywhere."
        ),
        "priority": "P0", "category": "frontend",
        "handler_type": "agent", "handler_key": "workflow_catalog_frontend_picker",
        "risk_level": "low", "requires_approval": 0, "estimated_minutes": 65,
        "files": ["dashboard/features/agent-chat/ChatAssistant.tsx",
                  "dashboard/features/agent-chat/hooks/useAgentChatStream.ts",
                  "dashboard/features/agent-chat/types.ts"],
        "tables": ["agentsam_workflows", "agentsam_workflow_nodes", "agentsam_workflow_handlers"],
        "routes": ["/api/agentsam/workflows"],
        "acceptance": [
            "picker shows active workflows from D1",
            "each workflow card shows node count and top executor_kinds",
            "zero hardcoded workflow catalog in JSX/TSX",
        ],
    },
    {
        "id": "task_wfrt_004_start_run",
        "order_index": 4,
        "title": "Start workflow_run — create execution_steps from nodes",
        "description": (
            "On workflow trigger: INSERT agentsam_workflow_runs linked to workflow_id, "
            "then INSERT one agentsam_execution_steps row per active workflow_node using "
            "node_key and the resolved handler_key. Set steps_total = active node count. "
            "Also INSERT one agentsam_executions row as the universal cross-link record."
        ),
        "priority": "P0", "category": "backend",
        "handler_type": "db_query", "handler_key": "start_selected_workflow_run",
        "risk_level": "medium", "requires_approval": 0, "estimated_minutes": 70,
        "files": ["src/api/agent.js", "src/core/agentsam-planner.js",
                  "src/core/agentsam-task-executor.js", "src/core/workflow-executor.js"],
        "tables": ["agentsam_workflows", "agentsam_workflow_nodes", "agentsam_workflow_handlers",
                   "agentsam_workflow_runs", "agentsam_execution_steps", "agentsam_executions"],
        "routes": ["/api/agentsam/workflows/:id/run", "/api/agent/*"],
        "acceptance": [
            "workflow_run.workflow_id references agentsam_workflows.id",
            "one execution_step per active node with correct handler_key",
            "agentsam_executions row created with workflow_run_id populated",
            "steps_total equals active node count",
        ],
    },
    {
        "id": "task_wfrt_005_graph_executor",
        "order_index": 5,
        "title": "Graph executor — follow edges, resolve handlers, write execution_steps",
        "description": (
            "Make workflow-executor.js traverse agentsam_workflow_edges for each completed node, "
            "resolve the next node's handler via agentsam_workflow_handlers, dispatch by executor_kind "
            "(agent_llm → model call, d1_sql → query, terminal → PTY, approval → queue), "
            "and write edge_taken + status to execution_steps after each hop."
        ),
        "priority": "P0", "category": "backend",
        "handler_type": "agent", "handler_key": "execute_workflow_graph_edges",
        "risk_level": "medium", "requires_approval": 0, "estimated_minutes": 95,
        "files": ["src/core/workflow-executor.js", "src/core/agentsam-task-executor.js",
                  "src/api/agent.js"],
        "tables": ["agentsam_workflow_nodes", "agentsam_workflow_edges",
                   "agentsam_workflow_handlers", "agentsam_workflow_runs",
                   "agentsam_execution_steps", "agentsam_executions"],
        "routes": ["/api/agentsam/workflows/:id/run"],
        "acceptance": [
            "current_node_key updates on workflow_run during traversal",
            "edge_taken written to execution_steps after each node",
            "executor_kind dispatch handles agent_llm, d1_sql, terminal, approval",
            "workflow_step SSE emits node_key, status, handler_key, edge_taken",
        ],
    },
    {
        "id": "task_wfrt_006_plan_bridge",
        "order_index": 6,
        "title": "Bridge workflow nodes to plan_tasks — one coherent board",
        "description": (
            "For agent chat work goals, link agentsam_plan_tasks.execution_step_id to "
            "the corresponding execution_steps row, and plan.workflow_run_id to the run. "
            "agentsam_executions.plan_id must reference the plan. "
            "Frontend shows one board, not separate plan + workflow realities."
        ),
        "priority": "P0", "category": "backend",
        "handler_type": "db_query", "handler_key": "bridge_workflow_nodes_to_plan_tasks",
        "risk_level": "medium", "requires_approval": 0, "estimated_minutes": 70,
        "files": ["src/core/agentsam-planner.js", "src/core/agentsam-task-executor.js"],
        "tables": ["agentsam_plans", "agentsam_plan_tasks",
                   "agentsam_workflow_runs", "agentsam_execution_steps", "agentsam_executions"],
        "routes": ["/api/agent/*"],
        "acceptance": [
            "plan.workflow_run_id populated on every plan-backed workflow run",
            "each plan_task.execution_step_id references a real step",
            "agentsam_executions.plan_id references the plan",
            "task board and workflow trace show the same run",
        ],
    },
    {
        "id": "task_wfrt_007_approval_nodes",
        "order_index": 7,
        "title": "Approval-gate nodes — pause, queue, resume",
        "description": (
            "Nodes with executor_kind=approval must: create agentsam_approval_queue row "
            "(approval_type based on tool_name), set execution_step.status=approval_pending, "
            "emit approval_required SSE, and pause. Resume only via "
            "/api/agent/proposals/:id/approve → resume exact node. "
            "agentsam_executions row must carry approval_id linkage."
        ),
        "priority": "P0", "category": "infra",
        "handler_type": "approval_gate", "handler_key": "workflow_approval_gate_nodes",
        "risk_level": "high", "requires_approval": 1, "estimated_minutes": 80,
        "files": ["src/core/agentsam-task-executor.js", "src/api/agent.js",
                  "dashboard/features/agent-chat/ChatAssistant.tsx"],
        "tables": ["agentsam_approval_queue", "agentsam_execution_steps",
                   "agentsam_workflow_runs", "agentsam_executions"],
        "routes": ["/api/agent/proposals/:id/approve",
                   "/api/agent/proposals/:id/deny",
                   "/api/agent/plan-task/resume"],
        "acceptance": [
            "approval_queue.workflow_run_id + execution_step_id both set",
            "execution_step.status=approval_pending before any risky action",
            "resume only advances the exact node that was paused",
            "deny sets execution_step.status=failed and workflow_run.status=failed",
        ],
    },
    {
        "id": "task_wfrt_008_sse_trace",
        "order_index": 8,
        "title": "Frontend SSE: render workflow events as execution board",
        "description": (
            "streamParsing.ts must handle workflow_start / workflow_step / workflow_complete / "
            "approval_required. Render as a live execution board: node cards with handler type, "
            "status badge, edge taken, latency, cost, and approval inline action. "
            "workflow_complete stops spinner and shows rollup."
        ),
        "priority": "P0", "category": "frontend",
        "handler_type": "agent", "handler_key": "render_workflow_sse_trace",
        "risk_level": "low", "requires_approval": 0, "estimated_minutes": 65,
        "files": ["dashboard/features/agent-chat/streamParsing.ts",
                  "dashboard/features/agent-chat/hooks/useAgentChatStream.ts",
                  "dashboard/features/agent-chat/ChatAssistant.tsx",
                  "dashboard/features/agent-chat/types.ts"],
        "tables": ["agentsam_workflow_runs", "agentsam_execution_steps"],
        "routes": ["/api/agent/*"],
        "acceptance": [
            "workflow_start renders run card with workflow name and node count",
            "workflow_step updates node status, shows handler type + edge_taken",
            "approval_required renders inline approve/deny without leaving chat",
            "workflow_complete shows cost_usd, total_tokens, duration_ms rollup",
        ],
    },
    {
        "id": "task_wfrt_009_supabase_mirror",
        "order_index": 9,
        "title": "Mirror workflow runs + executions to Supabase best-effort",
        "description": (
            "Mirror agentsam_workflow_runs and agentsam_executions to Supabase after completion. "
            "D1 is source of truth. Supabase failure must NOT fail the D1 run. "
            "Set supabase_sync_status on workflow_runs after each attempt."
        ),
        "priority": "P1", "category": "infra",
        "handler_type": "script", "handler_key": "workflow_supabase_cloudflare_mirror",
        "risk_level": "medium", "requires_approval": 0, "estimated_minutes": 55,
        "files": ["src/core/agentsam-plan-supabase-public-sync.js"],
        "tables": ["agentsam_workflow_runs", "agentsam_execution_steps", "agentsam_executions"],
        "routes": ["/api/agentsam/agent-chat-plan-trace"],
        "acceptance": [
            "workflow_run.supabase_sync_status updates after mirror attempt",
            "Supabase failure logged but does not throw in D1 run path",
            "agentsam_executions rows synced with execution_type + workflow_run_id",
        ],
    },
    {
        "id": "task_wfrt_010_dashboard_panel",
        "order_index": 10,
        "title": "Dashboard panel — workflow graph, run history, executions health",
        "description": (
            "Show active workflow templates (node/edge/handler counts), recent runs "
            "(status, steps_completed/total, cost, supabase_sync_status), "
            "execution type breakdown from agentsam_executions, "
            "and approval_pending queue count. No mock data."
        ),
        "priority": "P1", "category": "ux",
        "handler_type": "agent", "handler_key": "workflow_dashboard_panel",
        "risk_level": "low", "requires_approval": 0, "estimated_minutes": 75,
        "files": ["dashboard/components/analytics/panels/AgentChatPlanTracePanel.tsx",
                  "dashboard/features/agent-chat/ChatAssistant.tsx"],
        "tables": ["agentsam_workflows", "agentsam_workflow_runs",
                   "agentsam_execution_steps", "agentsam_executions", "agentsam_approval_queue"],
        "routes": ["/api/agentsam/workflows", "/api/agentsam/workflow-runs/:id"],
        "acceptance": [
            "shows real workflow graph with handler executor_kind labels on nodes",
            "recent runs list with live status, cost, sync status",
            "executions breakdown by type (agent_llm, terminal, d1_sql...)",
            "no hardcoded/mock data",
        ],
    },
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def q(v: Any) -> str:
    if v is None:          return "NULL"
    if isinstance(v, bool): return "1" if v else "0"
    if isinstance(v, (int, float)): return str(v)
    return "'" + str(v).replace("'", "''") + "'"

def j(v: Any) -> str:
    return json.dumps(v, separators=(",", ":"), ensure_ascii=False)

def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

def run_cmd(cmd: list[str], timeout: int = 120) -> dict[str, Any]:
    try:
        p = subprocess.run(cmd, cwd=str(ROOT), text=True,
                           capture_output=True, timeout=timeout, check=False)
        return {"ok": p.returncode == 0, "returncode": p.returncode,
                "stdout": p.stdout, "stderr": p.stderr, "cmd": cmd}
    except Exception as e:
        return {"ok": False, "returncode": None, "stdout": "", "stderr": str(e), "cmd": cmd}

def parse_rows(stdout: str) -> list[dict[str, Any]]:
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
    cmd.extend(["-c", WRANGLER_CFG, "--json", "--command", sql])
    res = run_cmd(cmd, timeout=180)
    return parse_rows(res.get("stdout", "")) if res["ok"] else []

def read_file(path: str) -> str:
    try:
        return (ROOT / path).read_text(errors="replace")
    except Exception:
        return ""


# ---------------------------------------------------------------------------
# CF REST API for trace writes
# (per primetech_primeaux_paste_protocol — no wrangler assumption for inserts)
# ---------------------------------------------------------------------------

def cf_rest_query(sql: str, params: list | None = None) -> dict[str, Any]:
    account_id = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
    api_token  = os.environ.get("CLOUDFLARE_API_TOKEN", "")
    if not account_id or not api_token:
        return {"success": False, "error": "CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN not set"}
    url     = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/d1/database/{D1_DB_ID}/query"
    payload = {"sql": sql}
    if params:
        payload["params"] = params
    data    = json.dumps(payload).encode()
    req     = urllib.request.Request(
        url, data=data,
        headers={"Authorization": f"Bearer {api_token}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        return {"success": False, "error": f"HTTP {e.code}", "body": body}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ---------------------------------------------------------------------------
# Repo scan
# ---------------------------------------------------------------------------

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
                    examples.append({"line": i, "text": line.strip()[:200]})
                    if len(examples) >= 6:
                        break
            hits[key] = {"count": len(rx.findall(text)), "examples": examples}
        out[path] = {"exists": (ROOT / path).exists(), "size": len(text.encode()), "hits": hits}
    return out


# ---------------------------------------------------------------------------
# D1 inspection
# ---------------------------------------------------------------------------

def inspect_d1() -> dict[str, Any]:
    # ── table meta ───────────────────────────────────────────────────────────
    tables: dict[str, Any] = {}
    for table in D1_TABLES:
        cols = d1(f"PRAGMA table_info({table});")
        count_rows = d1(f"SELECT COUNT(*) AS n FROM {table};") if cols else []
        tables[table] = {
            "exists":  bool(cols),
            "count":   count_rows[0].get("n") if count_rows else None,
            "columns": [c.get("name") for c in cols],
        }

    # ── workflow catalog ──────────────────────────────────────────────────────
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
  COUNT(DISTINCT n.id)    AS nodes,
  COUNT(DISTINCT e.id)    AS edges,
  COUNT(DISTINCT h.handler_key) AS resolved_handlers
FROM agentsam_workflows w
LEFT JOIN agentsam_workflow_nodes n  ON n.workflow_id = w.id
LEFT JOIN agentsam_workflow_edges e  ON e.workflow_id = w.id
LEFT JOIN agentsam_workflow_handlers h
       ON h.handler_key = n.handler_key
GROUP BY w.id
ORDER BY w.updated_at DESC
LIMIT 30;
""")

    # ── handler catalog ───────────────────────────────────────────────────────
    handler_catalog = d1("""
SELECT
  executor_kind,
  COUNT(*)       AS total,
  SUM(is_active) AS active,
  SUM(requires_approval) AS needs_approval,
  SUM(CASE WHEN risk_level IN ('high','critical') THEN 1 ELSE 0 END) AS high_risk_count
FROM agentsam_workflow_handlers
GROUP BY executor_kind
ORDER BY total DESC;
""")

    # nodes whose handler_key doesn't resolve
    unresolved_handlers = d1("""
SELECT DISTINCT
  n.handler_key,
  n.node_type,
  n.title,
  w.workflow_key
FROM agentsam_workflow_nodes n
JOIN agentsam_workflows w ON w.id = n.workflow_id
LEFT JOIN agentsam_workflow_handlers h ON h.handler_key = n.handler_key
WHERE n.handler_key IS NOT NULL
  AND n.handler_key != ''
  AND (n.handler_config_json IS NULL OR n.handler_config_json = '{}')
  AND h.handler_key IS NULL
LIMIT 25;
""")

    # ── executions health ─────────────────────────────────────────────────────
    executions_by_type = d1("""
SELECT
  execution_type,
  status,
  COUNT(*)         AS count,
  ROUND(SUM(cost_usd),4)    AS total_cost_usd,
  ROUND(AVG(duration_ms),0) AS avg_duration_ms
FROM agentsam_executions
GROUP BY execution_type, status
ORDER BY count DESC
LIMIT 30;
""")

    executions_linkage = d1("""
SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN workflow_run_id  IS NOT NULL THEN 1 ELSE 0 END) AS with_workflow_run,
  SUM(CASE WHEN execution_step_id IS NOT NULL THEN 1 ELSE 0 END) AS with_exec_step,
  SUM(CASE WHEN plan_id           IS NOT NULL THEN 1 ELSE 0 END) AS with_plan,
  SUM(CASE WHEN subagent_id       IS NOT NULL THEN 1 ELSE 0 END) AS with_subagent
FROM agentsam_executions;
""")

    # ── spine check ───────────────────────────────────────────────────────────
    spine = d1("""
SELECT
  COUNT(s.id)  AS step_count,
  SUM(CASE WHEN wr.id IS NULL THEN 1 ELSE 0 END) AS orphan_steps,
  SUM(CASE WHEN s.approval_id IS NOT NULL THEN 1 ELSE 0 END) AS approval_linked_steps
FROM agentsam_execution_steps s
LEFT JOIN agentsam_workflow_runs wr ON wr.id = s.execution_id;
""")

    # ── recent runs ───────────────────────────────────────────────────────────
    recent_runs = d1("""
SELECT
  wr.id,
  wr.workflow_key,
  wr.status,
  wr.steps_completed,
  wr.steps_total,
  wr.current_node_key,
  wr.cost_usd,
  wr.supabase_sync_status,
  wr.created_at,
  COUNT(s.id) AS step_count
FROM agentsam_workflow_runs wr
LEFT JOIN agentsam_execution_steps s ON s.execution_id = wr.id
GROUP BY wr.id
ORDER BY wr.created_at DESC
LIMIT 15;
""")

    # ── recent plans ─────────────────────────────────────────────────────────
    recent_plans = d1("""
SELECT
  p.id,
  p.title,
  p.status,
  p.workflow_run_id,
  COUNT(t.id) AS tasks,
  SUM(CASE WHEN t.execution_step_id IS NOT NULL THEN 1 ELSE 0 END) AS tasks_with_steps
FROM agentsam_plans p
LEFT JOIN agentsam_plan_tasks t ON t.plan_id = p.id
GROUP BY p.id
ORDER BY p.created_at DESC
LIMIT 10;
""")

    # ── pending approvals ─────────────────────────────────────────────────────
    pending_approvals = d1("""
SELECT id, approval_type, tool_name, risk_level, status, workflow_run_id,
       execution_step_id, created_at
FROM agentsam_approval_queue
WHERE status = 'pending'
ORDER BY created_at DESC
LIMIT 10;
""")

    return {
        "tables":               tables,
        "workflow_catalog":     workflow_catalog,
        "handler_catalog":      handler_catalog,
        "unresolved_handlers":  unresolved_handlers,
        "executions_by_type":   executions_by_type,
        "executions_linkage":   executions_linkage[0] if executions_linkage else {},
        "spine_check":          spine[0] if spine else {},
        "recent_runs":          recent_runs,
        "recent_plans":         recent_plans,
        "pending_approvals":    pending_approvals,
    }


# ---------------------------------------------------------------------------
# Artifact writers
# ---------------------------------------------------------------------------

def write_report(report: dict[str, Any]) -> None:
    OUT_REPORT.write_text(json.dumps(report, indent=2, sort_keys=True))


def write_plan(report: dict[str, Any]) -> None:
    d1_info  = report.get("d1", {})
    lines    = []
    lines   += [
        "# Agent Sam Workflows Frontend Runtime — Implementation Plan v2",
        "",
        f"Generated : `{report['generated_at']}`",
        f"Plan ID   : `{PLAN_ID}`",
        f"Rule      : `{RULE_ID}`",
        "",
        "## Goal",
        "",
        "Make `agentsam_workflows` the real, executable, observable frontend/runtime system.",
        "",
        "## Canonical runtime spine",
        "",
        f"`{CANONICAL_SPINE}`",
        "",
        "## D1 proof — table counts",
        "",
        "| Table | Exists | Rows |",
        "|---|---:|---:|",
    ]
    for t in D1_TABLES:
        info = d1_info.get("tables", {}).get(t, {})
        lines.append(f"| `{t}` | {info.get('exists')} | {info.get('count')} |")

    lines += [
        "",
        "## Handler catalog",
        "",
        "| executor_kind | total | active | needs_approval | high_risk |",
        "|---|---:|---:|---:|---:|",
    ]
    for h in d1_info.get("handler_catalog", []):
        lines.append(
            f"| `{h.get('executor_kind')}` | {h.get('total')} | {h.get('active')} "
            f"| {h.get('needs_approval')} | {h.get('high_risk_count')} |"
        )

    unresolved = d1_info.get("unresolved_handlers", [])
    if unresolved:
        lines += ["", f"**{len(unresolved)} unresolved handler_key(s) — nodes with no matching handler row:**", ""]
        for u in unresolved[:10]:
            lines.append(f"- `{u.get('handler_key')}` ({u.get('node_type')}) — workflow `{u.get('workflow_key')}`")

    lines += [
        "",
        "## Executions linkage",
        "",
    ]
    lk = d1_info.get("executions_linkage", {})
    lines.append(
        f"total={lk.get('total')}  with_workflow_run={lk.get('with_workflow_run')}  "
        f"with_exec_step={lk.get('with_exec_step')}  with_plan={lk.get('with_plan')}  "
        f"with_subagent={lk.get('with_subagent')}"
    )

    lines += [
        "",
        "## Spine check",
        "",
        f"`{d1_info.get('spine_check')}`",
        "",
        "## Workflow catalog sample",
        "",
        "| workflow_key | active | global | nodes | edges | resolved_handlers | risk | approval |",
        "|---|---:|---:|---:|---:|---:|---|---:|",
    ]
    for row in d1_info.get("workflow_catalog", [])[:20]:
        lines.append(
            f"| {row.get('workflow_key')} | {row.get('is_active')} | {row.get('is_platform_global')} "
            f"| {row.get('nodes')} | {row.get('edges')} | {row.get('resolved_handlers')} "
            f"| {row.get('risk_level')} | {row.get('requires_approval')} |"
        )

    lines += ["", "## Implementation tasks", ""]
    for task in IMPLEMENTATION_TASKS:
        lines += [
            f"### {task['order_index']}. {task['title']}",
            "",
            f"- ID       : `{task['id']}`",
            f"- Priority : `{task['priority']}`",
            f"- Category : `{task['category']}`",
            f"- Handler  : `{task['handler_type']}:{task['handler_key']}`",
            f"- Risk     : `{task['risk_level']}`",
            f"- Approval : `{task['requires_approval']}`",
            f"- Estimate : `{task['estimated_minutes']} min`",
            "",
            task["description"],
            "",
        ]
        if task["files"]:
            lines += ["Files:"] + [f"- `{f}`" for f in task["files"]] + [""]
        if task["tables"]:
            lines += ["Tables:"] + [f"- `{t}`" for t in task["tables"]] + [""]
        if task["routes"]:
            lines += ["Routes:"] + [f"- `{r}`" for r in task["routes"]] + [""]
        lines += ["Acceptance:"] + [f"- {a}" for a in task["acceptance"]] + [""]

    OUT_PLAN.write_text("\n".join(lines))


def write_sql() -> None:
    now     = int(time.time())
    title   = "Agent Sam Workflows Frontend Runtime v2 — handlers + executions"
    brief   = (
        "Implement agentsam_workflows as the real frontend/runtime graph system. "
        "Audit handler catalog, wire executions cross-link, stream workflow events, "
        "handle approvals, mirror to Supabase. Governed by primetech_agentic_flow_protocol."
    )
    stmts   = []

    # plan
    stmts.append(f"""
INSERT INTO agentsam_plans (
  id, tenant_id, workspace_id, plan_date, plan_type, title, status,
  morning_brief, session_notes, tasks_total, tasks_done, tasks_blocked,
  linked_project_keys, linked_todo_ids, linked_context_ids,
  created_at, updated_at, graph_mode, risk_level, requires_approval
) VALUES (
  {q(PLAN_ID)}, {q(TENANT_ID)}, {q(WORKSPACE_ID)}, {q(time.strftime('%Y-%m-%d'))}, 'feature',
  {q(title)}, 'active',
  {q(brief)},
  {q('Rule: primetech_agentic_flow_protocol. Do not add schema. Use existing tables.')},
  {len(IMPLEMENTATION_TASKS)}, 0, 0,
  {q(j(['agentsam_workflows','frontend_runtime','workflow_graph','handler_catalog']))},
  '[]',
  {q(j([RULE_ID]))},
  {now}, {now}, 1, 'high', 1
)
ON CONFLICT(id) DO UPDATE SET
  title=excluded.title, status='active', morning_brief=excluded.morning_brief,
  tasks_total=excluded.tasks_total, linked_context_ids=excluded.linked_context_ids,
  updated_at={now}, graph_mode=1, risk_level='high', requires_approval=1;
""".strip())

    # tasks
    for task in IMPLEMENTATION_TASKS:
        stmts.append(f"""
INSERT INTO agentsam_plan_tasks (
  id, tenant_id, workspace_id, plan_id, order_index, title, description,
  priority, category, status, files_involved, tables_involved, routes_involved,
  depends_on, estimated_minutes, notes, created_at,
  node_key, handler_key, handler_type, risk_level, requires_approval, quality_gate_json
) VALUES (
  {q(task['id'])}, {q(TENANT_ID)}, {q(WORKSPACE_ID)}, {q(PLAN_ID)},
  {task['order_index']}, {q(task['title'])}, {q(task['description'])},
  {q(task['priority'])}, {q(task['category'])}, 'todo',
  {q(j(task['files']))}, {q(j(task['tables']))}, {q(j(task['routes']))},
  '[]', {task['estimated_minutes']},
  {q('Acceptance: ' + ' | '.join(task['acceptance']))},
  {now},
  {q(task['handler_key'])}, {q(task['handler_key'])}, {q(task['handler_type'])},
  {q(task['risk_level'])}, {task['requires_approval']},
  {q(j({'acceptance': task['acceptance'], 'proof_required': True,
        'canonical_spine': CANONICAL_SPINE, 'rule_id': RULE_ID}))}
)
ON CONFLICT(id) DO UPDATE SET
  title=excluded.title, description=excluded.description, priority=excluded.priority,
  files_involved=excluded.files_involved, tables_involved=excluded.tables_involved,
  routes_involved=excluded.routes_involved, handler_key=excluded.handler_key,
  handler_type=excluded.handler_type, risk_level=excluded.risk_level,
  requires_approval=excluded.requires_approval, quality_gate_json=excluded.quality_gate_json;
""".strip())

    OUT_SQL.write_text("\n\n".join(stmts) + "\n")


def write_validate() -> None:
    sql = (
        f"SELECT p.id, p.title, p.status, p.tasks_total, COUNT(t.id) AS tasks "
        f"FROM agentsam_plans p LEFT JOIN agentsam_plan_tasks t ON t.plan_id=p.id "
        f"WHERE p.id='{PLAN_ID}' GROUP BY p.id;"
        f"\\n\\n"
        f"SELECT order_index, id, title, priority, status, handler_type, risk_level "
        f"FROM agentsam_plan_tasks WHERE plan_id='{PLAN_ID}' ORDER BY order_index;"
        f"\\n\\n"
        f"SELECT executor_kind, COUNT(*) AS total, SUM(is_active) AS active "
        f"FROM agentsam_workflow_handlers GROUP BY executor_kind ORDER BY total DESC;"
        f"\\n\\n"
        f"SELECT COUNT(*) AS executions_total, "
        f"SUM(CASE WHEN workflow_run_id IS NOT NULL THEN 1 ELSE 0 END) AS linked_runs "
        f"FROM agentsam_executions;"
    )
    OUT_VALIDATE.write_text(
        f"#!/usr/bin/env bash\nset -euo pipefail\ncd {ROOT}\n"
        f'npx wrangler d1 execute {D1_DB} --remote -c {WRANGLER_CFG} --command "{sql}"\n'
    )
    OUT_VALIDATE.chmod(0o755)


def write_prompt() -> None:
    lines = [
        "AGENT SAM WORKFLOWS — FRONTEND RUNTIME IMPLEMENTATION v2",
        "",
        "Governing rule: primetech_agentic_flow_protocol",
        "Python output : primetech_primeaux_paste_protocol",
        "",
        "Goal: make agentsam_workflows the real executable workflow graph in frontend/runtime.",
        "Do not add schema. Use existing D1 tables.",
        "",
        "Canonical spine:",
        CANONICAL_SPINE,
        "",
        "New in v2 — must implement:",
        "- agentsam_workflow_handlers.executor_kind drives dispatch (agent_llm/d1_sql/terminal/approval/...)",
        "- agentsam_executions is the universal cross-link (plan+workflow_run+execution_step+subagent)",
        "- Every write-capable run creates agentsam_patch_sessions + agentsam_script_runs for traceability",
        "",
        "Build order:",
        "1.  Audit + resolve all workflow_node handler_keys against agentsam_workflow_handlers",
        "2.  Expose catalog + handler registry APIs",
        "3.  Frontend workflow picker from real catalog",
        "4.  Start workflow_run → create execution_steps from nodes + agentsam_executions cross-link row",
        "5.  Graph executor: traverse edges → resolve handler → dispatch by executor_kind",
        "6.  Bridge plan_tasks ↔ execution_steps ↔ agentsam_executions.plan_id",
        "7.  Approval-gate nodes (executor_kind=approval) → pause → queue → resume",
        "8.  Frontend SSE: render workflow events as live execution board",
        "9.  Mirror workflow_runs + executions to Supabase best-effort",
        "10. Dashboard panel: graph, runs, executions breakdown, approvals queue",
        "",
        "Proof required for each task: D1 row evidence + UI trace or SSE log.",
        "",
        "Generated artifacts:",
        f"  {OUT_REPORT}",
        f"  {OUT_PLAN}",
        f"  {OUT_SQL}",
    ]
    OUT_PROMPT.write_text("\n".join(lines))


# ---------------------------------------------------------------------------
# Trace writes (CF REST API — no wrangler assumption)
# ---------------------------------------------------------------------------

def register_script() -> dict[str, Any]:
    """INSERT OR REPLACE agentsam_scripts row for this planner script."""
    body_path = ROOT / "scripts" / "agentsam-workflows-frontend-runtime-planner.py"
    body_text = ""
    try:
        body_text = body_path.read_text(errors="replace")
    except Exception:
        pass
    body_hash = hashlib.sha256(body_text.encode()).hexdigest()[:16] if body_text else ""
    now       = int(time.time())

    sql = (
        f"INSERT INTO agentsam_scripts "
        f"(id, tenant_id, workspace_id, slug, name, path, body, description, purpose, "
        f"runner, language, version, script_hash, is_global, is_active, "
        f"requires_env, owner_only, safe_to_run, approval_required, risk_level, "
        f"created_by_user_id, created_at_epoch, updated_at_epoch) "
        f"VALUES ("
        f"{q(SCRIPT_ID)}, {q(TENANT_ID)}, {q(WORKSPACE_ID)}, {q(SCRIPT_SLUG)}, "
        f"{q('Agentsam Workflows Frontend Runtime Planner v2')}, "
        f"{q('scripts/agentsam-workflows-frontend-runtime-planner.py')}, "
        f"{q(body_text[:4000] if body_text else '')}, "
        f"{q('Scans repo + inspects D1 workflow/handler/execution tables. Writes plan+tasks. Sends email report.')}, "
        f"{q('maintenance')}, 'python', 'python', 2, {q(body_hash)}, "
        f"0, 1, 1, 1, 1, 0, 'medium', {q(USER_ID)}, {now}, {now}"
        f") ON CONFLICT(id) DO UPDATE SET "
        f"version=version+1, script_hash={q(body_hash)}, updated_at_epoch={now};"
    )
    return cf_rest_query(sql)


def create_patch_session(plan_id: str) -> str:
    """Create agentsam_patch_sessions row. Returns session id."""
    ps_id = "ps_wfrt_v2_" + hex(int(time.time()))[2:]
    now   = int(time.time())
    sql   = (
        f"INSERT INTO agentsam_patch_sessions "
        f"(id, session_ts, plan_id, task_file, model_used, provider, "
        f"passed, applied, cost_usd, latency_ms) "
        f"VALUES ("
        f"{q(ps_id)}, {now}, {q(plan_id)}, "
        f"{q('scripts/agentsam-workflows-frontend-runtime-planner.py')}, "
        f"'script', 'local', 0, 1, 0.0, 0"
        f") ON CONFLICT(id) DO NOTHING;"
    )
    result = cf_rest_query(sql)
    if result.get("success") is False:
        print(f"  [WARN] patch_session insert: {result.get('error','unknown')}")
    return ps_id


def log_script_run(
    patch_session_id: str,
    status: str,
    duration_ms: int,
    output_summary: str,
    error_message: str = "",
) -> str:
    """Create agentsam_script_runs row. Returns run id."""
    sr_id     = "sr_wfrt_" + hex(int(time.time()))[2:]
    now       = int(time.time())
    body_path = ROOT / "scripts" / "agentsam-workflows-frontend-runtime-planner.py"
    body_snap = ""
    try:
        body_snap = body_path.read_text(errors="replace")[:1000]
    except Exception:
        pass

    sql = (
        f"INSERT INTO agentsam_script_runs "
        f"(id, tenant_id, workspace_id, user_id, script_id, patch_session_id, rule_id, "
        f"triggered_by, trigger_source, status, exit_code, duration_ms, "
        f"cost_usd, input_json, output_summary, script_body_snapshot, error_message, "
        f"script_version, started_at_epoch, completed_at_epoch, created_at_epoch) "
        f"VALUES ("
        f"{q(sr_id)}, {q(TENANT_ID)}, {q(WORKSPACE_ID)}, {q(USER_ID)}, "
        f"{q(SCRIPT_ID)}, {q(patch_session_id)}, {q(RULE_ID)}, "
        f"'agent', 'agentsam_planner_v2', {q(status)}, "
        f"{'0' if status == 'completed' else '1'}, {duration_ms}, "
        f"0.0, {q(j({'plan_id': PLAN_ID}))}, {q(output_summary[:500])}, "
        f"{q(body_snap)}, {q(error_message[:300])}, "
        f"2, {now}, {now}, {now}"
        f") ON CONFLICT(id) DO NOTHING;"
    )
    result = cf_rest_query(sql)
    if result.get("success") is False:
        print(f"  [WARN] script_run insert: {result.get('error','unknown')}")
    return sr_id


# ---------------------------------------------------------------------------
# Email report (Resend)
# ---------------------------------------------------------------------------

def build_email_html(report: dict[str, Any]) -> str:
    d1_info   = report.get("d1", {})
    tasks_p0  = [t for t in IMPLEMENTATION_TASKS if t["priority"] == "P0"]
    tasks_p1  = [t for t in IMPLEMENTATION_TASKS if t["priority"] == "P1"]
    lk        = d1_info.get("executions_linkage", {})
    spine     = d1_info.get("spine_check", {})
    unres     = d1_info.get("unresolved_handlers", [])

    def badge(text: str, color: str) -> str:
        return (
            f'<span style="background:{color};color:#fff;padding:2px 8px;'
            f'border-radius:4px;font-size:11px;font-weight:700">{text}</span>'
        )

    rows_table = "".join(
        f"<tr><td style='font-family:monospace;font-size:12px'>{t}</td>"
        f"<td style='text-align:center'>"
        + ("✅" if d1_info.get("tables", {}).get(t, {}).get("exists") else "❌")
        + f"</td><td style='text-align:right'>"
        + str(d1_info.get("tables", {}).get(t, {}).get("count", "—"))
        + "</td></tr>"
        for t in D1_TABLES
    )

    handler_rows = "".join(
        f"<tr><td style='font-family:monospace;font-size:12px'>{h.get('executor_kind')}</td>"
        f"<td style='text-align:right'>{h.get('total')}</td>"
        f"<td style='text-align:right'>{h.get('active')}</td>"
        f"<td style='text-align:right'>{h.get('high_risk_count')}</td></tr>"
        for h in d1_info.get("handler_catalog", [])
    )

    task_rows = "".join(
        f"<tr>"
        f"<td>{badge(t['priority'], '#dc2626' if t['priority']=='P0' else '#d97706')}</td>"
        f"<td style='font-size:13px'>{t['title']}</td>"
        f"<td style='font-family:monospace;font-size:11px'>{t['handler_type']}</td>"
        f"<td style='text-align:center'>"
        + ("⚠️" if t["requires_approval"] else "—")
        + f"</td>"
        f"<td style='text-align:right'>{t['estimated_minutes']}m</td>"
        f"</tr>"
        for t in IMPLEMENTATION_TASKS
    )

    unres_block = ""
    if unres:
        unres_rows = "".join(
            f"<tr><td style='font-family:monospace;color:#dc2626;font-size:11px'>{u.get('handler_key')}</td>"
            f"<td style='font-size:11px'>{u.get('node_type')}</td>"
            f"<td style='font-size:11px'>{u.get('workflow_key')}</td></tr>"
            for u in unres
        )
        unres_block = f"""
<h3 style="color:#dc2626;margin:24px 0 8px">⚠️ {len(unres)} Unresolved Handler Keys</h3>
<table width="100%" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:12px">
  <thead><tr style="background:#fef2f2">
    <th align="left">handler_key</th><th align="left">node_type</th><th align="left">workflow_key</th>
  </tr></thead>
  <tbody>{unres_rows}</tbody>
</table>"""

    return f"""
<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;margin:0;padding:24px">
<div style="max-width:720px;margin:0 auto">

<div style="background:linear-gradient(135deg,#1e3a5f,#0f2d4a);border-radius:12px;padding:24px;margin-bottom:24px">
  <h1 style="margin:0 0 4px;font-size:20px">🤖 Agent Sam Workflows Runtime Planner</h1>
  <p style="margin:0;color:#94a3b8;font-size:13px">
    {report['generated_at']} &nbsp;·&nbsp; Plan: <code style="background:#0f172a;padding:2px 6px;border-radius:4px">{PLAN_ID}</code>
  </p>
</div>

<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px">
  {_stat_card("Tasks", str(len(IMPLEMENTATION_TASKS)), "#3b82f6")}
  {_stat_card("P0 Tasks", str(len(tasks_p0)), "#dc2626")}
  {_stat_card("Executions", str(lk.get('total','—')), "#8b5cf6")}
  {_stat_card("Orphan Steps", str(spine.get('orphan_steps','—')),
              "#dc2626" if spine.get('orphan_steps',0) else "#22c55e")}
</div>

<h2 style="margin:24px 0 8px;font-size:15px;color:#94a3b8">D1 TABLE COUNTS</h2>
<table width="100%" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:12px">
  <thead><tr style="background:#1e293b"><th align="left">Table</th><th>Exists</th><th align="right">Rows</th></tr></thead>
  <tbody>{rows_table}</tbody>
</table>

<h2 style="margin:24px 0 8px;font-size:15px;color:#94a3b8">HANDLER CATALOG</h2>
<table width="100%" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:12px">
  <thead><tr style="background:#1e293b">
    <th align="left">executor_kind</th><th align="right">total</th>
    <th align="right">active</th><th align="right">high_risk</th>
  </tr></thead>
  <tbody>{handler_rows}</tbody>
</table>

{unres_block}

<h2 style="margin:24px 0 8px;font-size:15px;color:#94a3b8">EXECUTIONS LINKAGE</h2>
<p style="background:#1e293b;padding:12px;border-radius:8px;font-family:monospace;font-size:12px">
  total={lk.get('total','—')} &nbsp;·&nbsp;
  with_workflow_run={lk.get('with_workflow_run','—')} &nbsp;·&nbsp;
  with_exec_step={lk.get('with_exec_step','—')} &nbsp;·&nbsp;
  with_plan={lk.get('with_plan','—')} &nbsp;·&nbsp;
  with_subagent={lk.get('with_subagent','—')}
</p>

<h2 style="margin:24px 0 8px;font-size:15px;color:#94a3b8">IMPLEMENTATION PLAN</h2>
<table width="100%" cellpadding="8" cellspacing="0" style="border-collapse:collapse;font-size:12px">
  <thead><tr style="background:#1e293b">
    <th align="left">Priority</th><th align="left">Task</th>
    <th align="left">Handler</th><th>Gate</th><th align="right">Est.</th>
  </tr></thead>
  <tbody>{task_rows}</tbody>
</table>

<div style="margin-top:24px;padding:16px;background:#1e293b;border-radius:8px;font-size:11px;color:#64748b">
  Governed by <code>primetech_agentic_flow_protocol</code> ·
  Script <code>{SCRIPT_ID}</code> ·
  Plan written to <code>agentsam_plans</code> + <code>agentsam_plan_tasks</code>
</div>

</div></body></html>
"""

def _stat_card(label: str, value: str, color: str) -> str:
    return (
        f'<div style="background:#1e293b;border-radius:8px;padding:12px;text-align:center">'
        f'<div style="font-size:22px;font-weight:700;color:{color}">{value}</div>'
        f'<div style="font-size:11px;color:#64748b;margin-top:2px">{label}</div>'
        f'</div>'
    )

def send_email(report: dict[str, Any]) -> dict[str, Any]:
    if not RESEND_KEY:
        return {"skipped": True, "reason": "RESEND_API_KEY not set"}

    html    = build_email_html(report)
    payload = json.dumps({
        "from":    RESEND_FROM,
        "to":      [RESEND_TO],
        "subject": f"[Agent Sam] Workflows Runtime Plan — {report['generated_at']}",
        "html":    html,
    }).encode()

    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=payload,
        headers={"Authorization": f"Bearer {RESEND_KEY}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = json.loads(resp.read())
            return {"ok": True, "id": body.get("id"), "to": RESEND_TO}
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        return {"ok": False, "status": e.code, "body": body}
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(
        description="Agent Sam Workflows Frontend Runtime Planner v2"
    )
    parser.add_argument("--apply-plan", action="store_true",
                        help="Write plan+tasks SQL to D1, create patch_session and script_run")
    parser.add_argument("--no-d1",     action="store_true",
                        help="Skip D1 inspection (faster local dev run)")
    parser.add_argument("--no-email",  action="store_true",
                        help="Skip email even if RESEND_API_KEY is set")
    args = parser.parse_args()

    # ── env checks ────────────────────────────────────────────────────────────
    if not os.environ.get("CLOUDFLARE_API_TOKEN"):
        print("[FAIL] CLOUDFLARE_API_TOKEN not set", file=sys.stderr)
        return 2
    if not os.environ.get("CLOUDFLARE_ACCOUNT_ID"):
        print("[FAIL] CLOUDFLARE_ACCOUNT_ID not set", file=sys.stderr)
        return 2

    print("Agent Sam Workflows Frontend Runtime Planner v2")
    print(f"  repo      : {ROOT}")
    print(f"  d1        : {D1_DB}  remote={D1_REMOTE}  config={WRANGLER_CFG}")
    print(f"  plan_id   : {PLAN_ID}")
    print(f"  apply     : {args.apply_plan}")
    print(f"  email     : {bool(RESEND_KEY) and not args.no_email}")
    print()

    t_start = time.time()

    # [1] Repo scan
    print("[1/6] Scanning repo references...")
    repo_scan = scan_repo()
    for path, info in repo_scan.items():
        flag = "OK  " if info["exists"] else "MISS"
        total_hits = sum(h["count"] for h in info["hits"].values())
        print(f"  {flag} {path}  ({total_hits} pattern hits)")

    # [2] D1 inspection
    print("[2/6] Inspecting D1 tables...")
    d1_info: dict[str, Any] = {"skipped": True}
    if not args.no_d1:
        d1_info = inspect_d1()
        for t in D1_TABLES:
            info = d1_info["tables"].get(t, {})
            flag = "OK  " if info.get("exists") else "MISS"
            print(f"  {flag} {t}  rows={info.get('count')}")
        print(f"  handlers     : {len(d1_info.get('handler_catalog', []))} executor_kind groups")
        print(f"  unresolved   : {len(d1_info.get('unresolved_handlers', []))} node handler_keys")
        print(f"  executions   : {d1_info.get('executions_linkage', {}).get('total', '?')} rows")
        print(f"  spine_check  : {d1_info.get('spine_check')}")
    else:
        print("  skipped (--no-d1)")

    # [3] Write artifacts
    print("[3/6] Writing artifacts...")
    report = {
        "generated_at":        now_iso(),
        "plan_id":             PLAN_ID,
        "script_id":           SCRIPT_ID,
        "rule_id":             RULE_ID,
        "tenant_id":           TENANT_ID,
        "workspace_id":        WORKSPACE_ID,
        "canonical_spine":     CANONICAL_SPINE,
        "repo_scan":           repo_scan,
        "d1":                  d1_info,
        "implementation_tasks": IMPLEMENTATION_TASKS,
    }
    write_report(report)
    write_plan(report)
    write_sql()
    write_validate()
    write_prompt()
    print(f"  {OUT_REPORT}")
    print(f"  {OUT_PLAN}")
    print(f"  {OUT_SQL}")
    print(f"  {OUT_VALIDATE}")
    print(f"  {OUT_PROMPT}")

    # [4] Apply plan
    patch_session_id = ""
    script_run_id    = ""
    if args.apply_plan:
        print("[4/6] Registering script in agentsam_scripts...")
        reg = register_script()
        print(f"  script register: success={reg.get('success')}")

        print("  Creating patch_session record...")
        patch_session_id = create_patch_session(PLAN_ID)
        print(f"  patch_session  : {patch_session_id}")

        print("  Applying plan+tasks SQL to D1...")
        apply_res = run_cmd(
            ["npx", "wrangler", "d1", "execute", D1_DB, "--remote",
             "-c", WRANGLER_CFG, "--file", str(OUT_SQL)],
            timeout=300,
        )
        print(f"  returncode     : {apply_res['returncode']}")
        if apply_res["stdout"].strip():
            print(f"  {apply_res['stdout'].strip()[:300]}")
        if not apply_res["ok"]:
            print(f"  [FAIL] {apply_res['stderr'][:400]}", file=sys.stderr)
            # log failed run
            script_run_id = log_script_run(
                patch_session_id, "failed",
                int((time.time() - t_start) * 1000),
                "Plan SQL apply failed",
                apply_res["stderr"][:300],
            )
            return 1

        print("  Logging script_run record...")
        duration_ms  = int((time.time() - t_start) * 1000)
        script_run_id = log_script_run(
            patch_session_id, "completed", duration_ms,
            f"Applied {len(IMPLEMENTATION_TASKS)} tasks to plan {PLAN_ID}",
        )
        print(f"  script_run     : {script_run_id}")
    else:
        print("[4/6] Skipped (pass --apply-plan to write to D1)")
        print(f"  npx wrangler d1 execute {D1_DB} --remote -c {WRANGLER_CFG} --file={OUT_SQL}")

    # [5] Email report
    print("[5/6] Email report...")
    if not args.no_email:
        email_result = send_email(report)
        if email_result.get("skipped"):
            print(f"  skipped: {email_result.get('reason')}")
        elif email_result.get("ok"):
            print(f"  sent → {email_result.get('to')}  id={email_result.get('id')}")
        else:
            print(f"  [WARN] email failed: {email_result}")
    else:
        print("  skipped (--no-email)")

    # [6] Summary
    duration = round(time.time() - t_start, 1)
    print(f"\n[6/6] Done in {duration}s")
    print()
    p0_count = len([t for t in IMPLEMENTATION_TASKS if t["priority"] == "P0"])
    p1_count = len([t for t in IMPLEMENTATION_TASKS if t["priority"] == "P1"])
    unres    = len(d1_info.get("unresolved_handlers", []))
    print(f"  tasks           : {len(IMPLEMENTATION_TASKS)}  (P0={p0_count} P1={p1_count})")
    print(f"  unresolved hdlrs: {unres}")
    if patch_session_id:
        print(f"  patch_session   : {patch_session_id}")
    if script_run_id:
        print(f"  script_run      : {script_run_id}")
    print()
    print("  Review plan:")
    print(f"    cat {OUT_PLAN}")
    print("  Validate D1:")
    print(f"    bash {OUT_VALIDATE}")
    if not args.apply_plan:
        print("  Apply to D1:")
        print(f"    python3 scripts/agentsam-workflows-frontend-runtime-planner.py --apply-plan")

    if unres:
        print(f"\n  [WARN] {unres} workflow nodes have unresolved handler_keys — fix before execution.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
