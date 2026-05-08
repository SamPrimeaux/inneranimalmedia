#!/usr/bin/env python3
"""
iam_agentsam_audit.py
=====================
Full schema audit of all agentsam_* tables in inneranimalmedia-business D1.

Reads credentials from .cloudflare.env (searches CWD → repo root → home).
Zero pip deps — stdlib only.

Usage
-----
  python3 iam_agentsam_audit.py
  python3 iam_agentsam_audit.py --env /path/to/.cloudflare.env
  python3 iam_agentsam_audit.py --out ./audit_output
  python3 iam_agentsam_audit.py --concurrency 6   # parallel table queries

Outputs (in --out directory)
-----------------------------
  agentsam_audit_<ts>.json       full machine-readable data
  agentsam_audit_<ts>.txt        human summary (active/dormant/empty/config)
  agentsam_SUGGESTIONS_<ts>.md   cursor-ready per-table enhancement suggestions
"""

import argparse
import json
import os
import sys
import time
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
import urllib.request
import urllib.error


# ─────────────────────────────────────────────────────────────────────────────
# KNOWLEDGE BASE  — designed purpose + enhancement suggestions per table
# Any table not listed here gets auto-generated suggestions from schema.
# ─────────────────────────────────────────────────────────────────────────────

TABLE_KNOWLEDGE = {
    # ── MCP / Tools ────────────────────────────────────────────────────────
    "agentsam_mcp_tool_execution": {
        "purpose": "Canonical record of every MCP tool call made by AgentSam. Primary source for MCP KPIs.",
        "dashboard_tabs": ["analytics/mcp", "analytics/overview"],
        "key_metrics": ["call count", "success rate", "latency p95", "top tools by volume/error"],
        "expected_cols": ["tenant_id", "workspace_id", "tool_name", "status", "duration_ms",
                          "created_at", "cost_usd", "input_tokens", "output_tokens"],
        "enhancements": [
            "ADD INDEX on (tenant_id, created_at DESC) if missing — primary time-range filter",
            "ADD INDEX on (tool_name, status) for leaderboard queries",
            "ENSURE status uses enum: success|failure|timeout|blocked|skipped",
            "CONSIDER adding error_code TEXT for bucketed failure analysis",
            "CONSIDER adding session_id to correlate with agentsam_agent_run",
        ],
    },
    "agentsam_tool_call_log": {
        "purpose": "Richer per-call log including non-MCP tools. Supplement to mcp_tool_execution for cost/latency drilldowns.",
        "dashboard_tabs": ["analytics/mcp", "analytics/agent"],
        "key_metrics": ["tool latency histogram", "cost per tool", "failure modes"],
        "expected_cols": ["tool_name", "tool_category", "status", "duration_ms",
                          "cost_usd", "tenant_id", "created_at"],
        "enhancements": [
            "ENSURE tool_category column exists to allow filter: tool_category='mcp'",
            "ADD INDEX on (tool_category, created_at DESC)",
            "ADD INDEX on (tool_name, status, created_at DESC) for leaderboard",
            "VALIDATE all writes include tenant_id — orphaned rows break multi-tenant KPIs",
            "CONSIDER adding retry_count INTEGER DEFAULT 0 for retry-storm detection",
        ],
    },
    "agentsam_tool_stats_compacted": {
        "purpose": "Pre-aggregated tool performance rollups. Feeds fast dashboard KPIs without hitting raw logs.",
        "dashboard_tabs": ["analytics/mcp", "analytics/agent"],
        "key_metrics": ["p95 latency", "success rate trend", "cost rollup"],
        "expected_cols": ["tool_name", "metric_date", "success_count", "failure_count",
                          "avg_duration_ms", "p95_duration_ms", "total_cost_usd"],
        "enhancements": [
            "ENSURE compaction job runs on a cron (agentsam_cron_runs) — check last_run freshness",
            "ADD UNIQUE constraint on (tool_name, metric_date, metric_grain) to prevent double-writes",
            "CONSIDER adding tenant_id to support per-workspace rollups",
            "SURFACE directly in MCP/Agent tab: eliminates expensive COUNT(*) on raw logs",
        ],
    },
    "agentsam_tool_chain": {
        "purpose": "Ordered sequence of tool calls within a single agent turn/chain. Backbone for dependency graph.",
        "dashboard_tabs": ["analytics/agent", "analytics/workflow"],
        "key_metrics": ["chain length", "step failure position", "bottleneck tool"],
        "expected_cols": ["id", "run_id", "tool_name", "step_order", "status",
                          "started_at", "completed_at", "tenant_id"],
        "enhancements": [
            "ADD INDEX on (run_id) — join key from execution_dependency_graph",
            "ENSURE step_order is always populated to enable chain replay",
            "CONSIDER adding parent_chain_id for nested chain tracking",
            "PAIR with agentsam_execution_dependency_graph for 'where did chain block?' UI",
        ],
    },
    "agentsam_mcp_tools": {
        "purpose": "Registry of known MCP tools (metadata). Config table — not a metrics table.",
        "dashboard_tabs": ["settings/tools", "analytics/mcp"],
        "key_metrics": ["N/A — config"],
        "expected_cols": ["tool_name", "tool_key", "server_id", "enabled", "description"],
        "enhancements": [
            "JOIN to agentsam_mcp_tool_execution.tool_name for 'registered but never called' detection",
            "ADD enabled BOOLEAN DEFAULT 1 if missing",
            "CONSIDER requires_approval field to flag high-risk tools in UI",
        ],
    },
    "agentsam_mcp_servers": {
        "purpose": "Registry of connected MCP servers. Config — not metrics.",
        "dashboard_tabs": ["settings/tools", "analytics/mcp"],
        "key_metrics": ["server health", "last_ping"],
        "expected_cols": ["id", "name", "url", "status", "last_ping_at", "tenant_id"],
        "enhancements": [
            "ADD last_ping_at INTEGER for server health monitoring",
            "ADD status TEXT CHECK(status IN ('active','degraded','offline'))",
            "SURFACE in MCP tab as 'MCP Services' health strip",
        ],
    },
    "agentsam_mcp_allowlist": {
        "purpose": "Per-tenant/workspace MCP tool allow rules. Security enforcement config.",
        "dashboard_tabs": ["settings/tools"],
        "key_metrics": ["N/A — config"],
        "expected_cols": ["tenant_id", "workspace_id", "tool_key", "enabled"],
        "enhancements": [
            "ENSURE unique constraint on (tenant_id, workspace_id, tool_key)",
            "CONSIDER adding allowed_by (user_id) + allowed_at for audit trail",
        ],
    },

    # ── Agent / Command Runtime ─────────────────────────────────────────────
    "agentsam_agent_run": {
        "purpose": "Top-level record of a single agent session/turn. Parent of tool_chain, tool_call_log.",
        "dashboard_tabs": ["analytics/agent", "analytics/overview"],
        "key_metrics": ["run count", "success rate", "avg duration", "runs by user"],
        "expected_cols": ["id", "tenant_id", "workspace_id", "user_id", "status",
                          "started_at", "completed_at", "total_cost_usd", "model_key"],
        "enhancements": [
            "ADD INDEX on (tenant_id, started_at DESC) — primary time-range filter",
            "ADD INDEX on (status, started_at DESC) for failure-rate queries",
            "ENSURE completed_at is set on all terminal states (success/failure/timeout)",
            "DERIVE duration_ms = (completed_at - started_at)*1000 in query or add computed col",
            "CONSIDER trigger to auto-write to agentsam_usage_events on completion",
        ],
    },
    "agentsam_command_run": {
        "purpose": "Individual command execution record within an agent run. Feeds execution performance metrics.",
        "dashboard_tabs": ["analytics/agent"],
        "key_metrics": ["command success rate", "latency by command", "failure breakdown"],
        "expected_cols": ["id", "command_id", "command_slug", "tenant_id",
                          "status", "started_at", "duration_ms", "model_key"],
        "enhancements": [
            "ADD INDEX on (command_slug, started_at DESC) for per-command leaderboard",
            "ENSURE FK to agentsam_commands(id) has ON DELETE SET NULL not CASCADE",
            "VALIDATE command_slug is never NULL — needed for GROUP BY in analytics",
            "SOURCE for agentsam_execution_performance_metrics compaction job",
        ],
    },
    "agentsam_executions": {
        "purpose": "Execution lifecycle events. May overlap with agent_run — confirm which is canonical.",
        "dashboard_tabs": ["analytics/agent"],
        "key_metrics": ["execution count", "status distribution"],
        "expected_cols": ["id", "tenant_id", "status", "created_at"],
        "enhancements": [
            "AUDIT: if agentsam_agent_run and agentsam_executions overlap, designate one as canonical",
            "CONSIDER deprecating if agentsam_agent_run serves the same role",
            "If distinct: document in code what makes an 'execution' vs 'agent run'",
        ],
    },
    "agentsam_execution_context": {
        "purpose": "Snapshot of execution context (env vars, config state) at run time. Debug/replay support.",
        "dashboard_tabs": ["analytics/agent (drilldown drawer)"],
        "key_metrics": ["N/A — reference data"],
        "expected_cols": ["execution_id", "context_json", "created_at"],
        "enhancements": [
            "ENSURE context_json is compact — avoid storing large blobs (use R2 ref instead)",
            "ADD TTL/cleanup job: delete rows older than 30d to prevent unbounded growth",
            "SURFACE in 'Run Drilldown' drawer alongside agentsam_execution_steps",
        ],
    },
    "agentsam_execution_steps": {
        "purpose": "Step-level trace within an execution. Finest-grained latency + failure position data.",
        "dashboard_tabs": ["analytics/agent (drilldown)"],
        "key_metrics": ["step latency", "first failure step", "step type distribution"],
        "expected_cols": ["id", "execution_id", "step_name", "step_type", "status",
                          "started_at", "duration_ms"],
        "enhancements": [
            "ADD INDEX on (execution_id) — always queried by parent execution",
            "ADD step_order INTEGER to enable waterfall chart rendering",
            "CONSIDER indexing (step_name, status) for 'most-failing step' aggregation",
        ],
    },
    "agentsam_execution_dependency_graph": {
        "purpose": "DAG of tool-chain dependencies within an execution. Powers 'why did chain block?' drilldowns.",
        "dashboard_tabs": ["analytics/workflow (drilldown)"],
        "key_metrics": ["blocked chains", "dependency depth", "compensation triggers"],
        "expected_cols": ["chain_id", "depends_on_chain_id", "dependency_type", "status",
                          "tenant_id", "workflow_run_id"],
        "enhancements": [
            "ADD INDEX on (workflow_run_id, status) for workflow drilldown queries",
            "ADD INDEX on (chain_id) and (depends_on_chain_id) — both are join keys",
            "SURFACE blocked/failed edges in Workflow tab as 'dependency failures'",
            "VALIDATE condition_json is valid JSON before insert (add CHECK or app-level guard)",
        ],
    },
    "agentsam_execution_performance_metrics": {
        "purpose": "Pre-aggregated observability cube. PRIMARY KPI source for all performance charts.",
        "dashboard_tabs": ["analytics/overview", "analytics/agent", "analytics/mcp",
                           "analytics/models", "analytics/workflow"],
        "key_metrics": ["p95 latency", "success rate", "cost rollup", "token volume",
                        "failure rate by tool/command/model"],
        "expected_cols": ["metric_date", "metric_grain", "source_table", "tool_name",
                          "command_slug", "model_key", "provider", "tenant_id",
                          "success_rate_percent", "p95_duration_ms", "total_cost_usd",
                          "total_tokens_consumed"],
        "enhancements": [
            "CRITICAL: schedule compaction job (cron) to populate this daily — verify via agentsam_cron_runs",
            "ADD INDEX on (tenant_id, metric_date DESC, source_table) — primary query pattern",
            "ADD INDEX on (model_key, metric_date DESC) for Models tab",
            "ADD INDEX on (tool_name, metric_date DESC) for MCP/Tools tab",
            "ENSURE UNIQUE constraint enforced to prevent double-compaction",
            "VERIFY node_key column (added late) is included in all insert paths",
            "USE as primary source for /api/analytics/* — avoid raw log queries where possible",
        ],
    },

    # ── Workflows ───────────────────────────────────────────────────────────
    "agentsam_workflows": {
        "purpose": "Workflow definitions/templates. Config — not metrics.",
        "dashboard_tabs": ["settings/agents", "analytics/workflow"],
        "key_metrics": ["N/A — config"],
        "expected_cols": ["id", "name", "tenant_id", "enabled", "definition_json"],
        "enhancements": [
            "JOIN to agentsam_workflow_runs for 'runs per workflow' KPI",
            "ADD version INTEGER for workflow definition versioning",
        ],
    },
    "agentsam_workflow_runs": {
        "purpose": "Runtime instance of a workflow. Primary source for workflow success/failure KPIs.",
        "dashboard_tabs": ["analytics/workflow", "analytics/overview"],
        "key_metrics": ["run count", "success rate", "avg duration", "failure by workflow"],
        "expected_cols": ["id", "workflow_id", "tenant_id", "workspace_id", "status",
                          "started_at", "completed_at", "total_cost_usd"],
        "enhancements": [
            "ADD INDEX on (tenant_id, started_at DESC)",
            "ADD INDEX on (workflow_id, status) for per-workflow success rate",
            "ENSURE completed_at is written on ALL terminal states",
            "DERIVE duration = completed_at - started_at in API layer",
            "REPLACE mcp_usage_log workflow counting with COUNT(*) on this table",
        ],
    },
    "agentsam_workflow_nodes": {
        "purpose": "Node-level execution records within a workflow run. Powers step-level drilldowns.",
        "dashboard_tabs": ["analytics/workflow (drilldown)"],
        "key_metrics": ["node success rate", "avg node duration", "bottleneck node"],
        "expected_cols": ["id", "workflow_run_id", "node_key", "status",
                          "started_at", "duration_ms"],
        "enhancements": [
            "ADD INDEX on (workflow_run_id) — always joined from workflow_runs",
            "ADD node_order INTEGER for waterfall chart ordering",
            "PAIR with agentsam_workflow_edges for full DAG visualization",
        ],
    },
    "agentsam_workflow_edges": {
        "purpose": "Edge/transition records in workflow DAG. Needed for flow visualization.",
        "dashboard_tabs": ["analytics/workflow (drilldown)"],
        "key_metrics": ["edge traversal count", "conditional branch hit rate"],
        "expected_cols": ["id", "workflow_run_id", "from_node_key", "to_node_key",
                          "condition", "traversed_at"],
        "enhancements": [
            "ADD INDEX on (workflow_run_id) — always queried by run",
            "SURFACE as Mermaid/D3 graph in Workflow drilldown drawer",
            "CONSIDER adding traversal_result (satisfied/skipped/blocked) for branch analytics",
        ],
    },

    # ── Usage & Cost ────────────────────────────────────────────────────────
    "agentsam_usage_events": {
        "purpose": "Canonical per-call usage+cost record. Primary source for Agent Calls KPI and spend tracking.",
        "dashboard_tabs": ["analytics/overview", "analytics/agent", "analytics/costs"],
        "key_metrics": ["agent calls", "total cost USD", "token volume", "cost by model"],
        "expected_cols": ["id", "tenant_id", "workspace_id", "user_id", "model_key",
                          "provider", "input_tokens", "output_tokens", "total_tokens",
                          "total_cost_usd", "created_at"],
        "enhancements": [
            "ADD INDEX on (tenant_id, created_at DESC) — primary filter in all KPI queries",
            "ADD INDEX on (model_key, created_at DESC) for Models tab cost breakdown",
            "ADD INDEX on (provider, created_at DESC) for provider spend comparison",
            "REPLACE ai_usage_log and spend_ledger reads with this table in all new endpoints",
            "ENSURE total_cost_usd is never NULL — default 0.0 minimum",
            "VALIDATE input_tokens + output_tokens = total_tokens or add CHECK constraint",
        ],
    },
    "agentsam_usage_rollups_daily": {
        "purpose": "Daily rollup of usage_events. Fast source for 30d/90d trend charts.",
        "dashboard_tabs": ["analytics/overview", "analytics/costs"],
        "key_metrics": ["daily spend trend", "token volume by day", "cost by model/day"],
        "expected_cols": ["metric_date", "tenant_id", "model_key", "provider",
                          "total_cost_usd", "total_tokens", "call_count"],
        "enhancements": [
            "ENSURE daily compaction cron runs — verify via agentsam_cron_runs",
            "ADD UNIQUE on (metric_date, tenant_id, model_key, provider)",
            "USE this table (not usage_events) for 30d/90d trend charts to avoid full scans",
            "CONSIDER adding workspace_id dimension for per-workspace billing breakdowns",
        ],
    },
    "agentsam_analytics": {
        "purpose": "General analytics events table. Purpose may overlap with usage_events — needs audit.",
        "dashboard_tabs": ["analytics/overview"],
        "key_metrics": ["TBD — depends on schema"],
        "expected_cols": ["event_type", "tenant_id", "created_at", "payload_json"],
        "enhancements": [
            "AUDIT: clarify distinction from agentsam_usage_events",
            "If redundant, consolidate writes into usage_events and deprecate this table",
            "If distinct (e.g. UI events), document event_type taxonomy and add INDEX on (event_type, created_at)",
        ],
    },
    "agentsam_health_daily": {
        "purpose": "Daily health snapshot rollup. Feeds health strip on overview/analytics.",
        "dashboard_tabs": ["analytics/overview"],
        "key_metrics": ["system health score", "error rate trend", "uptime"],
        "expected_cols": ["metric_date", "tenant_id", "health_score", "error_count",
                          "success_count", "warning_count"],
        "enhancements": [
            "ADD UNIQUE on (metric_date, tenant_id) to prevent double-writes",
            "ENSURE daily cron writes this row even if all metrics are zero (gap detection)",
            "SURFACE as small health trend sparkline on Overview KPI row",
        ],
    },

    # ── Models & Routing ───────────────────────────────────────────────────
    "agentsam_ai": {
        "purpose": "Canonical AI model catalog. All model resolution happens from this table. Config.",
        "dashboard_tabs": ["settings/ai-models", "analytics/models"],
        "key_metrics": ["N/A — config"],
        "expected_cols": ["id", "model_key", "provider", "mode", "status",
                          "input_cost_per_1m", "output_cost_per_1m"],
        "enhancements": [
            "ENSURE mode='model' AND status='active' filter is always applied in resolution queries",
            "JOIN to agentsam_usage_events.model_key for 'registered but never called' detection",
            "VERIFY no hardcoded model strings exist in codebase — all refs via this table",
            "ADD last_updated_at INTEGER for pricing freshness tracking",
        ],
    },
    "agentsam_model_catalog": {
        "purpose": "Extended model metadata (capabilities, context window, etc.). May extend agentsam_ai.",
        "dashboard_tabs": ["settings/ai-models"],
        "key_metrics": ["N/A — config"],
        "expected_cols": ["model_key", "context_window", "supports_tools", "supports_vision"],
        "enhancements": [
            "AUDIT relationship to agentsam_ai — consider merging or making explicit FK",
            "SURFACE capability flags in settings/ai-models UI for model selection guidance",
        ],
    },
    "agentsam_model_tier": {
        "purpose": "Tier gating per model (free/pro/enterprise access gates). Config.",
        "dashboard_tabs": ["settings/ai-models"],
        "key_metrics": ["N/A — config"],
        "expected_cols": ["model_key", "tier", "tenant_id"],
        "enhancements": [
            "ENSURE tier check happens in request path before model resolution",
            "SURFACE tier badges in /settings/ai-models model list",
        ],
    },
    "agentsam_model_drift_signals": {
        "purpose": "Detected model quality/behavior regressions over time.",
        "dashboard_tabs": ["analytics/models"],
        "key_metrics": ["drift events", "affected models", "severity trend"],
        "expected_cols": ["model_key", "signal_type", "severity", "detected_at", "tenant_id"],
        "enhancements": [
            "ADD INDEX on (model_key, detected_at DESC)",
            "SURFACE as 'Model Alerts' card in analytics/models tab",
            "CONSIDER webhook trigger when new high-severity drift detected",
        ],
    },
    "agentsam_model_routing_memory": {
        "purpose": "Persisted Thompson Sampling state per routing arm. Feeds routing_arms selection.",
        "dashboard_tabs": ["analytics/models (advanced)"],
        "key_metrics": ["arm win rates", "exploration vs exploitation ratio"],
        "expected_cols": ["routing_arm_id", "alpha", "beta", "last_updated_at"],
        "enhancements": [
            "ADD INDEX on (routing_arm_id)",
            "SURFACE as 'Routing Arm Performance' table in Models tab",
            "ADD last_updated_at if missing — stale memory = stale routing",
        ],
    },
    "agentsam_routing_arms": {
        "purpose": "Thompson Sampling arm definitions. Config + runtime state.",
        "dashboard_tabs": ["analytics/models", "settings/ai-models"],
        "key_metrics": ["arm selection frequency", "current best arm"],
        "expected_cols": ["id", "model_key", "provider", "weight", "enabled"],
        "enhancements": [
            "JOIN to agentsam_model_routing_memory for live arm health",
            "SURFACE active arms in /settings/ai-models for operator visibility",
        ],
    },

    # ── Plans & Tasks ──────────────────────────────────────────────────────
    "agentsam_plans": {
        "purpose": "Agent-generated execution plans. Parent of plan_tasks.",
        "dashboard_tabs": ["analytics/agent"],
        "key_metrics": ["plans generated", "plan completion rate"],
        "expected_cols": ["id", "agent_run_id", "tenant_id", "status", "created_at"],
        "enhancements": [
            "ADD INDEX on (agent_run_id) — always joined from agent_run",
            "ADD INDEX on (tenant_id, status, created_at DESC)",
            "SURFACE plan completion rate as KPI in Agent tab",
        ],
    },
    "agentsam_plan_tasks": {
        "purpose": "Individual tasks within a plan. Granular task-level success tracking.",
        "dashboard_tabs": ["analytics/agent (drilldown)"],
        "key_metrics": ["task completion rate", "most-failing task types"],
        "expected_cols": ["id", "plan_id", "task_type", "status", "created_at"],
        "enhancements": [
            "ADD INDEX on (plan_id) — always joined from plans",
            "ADD INDEX on (task_type, status) for failure categorization",
            "SURFACE as task completion breakdown in Agent run drilldown drawer",
        ],
    },
    "agentsam_task_slos": {
        "purpose": "SLO definitions per task type. Drives SLA breach counts in performance metrics.",
        "dashboard_tabs": ["settings/agents", "analytics/agent"],
        "key_metrics": ["N/A — config"],
        "expected_cols": ["task_type", "max_duration_ms", "target_success_rate"],
        "enhancements": [
            "ENSURE agentsam_execution_performance_metrics.sla_breach_count references these",
            "SURFACE SLO status per task_type in Agent tab as compliance indicators",
        ],
    },
    "agentsam_todo": {
        "purpose": "Agent-generated TODO items. May be user-facing tasks or internal agent checkpoints.",
        "dashboard_tabs": ["overview (task widget)"],
        "key_metrics": ["open items", "overdue items"],
        "expected_cols": ["id", "tenant_id", "user_id", "title", "status", "due_at"],
        "enhancements": [
            "ADD INDEX on (tenant_id, status, due_at)",
            "SURFACE in Overview as 'Open Tasks' widget",
            "ADD completed_at INTEGER for completion time tracking",
        ],
    },

    # ── Errors & Monitoring ─────────────────────────────────────────────────
    "agentsam_error_log": {
        "purpose": "Runtime error records. Primary source for error monitoring tab.",
        "dashboard_tabs": ["analytics/errors", "analytics/overview (health strip)"],
        "key_metrics": ["error count", "error rate", "top error types"],
        "expected_cols": ["id", "tenant_id", "error_type", "error_code", "message",
                          "severity", "created_at", "source_table", "source_id"],
        "enhancements": [
            "ADD INDEX on (tenant_id, severity, created_at DESC)",
            "ADD INDEX on (error_type, created_at DESC) for error leaderboard",
            "ADD TTL cleanup job: archive rows older than 90d to R2",
            "SURFACE as 'Error Inbox' widget in Overview + dedicated Errors tab",
            "ADD resolved_at INTEGER + resolved_by TEXT for error triage workflow",
        ],
    },
    "agentsam_escalation": {
        "purpose": "Escalation events (SLO breach, guardrail violation, approval required).",
        "dashboard_tabs": ["analytics/errors"],
        "key_metrics": ["open escalations", "escalation rate", "avg resolution time"],
        "expected_cols": ["id", "tenant_id", "escalation_type", "severity", "status",
                          "created_at", "resolved_at"],
        "enhancements": [
            "ADD INDEX on (tenant_id, status, created_at DESC)",
            "SURFACE unresolved escalations as badge count in sidebar nav",
            "ADD resolved_by TEXT for accountability tracking",
        ],
    },
    "agentsam_guardrails": {
        "purpose": "Guardrail rule definitions. Config.",
        "dashboard_tabs": ["settings/rules"],
        "key_metrics": ["N/A — config"],
        "expected_cols": ["id", "name", "rule_type", "enabled", "tenant_id"],
        "enhancements": [
            "JOIN to agentsam_guardrail_events for 'rules with most triggers' analytics",
            "ADD last_triggered_at for staleness detection in settings UI",
        ],
    },
    "agentsam_guardrail_rulesets": {
        "purpose": "Named collections of guardrails. Config grouping layer.",
        "dashboard_tabs": ["settings/rules"],
        "key_metrics": ["N/A — config"],
        "expected_cols": ["id", "name", "tenant_id", "guardrail_ids"],
        "enhancements": [
            "CONSIDER replacing guardrail_ids JSON array with a join table for integrity",
        ],
    },
    "agentsam_guardrail_events": {
        "purpose": "Fired guardrail violations. Runtime events from guardrail_rulesets.",
        "dashboard_tabs": ["analytics/errors", "analytics/agent"],
        "key_metrics": ["violation count", "top violated rules", "violation rate"],
        "expected_cols": ["id", "guardrail_id", "tenant_id", "severity",
                          "triggered_at", "context_json"],
        "enhancements": [
            "ADD INDEX on (guardrail_id, triggered_at DESC)",
            "ADD INDEX on (tenant_id, severity, triggered_at DESC)",
            "SURFACE in Agent tab as 'Guardrail Violations' chart (stacked by severity)",
            "ADD resolved BOOLEAN DEFAULT 0 for triage workflow",
        ],
    },
    "agentsam_deployment_health": {
        "purpose": "Per-deploy health snapshot. Feeds Deploys tab KPIs.",
        "dashboard_tabs": ["analytics/deploys"],
        "key_metrics": ["deploy success rate", "last deploy age", "failure count"],
        "expected_cols": ["id", "tenant_id", "deployment_id", "status", "health_score",
                          "created_at"],
        "enhancements": [
            "JOIN to deployments table for full deploy context",
            "ADD INDEX on (tenant_id, created_at DESC)",
            "SURFACE as health sparkline per deployment in Deploys tab",
        ],
    },

    # ── Evals ──────────────────────────────────────────────────────────────
    "agentsam_eval_cases": {
        "purpose": "Test case definitions for agent evaluation. Config/reference.",
        "dashboard_tabs": ["analytics/evals"],
        "key_metrics": ["N/A — config"],
        "expected_cols": ["id", "name", "expected_output", "input_prompt", "tenant_id"],
        "enhancements": [
            "ADD version INTEGER for eval case versioning",
            "JOIN to agentsam_eval_runs for pass/fail rate per case",
        ],
    },
    "agentsam_eval_runs": {
        "purpose": "Execution records for eval suites. Primary Evals tab data source.",
        "dashboard_tabs": ["analytics/evals"],
        "key_metrics": ["pass rate", "regression count", "eval run frequency"],
        "expected_cols": ["id", "suite_id", "tenant_id", "status", "pass_count",
                          "fail_count", "created_at"],
        "enhancements": [
            "ADD INDEX on (suite_id, created_at DESC)",
            "ADD INDEX on (tenant_id, created_at DESC)",
            "SURFACE pass rate trend as line chart in Evals tab",
            "SURFACE failing cases as drilldown table",
        ],
    },
    "agentsam_eval_suites": {
        "purpose": "Named collections of eval cases. Config grouping.",
        "dashboard_tabs": ["analytics/evals"],
        "key_metrics": ["N/A — config"],
        "expected_cols": ["id", "name", "tenant_id", "case_ids"],
        "enhancements": [
            "CONSIDER replacing case_ids JSON with a join table",
            "ADD last_run_at for staleness detection",
        ],
    },

    # ── Hooks & Webhooks ───────────────────────────────────────────────────
    "agentsam_hook": {
        "purpose": "Hook definitions (event → action bindings). Config.",
        "dashboard_tabs": ["settings/hooks"],
        "key_metrics": ["N/A — config"],
        "expected_cols": ["id", "event_type", "target_url", "enabled", "tenant_id"],
        "enhancements": [
            "JOIN to agentsam_hook_execution for 'hooks with most failures' analytics",
            "ADD last_triggered_at for activity detection in settings UI",
        ],
    },
    "agentsam_hook_execution": {
        "purpose": "Execution records for hook firings. Needed for hook reliability monitoring.",
        "dashboard_tabs": ["settings/hooks", "analytics/errors"],
        "key_metrics": ["hook success rate", "top failing hooks"],
        "expected_cols": ["id", "hook_id", "status", "duration_ms",
                          "http_status_code", "created_at"],
        "enhancements": [
            "ADD INDEX on (hook_id, created_at DESC)",
            "ADD INDEX on (status, created_at DESC) for failure monitoring",
            "SURFACE hook success rate in settings/hooks as reliability badge",
        ],
    },
    "agentsam_webhook_events": {
        "purpose": "Inbound/outbound webhook event log. Analytics surface for webhook monitoring.",
        "dashboard_tabs": ["settings/hooks", "analytics/overview"],
        "key_metrics": ["event volume", "delivery success rate"],
        "expected_cols": ["id", "tenant_id", "event_type", "status", "payload_size",
                          "created_at"],
        "enhancements": [
            "ADD INDEX on (tenant_id, event_type, created_at DESC)",
            "SURFACE delivery success rate as KPI in settings/hooks",
        ],
    },
    "agentsam_webhook_weekly": {
        "purpose": "Weekly rollup of webhook_events. Fast source for trend charts.",
        "dashboard_tabs": ["analytics/overview"],
        "key_metrics": ["weekly webhook volume", "weekly delivery rate"],
        "expected_cols": ["week_start", "tenant_id", "total_events", "success_count"],
        "enhancements": [
            "ENSURE weekly compaction cron is scheduled",
            "ADD UNIQUE on (week_start, tenant_id)",
        ],
    },

    # ── Memory & Context ───────────────────────────────────────────────────
    "agentsam_memory": {
        "purpose": "Persisted agent memory entries. Used for context injection in subsequent turns.",
        "dashboard_tabs": ["settings/agents"],
        "key_metrics": ["memory entry count", "memory freshness"],
        "expected_cols": ["id", "tenant_id", "workspace_id", "user_id",
                          "memory_text", "embedding_key", "created_at"],
        "enhancements": [
            "ADD TTL/cleanup job: memory older than 90d should be archived or pruned",
            "ADD INDEX on (user_id, created_at DESC)",
            "PAIR with Supabase pgvector for semantic memory retrieval",
        ],
    },
    "agentsam_context_digest": {
        "purpose": "Compressed context summaries for long-running sessions.",
        "dashboard_tabs": ["analytics/agent (drilldown)"],
        "key_metrics": ["compression ratio", "digest freshness"],
        "expected_cols": ["id", "run_id", "digest_text", "original_token_count",
                          "compressed_token_count", "created_at"],
        "enhancements": [
            "SURFACE token savings metric in Agent tab as 'Context Compression' KPI",
            "ADD compression_ratio REAL as computed col or derive in query",
        ],
    },
    "agentsam_project_context": {
        "purpose": "Project-scoped context blobs. Reference data injected into agent sessions.",
        "dashboard_tabs": ["settings/workspace"],
        "key_metrics": ["N/A — config"],
        "expected_cols": ["id", "workspace_id", "context_key", "context_text", "updated_at"],
        "enhancements": [
            "ADD size_bytes INTEGER for storage monitoring",
            "ADD version INTEGER for context versioning",
        ],
    },

    # ── Rules, Policies & Access ────────────────────────────────────────────
    "agentsam_rules_document": {
        "purpose": "Injected rules/instruction documents for agent behavior. Config.",
        "dashboard_tabs": ["settings/rules"],
        "key_metrics": ["N/A — config"],
        "expected_cols": ["id", "name", "tenant_id", "workspace_id", "content", "enabled"],
        "enhancements": [
            "ADD version INTEGER for rules versioning",
            "ADD last_applied_at to know if rule is actively used",
        ],
    },
    "agentsam_user_policy": {
        "purpose": "Per-user access policy overrides. Security enforcement config.",
        "dashboard_tabs": ["settings/security"],
        "key_metrics": ["N/A — config"],
        "expected_cols": ["user_id", "tenant_id", "policy_json", "updated_at"],
        "enhancements": [
            "ADD updated_by TEXT for audit trail",
            "ENSURE policy_json schema is validated at write time",
        ],
    },
    "agentsam_user_feature_override": {
        "purpose": "Per-user feature flag overrides. Supplements agentsam_feature_flag.",
        "dashboard_tabs": ["settings/general"],
        "key_metrics": ["N/A — config"],
        "expected_cols": ["user_id", "feature_key", "enabled", "tenant_id"],
        "enhancements": [
            "ADD UNIQUE on (user_id, feature_key, tenant_id)",
            "SURFACE in user management UI as feature override badges",
        ],
    },
    "agentsam_feature_flag": {
        "purpose": "Feature flag definitions. Runtime gates for new capabilities.",
        "dashboard_tabs": ["settings/general"],
        "key_metrics": ["N/A — config"],
        "expected_cols": ["key", "enabled", "tenant_id", "workspace_id", "rollout_pct"],
        "enhancements": [
            "ADD rollout_pct INTEGER DEFAULT 100 for gradual rollout support",
            "SURFACE in settings/general as a toggle list",
            "JOIN to agentsam_user_feature_override for per-user exceptions",
        ],
    },
    "agentsam_fetch_domain_allowlist": {
        "purpose": "Allowed external fetch domains for agent browser/fetch tool calls. Security config.",
        "dashboard_tabs": ["settings/network"],
        "key_metrics": ["N/A — config"],
        "expected_cols": ["domain", "tenant_id", "enabled", "added_by"],
        "enhancements": [
            "ADD UNIQUE on (domain, tenant_id)",
            "ADD added_by TEXT + added_at INTEGER for audit",
            "SURFACE in settings/network alongside browser_trusted_origin",
        ],
    },
    "agentsam_browser_trusted_origin": {
        "purpose": "Trusted browser origins for cross-origin PTY/agent interactions.",
        "dashboard_tabs": ["settings/network", "settings/security"],
        "key_metrics": ["N/A — config"],
        "expected_cols": ["origin", "tenant_id", "enabled"],
        "enhancements": [
            "ADD UNIQUE on (origin, tenant_id)",
            "SURFACE in settings/network alongside fetch_domain_allowlist",
        ],
    },
    "agentsam_ignore_pattern": {
        "purpose": "File/path patterns the codebase indexer should skip.",
        "dashboard_tabs": ["settings/github"],
        "key_metrics": ["N/A — config"],
        "expected_cols": ["pattern", "tenant_id", "workspace_id"],
        "enhancements": [
            "ADD UNIQUE on (pattern, workspace_id)",
            "SURFACE in settings/github as gitignore-style editor",
        ],
    },
    "agentsam_subscription_registry": {
        "purpose": "Event subscription registry (pub/sub bindings). Config.",
        "dashboard_tabs": ["settings/integrations"],
        "key_metrics": ["N/A — config"],
        "expected_cols": ["id", "event_type", "subscriber_url", "tenant_id", "enabled"],
        "enhancements": [
            "JOIN to agentsam_webhook_events for 'subscription delivery rate' analytics",
            "ADD last_delivered_at for staleness monitoring",
        ],
    },

    # ── Workspace & Config ──────────────────────────────────────────────────
    "agentsam_workspace": {
        "purpose": "Workspace entity definitions. Master config for multi-tenant workspace scoping.",
        "dashboard_tabs": ["settings/workspace"],
        "key_metrics": ["N/A — config"],
        "expected_cols": ["id", "name", "tenant_id", "created_at", "status"],
        "enhancements": [
            "ENSURE all agentsam_* tables with workspace_id FK reference this table",
            "ADD plan_tier TEXT for workspace billing tier scoping",
        ],
    },
    "agentsam_workspace_state": {
        "purpose": "Live workspace state (active session count, last activity). Runtime.",
        "dashboard_tabs": ["analytics/overview"],
        "key_metrics": ["active workspaces", "last activity"],
        "expected_cols": ["workspace_id", "last_active_at", "active_sessions"],
        "enhancements": [
            "SURFACE last_active_at in overview as 'Last Activity' KPI",
            "ADD upsert pattern on writes — this should have exactly one row per workspace",
        ],
    },
    "agentsam_bootstrap": {
        "purpose": "Bootstrap/seed data tracking. Records initial setup state.",
        "dashboard_tabs": ["N/A — internal"],
        "key_metrics": ["N/A"],
        "expected_cols": ["key", "completed_at", "version"],
        "enhancements": [
            "ENSURE bootstrap steps are idempotent — add UNIQUE on key",
            "ADD version INTEGER to track re-bootstrap after migrations",
        ],
    },

    # ── Skills & Subagents ──────────────────────────────────────────────────
    "agentsam_skill": {
        "purpose": "Skill definitions. Each skill = named capability with SKILL.md in R2.",
        "dashboard_tabs": ["settings/agents"],
        "key_metrics": ["N/A — config"],
        "expected_cols": ["id", "name", "file_path", "tenant_id", "enabled"],
        "enhancements": [
            "JOIN to agentsam_skill_invocation for 'most-used skills' analytics",
            "ADD last_invoked_at for staleness detection",
        ],
    },
    "agentsam_skill_invocation": {
        "purpose": "Record of every skill invocation. Source for skill usage analytics.",
        "dashboard_tabs": ["analytics/agent"],
        "key_metrics": ["invocation count", "success rate", "top skills"],
        "expected_cols": ["id", "skill_id", "tenant_id", "status", "created_at"],
        "enhancements": [
            "ADD INDEX on (skill_id, created_at DESC)",
            "ADD INDEX on (tenant_id, created_at DESC)",
            "SURFACE as 'Top Skills' leaderboard in Agent tab",
        ],
    },
    "agentsam_skill_revision": {
        "purpose": "Version history for skill definitions.",
        "dashboard_tabs": ["settings/agents"],
        "key_metrics": ["N/A — config"],
        "expected_cols": ["id", "skill_id", "version", "file_path", "created_at"],
        "enhancements": [
            "ADD INDEX on (skill_id, version DESC)",
            "SURFACE version history in settings/agents skill editor",
        ],
    },
    "agentsam_subagent_profile": {
        "purpose": "Subagent configurations (coder, browser, toolbox, recall). Config.",
        "dashboard_tabs": ["settings/agents"],
        "key_metrics": ["N/A — config"],
        "expected_cols": ["id", "name", "model_key", "system_prompt_key", "enabled"],
        "enhancements": [
            "SURFACE in settings/agents as subagent profile editor",
            "JOIN to agentsam_usage_events for per-subagent cost breakdown",
        ],
    },

    # ── Scripts & Jobs ──────────────────────────────────────────────────────
    "agentsam_scripts": {
        "purpose": "Agent-runnable script definitions. Config.",
        "dashboard_tabs": ["settings/agents"],
        "key_metrics": ["N/A — config"],
        "expected_cols": ["id", "name", "content", "language", "tenant_id"],
        "enhancements": [
            "JOIN to agentsam_script_runs for 'scripts never executed' detection",
        ],
    },
    "agentsam_script_runs": {
        "purpose": "Execution records for script runs.",
        "dashboard_tabs": ["analytics/agent"],
        "key_metrics": ["script run count", "failure rate"],
        "expected_cols": ["id", "script_id", "status", "output", "created_at", "tenant_id"],
        "enhancements": [
            "ADD INDEX on (script_id, created_at DESC)",
            "ADD INDEX on (tenant_id, status, created_at DESC)",
        ],
    },
    "agentsam_cron_runs": {
        "purpose": "Cron job execution records. CRITICAL for validating all compaction jobs are running.",
        "dashboard_tabs": ["analytics/overview (data health strip)"],
        "key_metrics": ["last run per job", "failure count", "missed runs"],
        "expected_cols": ["id", "cron_key", "status", "started_at", "completed_at"],
        "enhancements": [
            "ADD INDEX on (cron_key, started_at DESC)",
            "SURFACE in Overview 'Data Health' strip — show last run time per compaction job",
            "ADD expected_interval_seconds to detect missed runs automatically",
            "CRITICAL: verify agentsam_execution_performance_metrics, usage_rollups_daily, "
            "tool_stats_compacted, health_daily all have cron_key entries here",
        ],
    },
    "agentsam_cad_jobs": {
        "purpose": "CAD/conversion job records.",
        "dashboard_tabs": ["analytics/storage (if applicable)"],
        "key_metrics": ["N/A — likely domain specific"],
        "expected_cols": ["id", "status", "created_at"],
        "enhancements": [
            "AUDIT: determine if this is IAM-specific or a leftover from client work",
        ],
    },
    "agentsam_code_index_job": {
        "purpose": "Codebase indexing job tracker. Feeds Supabase codebase_* tables.",
        "dashboard_tabs": ["analytics/codebase"],
        "key_metrics": ["last index run", "files indexed", "index freshness"],
        "expected_cols": ["id", "workspace_id", "status", "files_processed",
                          "started_at", "completed_at"],
        "enhancements": [
            "SURFACE last run + file count in analytics/codebase tab header",
            "ADD error_message TEXT for failed job diagnostics",
        ],
    },

    # ── Artifacts & Prompts ─────────────────────────────────────────────────
    "agentsam_artifacts": {
        "purpose": "Captured artifacts (code, files, outputs) from agent runs.",
        "dashboard_tabs": ["analytics/agent (drilldown)"],
        "key_metrics": ["artifact count", "storage size"],
        "expected_cols": ["id", "run_id", "artifact_type", "r2_key", "size_bytes",
                          "tenant_id", "created_at"],
        "enhancements": [
            "ADD INDEX on (run_id) — always joined from agent_run drilldown",
            "ADD INDEX on (tenant_id, artifact_type, created_at DESC)",
            "SURFACE as artifact list in Agent run drilldown drawer",
        ],
    },
    "agentsam_prompt_versions": {
        "purpose": "Version-controlled prompt definitions. Config.",
        "dashboard_tabs": ["settings/agents"],
        "key_metrics": ["N/A — config"],
        "expected_cols": ["id", "prompt_key", "version", "content", "created_at"],
        "enhancements": [
            "ADD UNIQUE on (prompt_key, version)",
            "SURFACE version diff in settings/agents prompt editor",
        ],
    },
    "agentsam_prompt_cache_keys": {
        "purpose": "Cached prompt prefix keys for Anthropic prompt caching.",
        "dashboard_tabs": ["analytics/costs"],
        "key_metrics": ["cache hit rate", "cache savings"],
        "expected_cols": ["cache_key", "model_key", "tenant_id", "created_at", "expires_at"],
        "enhancements": [
            "ADD hit_count INTEGER to measure cache effectiveness",
            "SURFACE cache savings in analytics/costs as 'Prompt Cache Savings' KPI",
        ],
    },
    "agentsam_prompt_routes": {
        "purpose": "Routing rules that map intents to specific prompts/models. Config.",
        "dashboard_tabs": ["settings/agents"],
        "key_metrics": ["N/A — config"],
        "expected_cols": ["id", "intent_pattern", "prompt_key", "model_key", "tenant_id"],
        "enhancements": [
            "JOIN to agentsam_usage_events for 'route hit frequency' analytics",
        ],
    },
    "agentsam_route_requirements": {
        "purpose": "Required preconditions for route activation. Config.",
        "dashboard_tabs": ["settings/agents"],
        "key_metrics": ["N/A — config"],
        "expected_cols": ["route_id", "requirement_type", "value"],
        "enhancements": [
            "SURFACE unmet requirements as warnings in settings/agents",
        ],
    },

    # ── Commands ────────────────────────────────────────────────────────────
    "agentsam_commands": {
        "purpose": "Command definitions resolvable by resolveAgentCommand. Config.",
        "dashboard_tabs": ["settings/agents"],
        "key_metrics": ["N/A — config"],
        "expected_cols": ["id", "slug", "name", "handler", "tenant_id", "enabled"],
        "enhancements": [
            "JOIN to agentsam_command_run for 'commands never executed' detection",
        ],
    },
    "agentsam_command_pattern": {
        "purpose": "Regex/glob patterns for command matching in resolveAgentCommand.",
        "dashboard_tabs": ["settings/agents"],
        "key_metrics": ["N/A — config"],
        "expected_cols": ["id", "pattern", "command_id", "priority"],
        "enhancements": [
            "ADD UNIQUE on (pattern) to prevent duplicate matchers",
            "ADD INDEX on (priority) for ordered resolution",
        ],
    },
    "agentsam_command_allowlist": {
        "purpose": "Per-tenant command allow rules. Security enforcement.",
        "dashboard_tabs": ["settings/agents", "settings/security"],
        "key_metrics": ["N/A — config"],
        "expected_cols": ["command_id", "tenant_id", "workspace_id", "enabled"],
        "enhancements": [
            "ADD UNIQUE on (command_id, tenant_id, workspace_id)",
        ],
    },
    "agentsam_slash_commands": {
        "purpose": "Slash command definitions (user-facing /commands).",
        "dashboard_tabs": ["settings/agents"],
        "key_metrics": ["N/A — config"],
        "expected_cols": ["id", "command", "description", "handler", "tenant_id"],
        "enhancements": [
            "SURFACE in settings/agents as slash command editor",
            "JOIN to agentsam_command_run for usage frequency",
        ],
    },

    # ── Compaction / Rollup Sources ─────────────────────────────────────────
    "agentsam_compaction_events": {
        "purpose": "Log of compaction job runs. Complements cron_runs for data pipeline health.",
        "dashboard_tabs": ["analytics/overview (data health)"],
        "key_metrics": ["last compaction time", "rows compacted"],
        "expected_cols": ["id", "source_table", "rows_written", "compacted_at"],
        "enhancements": [
            "ADD INDEX on (source_table, compacted_at DESC)",
            "SURFACE in Overview Data Health strip as pipeline status per table",
        ],
    },

    # ── Approval / Escalation ───────────────────────────────────────────────
    "agentsam_approval_queue": {
        "purpose": "Pending approval items for requires_approval=1 MCP tools.",
        "dashboard_tabs": ["analytics/overview (badge)", "settings/tools"],
        "key_metrics": ["pending count", "avg wait time"],
        "expected_cols": ["id", "tenant_id", "tool_name", "status", "created_at",
                          "approved_by", "approved_at"],
        "enhancements": [
            "ADD INDEX on (tenant_id, status, created_at DESC)",
            "SURFACE as badge count in sidebar nav and Overview KPI row",
            "ADD expired_at to auto-expire stale approvals",
        ],
    },
}

# ─────────────────────────────────────────────────────────────────────────────
# D1 CLIENT
# ─────────────────────────────────────────────────────────────────────────────

class D1Client:
    BASE = "https://api.cloudflare.com/client/v4"
    _lock = threading.Lock()

    def __init__(self, token: str, account_id: str, db_id: str):
        self.token = token
        self.account_id = account_id
        self.db_id = db_id

    def _url(self):
        return f"{self.BASE}/accounts/{self.account_id}/d1/database/{self.db_id}/query"

    def query(self, sql: str, params: list | None = None) -> dict:
        payload = json.dumps({"sql": sql, "params": params or []}).encode()
        req = urllib.request.Request(
            self._url(), data=payload,
            headers={"Authorization": f"Bearer {self.token}",
                     "Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            return {"success": False, "errors": [{"message": e.read().decode()}]}
        except Exception as exc:
            return {"success": False, "errors": [{"message": str(exc)}]}

    def rows(self, sql: str, params: list | None = None) -> list[dict]:
        r = self.query(sql, params)
        if not r.get("success"):
            return []
        results = r.get("result", [])
        return results[0].get("results", []) if results else []

    def scalar(self, sql: str, params: list | None = None):
        rows = self.rows(sql, params)
        return next(iter(rows[0].values()), None) if rows else None


# ─────────────────────────────────────────────────────────────────────────────
# ENV LOADER
# ─────────────────────────────────────────────────────────────────────────────

ENV_VAR_CANDIDATES = {
    "token": [
        "CLOUDFLARE_API_TOKEN", "CF_API_TOKEN",
        "CLOUDFLARE_TOKEN", "CF_TOKEN",
    ],
    "account": [
        "CLOUDFLARE_ACCOUNT_ID", "CF_ACCOUNT_ID",
        "CLOUDFLARE_ACCOUNT", "CF_ACCOUNT",
    ],
    "db": [
        "CF_D1_DATABASE_ID", "CLOUDFLARE_D1_DATABASE_ID",
        "D1_DATABASE_ID", "D1_DB_ID",
    ],
}

DEFAULT_DB_ID = "cf87b717-d4e2-4cf8-bab0-a81268e32d49"


def load_env_file(path: Path) -> dict:
    env = {}
    if path.exists():
        for line in path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def find_env_file(hint: str | None) -> Path | None:
    """Search for .cloudflare.env in hint path, CWD, parents, home."""
    candidates = []
    if hint:
        candidates.append(Path(hint))
    search_dirs = [Path.cwd()] + list(Path.cwd().parents) + [Path.home()]
    for d in search_dirs:
        candidates.append(d / ".cloudflare.env")
        candidates.append(d / "cloudflare.env")
        candidates.append(d / ".env")
    for p in candidates:
        if p.exists():
            return p
    return None


def resolve_creds(env_hint: str | None, cli_token: str | None,
                  cli_account: str | None, cli_db: str | None) -> tuple[str, str, str]:
    env_path = find_env_file(env_hint)
    file_env = load_env_file(env_path) if env_path else {}
    merged = {**file_env, **os.environ}  # OS env wins

    def pick(candidates):
        for k in candidates:
            if merged.get(k):
                return merged[k]
        return None

    token   = cli_token   or pick(ENV_VAR_CANDIDATES["token"])
    account = cli_account or pick(ENV_VAR_CANDIDATES["account"])
    db      = cli_db      or pick(ENV_VAR_CANDIDATES["db"]) or DEFAULT_DB_ID

    missing = []
    if not token:   missing.append("token  (CLOUDFLARE_API_TOKEN / CF_API_TOKEN)")
    if not account: missing.append("account (CLOUDFLARE_ACCOUNT_ID / CF_ACCOUNT_ID)")
    if missing:
        print("ERROR — missing credentials:", file=sys.stderr)
        for m in missing: print(f"  {m}", file=sys.stderr)
        if env_path:
            print(f"  Loaded env file: {env_path}", file=sys.stderr)
        else:
            print("  No .cloudflare.env found — searched CWD + parents + home", file=sys.stderr)
        sys.exit(1)

    if env_path:
        print(f"Credentials loaded from: {env_path}")
    return token, account, db


# ─────────────────────────────────────────────────────────────────────────────
# TABLE INSPECTION
# ─────────────────────────────────────────────────────────────────────────────

def get_all_agentsam_tables(client: D1Client) -> list[str]:
    rows = client.rows(
        "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'agentsam_%' "
        "ORDER BY name"
    )
    return [r["name"] for r in rows]


def get_schema(client: D1Client, table: str) -> list[dict]:
    return client.rows(f"PRAGMA table_info([{table}])")


def get_indexes(client: D1Client, table: str) -> list[str]:
    rows = client.rows(
        f"SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='{table}'"
    )
    return [r["name"] for r in rows]


def get_row_count_and_freshness(client: D1Client, table: str,
                                 ts_col: str | None) -> dict:
    result = {"count": None, "max_ts": None, "age_hours": None,
              "ts_col": ts_col, "is_unix": False}
    try:
        n = client.scalar(f"SELECT COUNT(*) FROM [{table}]")
        result["count"] = int(n) if n is not None else 0
    except Exception:
        pass

    if ts_col and result["count"]:
        try:
            row = client.rows(
                f"SELECT MAX([{ts_col}]) AS mx FROM [{table}] WHERE [{ts_col}] IS NOT NULL"
            )
            if row:
                mx = row[0].get("mx")
                result["max_ts"] = mx
                if isinstance(mx, (int, float)) and mx > 1_000_000_000:
                    result["is_unix"] = True
                    result["age_hours"] = round((time.time() - float(mx)) / 3600, 1)
                elif isinstance(mx, str) and mx:
                    try:
                        dt = datetime.fromisoformat(mx.replace("Z", "+00:00"))
                        now = datetime.now(timezone.utc)
                        result["age_hours"] = round((now - dt).total_seconds() / 3600, 1)
                    except Exception:
                        pass
        except Exception:
            pass
    return result


TIMESTAMP_CANDIDATES = ["created_at", "started_at", "executed_at", "timestamp",
                        "event_time", "recorded_at", "run_at", "triggered_at",
                        "detected_at", "compacted_at", "last_updated_at"]


def detect_ts_col(schema: list[dict]) -> str | None:
    col_names = {c["name"].lower() for c in schema}
    for c in TIMESTAMP_CANDIDATES:
        if c in col_names:
            return c
    return None


def classify_table(count: int | None, age_hours: float | None,
                   knowledge: dict | None) -> str:
    """active | dormant | empty | config"""
    purpose = (knowledge or {}).get("purpose", "")
    is_config = ("Config" in purpose or "config" in purpose or
                 "N/A — config" in str((knowledge or {}).get("key_metrics", "")))
    if count is None:
        return "unknown"
    if count == 0:
        return "config" if is_config else "empty"
    if is_config:
        return "config"
    if age_hours is None:
        return "dormant"
    if age_hours <= 168:  # 7 days
        return "active"
    return "dormant"


def audit_table(client: D1Client, table: str) -> dict:
    schema = get_schema(client, table)
    if not schema:
        return {"table": table, "exists": False}

    indexes = get_indexes(client, table)
    ts_col = detect_ts_col(schema)
    freshness = get_row_count_and_freshness(client, table, ts_col)
    knowledge = TABLE_KNOWLEDGE.get(table, {})
    classification = classify_table(
        freshness["count"], freshness["age_hours"], knowledge
    )

    col_names = {c["name"].lower() for c in schema}
    expected = knowledge.get("expected_cols", [])
    missing_expected = [c for c in expected if c.lower() not in col_names]
    has_tenant = "tenant_id" in col_names
    has_ts = ts_col is not None

    # Auto-generate enhancements for unknown tables
    enhancements = knowledge.get("enhancements", [])
    if not enhancements:
        if not has_tenant:
            enhancements.append("CONSIDER adding tenant_id for multi-tenant scoping")
        if not has_ts:
            enhancements.append("CONSIDER adding created_at INTEGER DEFAULT (unixepoch()) for time-range queries")
        if not indexes:
            enhancements.append("ADD at least one index — no indexes found")

    return {
        "table":              table,
        "exists":             True,
        "classification":     classification,
        "row_count":          freshness["count"],
        "age_hours":          freshness["age_hours"],
        "ts_col":             ts_col,
        "is_unix_ts":         freshness["is_unix"],
        "has_tenant_id":      has_tenant,
        "indexes":            indexes,
        "index_count":        len(indexes),
        "col_count":          len(schema),
        "columns":            [{"name": c["name"], "type": c["type"],
                                "notnull": bool(c["notnull"]), "pk": bool(c["pk"])}
                               for c in schema],
        "missing_expected":   missing_expected,
        "purpose":            knowledge.get("purpose", "Unknown — not in knowledge base"),
        "dashboard_tabs":     knowledge.get("dashboard_tabs", []),
        "key_metrics":        knowledge.get("key_metrics", []),
        "enhancements":       enhancements,
        "in_knowledge_base":  bool(knowledge),
    }


# ─────────────────────────────────────────────────────────────────────────────
# REPORT RENDERING
# ─────────────────────────────────────────────────────────────────────────────

SEP80 = "─" * 80
SEP60 = "─" * 60


def render_txt(audits: list[dict], ts: str) -> str:
    lines = [
        "IAM agentsam_* FULL TABLE AUDIT",
        f"Generated : {ts}",
        f"Tables    : {len(audits)}",
        SEP80,
    ]

    groups = {"active": [], "dormant": [], "empty": [], "config": [], "unknown": []}
    for a in audits:
        if not a.get("exists"):
            groups.setdefault("missing", []).append(a)
            continue
        groups[a.get("classification", "unknown")].append(a)

    for cls, items in groups.items():
        if not items:
            continue
        label = {
            "active":  "ACTIVE  (rows > 0, written within 7d)",
            "dormant": "DORMANT (rows > 0, stale > 7d)",
            "empty":   "EMPTY   (0 rows — capability gap)",
            "config":  "CONFIG  (reference/settings data)",
            "unknown": "UNKNOWN",
            "missing": "NOT IN DB",
        }.get(cls, cls.upper())
        lines += ["", f"▌ {label}  [{len(items)} tables]", SEP80]
        for a in sorted(items, key=lambda x: x["table"]):
            rc = a.get("row_count")
            age = a.get("age_hours")
            rc_s = f"{rc:,}" if rc is not None else "n/a"
            age_s = f"{age}h ago" if age is not None else "—"
            lines.append(
                f"  {a['table']:<55} rows={rc_s:<10} last={age_s:<12}"
                f"  idx={a.get('index_count', 0)}"
            )

    lines += ["", SEP80, "ENHANCEMENT SUMMARY (tables with missing expected columns)", SEP80]
    for a in sorted(audits, key=lambda x: x["table"]):
        if not a.get("exists"):
            continue
        missing = a.get("missing_expected", [])
        if missing:
            lines.append(f"  {a['table']}: missing {missing}")

    lines += ["", SEP80, "END", SEP80]
    return "\n".join(lines)


def render_suggestions_md(audits: list[dict], ts: str) -> str:
    lines = [
        "# agentsam_* Table Enhancement Suggestions",
        f"> Generated: {ts}  ",
        f"> Tables audited: {len(audits)}",
        "",
        "Use this file in Cursor: each section = one table, one PR/task.",
        "Priority order: ACTIVE tables first, then EMPTY capability tables.",
        "",
    ]

    # Sort: active → dormant → empty → config
    order = {"active": 0, "dormant": 1, "empty": 2, "config": 3, "unknown": 4}
    sorted_audits = sorted(
        audits,
        key=lambda a: (order.get(a.get("classification", "unknown"), 4), a["table"])
    )

    for a in sorted_audits:
        if not a.get("exists"):
            lines += [f"## ~~{a['table']}~~ — NOT IN DB", ""]
            continue

        cls = a.get("classification", "unknown")
        badge = {
            "active":  "🟢 ACTIVE",
            "dormant": "🟡 DORMANT",
            "empty":   "🔴 EMPTY",
            "config":  "⚪ CONFIG",
        }.get(cls, "⬜ UNKNOWN")

        rc = a.get("row_count", 0)
        age = a.get("age_hours")
        age_s = f"{age}h ago" if age is not None else "no data"
        col_count = a.get("col_count", 0)
        idx_count = a.get("index_count", 0)
        ts_col = a.get("ts_col", "none")

        lines += [
            f"## `{a['table']}`  {badge}",
            "",
            f"**Purpose:** {a.get('purpose', 'Unknown')}",
            "",
        ]

        tabs = a.get("dashboard_tabs", [])
        if tabs:
            lines.append(f"**Dashboard tabs:** {', '.join(tabs)}")
            lines.append("")

        metrics = a.get("key_metrics", [])
        if metrics and metrics != ["N/A — config"]:
            lines.append(f"**Key metrics:** {', '.join(metrics)}")
            lines.append("")

        lines += [
            f"| Property | Value |",
            f"|---|---|",
            f"| rows | {rc:,} |",
            f"| last write | {age_s} |",
            f"| columns | {col_count} |",
            f"| indexes | {idx_count} |",
            f"| timestamp col | `{ts_col}` |",
            f"| has tenant_id | {'✓' if a.get('has_tenant_id') else '✗'} |",
            f"| in knowledge base | {'✓' if a.get('in_knowledge_base') else '✗ — add to TABLE_KNOWLEDGE'} |",
            "",
        ]

        missing = a.get("missing_expected", [])
        if missing:
            lines.append(f"**Missing expected columns:** `{'`, `'.join(missing)}`")
            lines.append("")

        enhancements = a.get("enhancements", [])
        if enhancements:
            lines.append("**Suggested enhancements:**")
            lines.append("")
            for e in enhancements:
                lines.append(f"- {e}")
            lines.append("")
        else:
            lines.append("_No enhancements suggested — looks complete._")
            lines.append("")

        lines.append("---")
        lines.append("")

    return "\n".join(lines)


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="agentsam_* full audit")
    parser.add_argument("--env",         default=None, help="Path to .cloudflare.env")
    parser.add_argument("--token",       default=None)
    parser.add_argument("--account",     default=None)
    parser.add_argument("--db",          default=None)
    parser.add_argument("--out",         default=".", help="Output directory")
    parser.add_argument("--concurrency", type=int, default=4,
                        help="Parallel table queries (default 4, max 8)")
    args = parser.parse_args()

    token, account_id, db_id = resolve_creds(
        args.env, args.token, args.account, args.db
    )

    print(f"D1 database : {db_id}")
    client = D1Client(token, account_id, db_id)

    probe = client.rows("SELECT 1 AS ok")
    if not probe:
        print("ERROR: D1 connection failed.", file=sys.stderr)
        sys.exit(1)
    print("Connection  : OK")

    print("Discovering agentsam_* tables...")
    tables = get_all_agentsam_tables(client)
    print(f"Found       : {len(tables)} agentsam_* tables")

    kb_tables = set(TABLE_KNOWLEDGE.keys())
    db_tables  = set(tables)
    in_kb_not_db = kb_tables - db_tables
    in_db_not_kb = db_tables - kb_tables
    if in_kb_not_db:
        print(f"In knowledge base but not in DB  : {sorted(in_kb_not_db)}")
    if in_db_not_kb:
        print(f"In DB but not in knowledge base  : {sorted(in_db_not_kb)}")

    print(f"\nAuditing {len(tables)} tables (concurrency={min(args.concurrency, 8)})...")
    audits: list[dict] = []
    lock = threading.Lock()
    done = [0]

    def audit_one(table):
        result = audit_table(client, table)
        with lock:
            done[0] += 1
            pct = int(done[0] / len(tables) * 40)
            bar = "█" * pct + "░" * (40 - pct)
            print(f"  [{bar}] {done[0]}/{len(tables)}  {table:<50}", end="\r", flush=True)
        return result

    with ThreadPoolExecutor(max_workers=min(args.concurrency, 8)) as ex:
        futures = {ex.submit(audit_one, t): t for t in tables}
        for f in as_completed(futures):
            audits.append(f.result())

    # Add knowledge-base tables that weren't found in DB
    for t in sorted(in_kb_not_db):
        audits.append({"table": t, "exists": False})

    audits.sort(key=lambda a: a["table"])
    print()  # newline after progress bar

    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    # JSON
    json_path = out_dir / f"agentsam_audit_{ts}.json"
    json_path.write_text(json.dumps(audits, indent=2))
    print(f"\nJSON   : {json_path}")

    # TXT summary
    txt_path = out_dir / f"agentsam_audit_{ts}.txt"
    txt_path.write_text(render_txt(audits, ts))
    print(f"TXT    : {txt_path}")

    # Cursor-ready suggestions MD
    md_path = out_dir / f"agentsam_SUGGESTIONS_{ts}.md"
    md_path.write_text(render_suggestions_md(audits, ts))
    print(f"MD     : {md_path}")

    # Console summary
    from collections import Counter
    cls_counts = Counter(
        a.get("classification", "missing" if not a.get("exists") else "unknown")
        for a in audits
    )
    print(f"\n{'─'*50}")
    print(f"  🟢 active  : {cls_counts['active']}")
    print(f"  🟡 dormant : {cls_counts['dormant']}")
    print(f"  🔴 empty   : {cls_counts['empty']}")
    print(f"  ⚪ config  : {cls_counts['config']}")
    print(f"  ⬛ missing : {cls_counts['missing']}")
    print(f"{'─'*50}")
    print("Done.")


if __name__ == "__main__":
    main()
