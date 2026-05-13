# Analytics UI Audit
Generated: 2026-05-13T21:14:34 UTC

## Legend
🟢 LIVE (<1h)  🟡 FRESH (<24h)  🟠 WEEK (<7d)  🔴 STALE (>7d)  ⚪ EMPTY  ❌ MISSING  🔵 NO_TS

---

## OVERVIEW — `/dashboard/analytics/overview`

**2 data-ready** | **4 stale** | **0 empty/missing**

| Status | Priority | Table | Rows | Freshness | Widget |
|--------|----------|-------|------|-----------|--------|
| 🟠 WEEK | P0 | `agentsam_workflow_runs` | 154 | 38.1h ago | KPI card — runs today/week + status breakdown |
| 🟠 WEEK | P0 | `agentsam_agent_run` | 412 | 24.3h ago | KPI card — success rate + avg latency |
| 🟠 WEEK | P0 | `agentsam_error_log` | 49 | 28.2h ago | Alert strip — open errors by severity |
| 🔵 NO_TS | P0 | `agentsam_usage_rollups_daily` | 34 | — | Line chart — daily token spend + cost over 30d |
| 🔴 STALE | P0 | `agentsam_usage_events` | 448 | 519.5h ago | Sparkline — hourly activity heatmap |
| 🟢 LIVE | P1 | `agentsam_cron_runs` | 3,125 | 0.2h ago | Heatmap calendar — cron success/fail per day |
| 🔵 NO_TS | P1 | `agentsam_deployment_health` | 98 | — | Status badge grid — per-worker health |
| 🔵 NO_TS | P1 | `agentsam_tool_stats_compacted` | 84 | — | Horizontal bar — top 10 tools by call count |
| 🔵 NO_TS | P1 | `agentsam_execution_performance_metrics` | 305 | — | Histogram — p50/p95 latency distribution |
| 🟢 LIVE | P2 | `agentsam_webhook_events` | 1,226 | 0.0h ago | Counter + recent list — webhook volume |
| 🔵 NO_TS | P2 | `agentsam_analytics` | 25 | — | Summary row — workspace-level rolled stats |

**Ship these first** (P0, has data):
- `agentsam_workflow_runs` (154 rows) → KPI card — runs today/week + status breakdown
- `agentsam_usage_rollups_daily` (34 rows) → Line chart — daily token spend + cost over 30d
- `agentsam_agent_run` (412 rows) → KPI card — success rate + avg latency
- `agentsam_error_log` (49 rows) → Alert strip — open errors by severity

## AGENT — `/dashboard/analytics/agent`

**2 data-ready** | **7 stale** | **1 empty/missing**

| Status | Priority | Table | Rows | Freshness | Widget |
|--------|----------|-------|------|-----------|--------|
| 🟠 WEEK | P0 | `agentsam_workflow_runs` | 154 | 38.1h ago | Run timeline — status, model, duration per run |
| 🟠 WEEK | P0 | `agentsam_execution_steps` | 625 | 38.1h ago | Waterfall chart — step latency breakdown |
| 🟠 WEEK | P0 | `agentsam_executions` | 146 | 24.3h ago | Table — execution list with status + cost |
| 🟠 WEEK | P0 | `agentsam_command_run` | 181 | 24.3h ago | Table — CLI commands triggered per run |
| ⚪ EMPTY | P0 | `agentsam_approval_queue` | 0 | — | Alert list — pending approvals |
| 🟠 WEEK | P1 | `agentsam_execution_dependency_graph` | 7 | 109.5h ago | DAG viz — node dependency map |
| 🟠 WEEK | P1 | `agentsam_execution_context` | 79 | 67.9h ago | JSON inspector — context per execution |
| 🔵 NO_TS | P1 | `agentsam_execution_performance_metrics` | 305 | — | Scatter — cost vs latency per run |
| 🟡 FRESH | P2 | `agentsam_plans` | 28 | 17.1h ago | Card list — active plans + completion % |
| 🟡 FRESH | P2 | `agentsam_plan_tasks` | 156 | 17.1h ago | Kanban strip — tasks by status |
| 🟠 WEEK | P2 | `agentsam_escalation` | 22 | 24.3h ago | Timeline — escalation events |

**Ship these first** (P0, has data):
- `agentsam_workflow_runs` (154 rows) → Run timeline — status, model, duration per run
- `agentsam_execution_steps` (625 rows) → Waterfall chart — step latency breakdown
- `agentsam_executions` (146 rows) → Table — execution list with status + cost
- `agentsam_command_run` (181 rows) → Table — CLI commands triggered per run

**P0 gaps** (no data yet — need writes wired):
- `agentsam_approval_queue` → Alert list — pending approvals

## MODELS — `/dashboard/analytics/models`

**3 data-ready** | **3 stale** | **0 empty/missing**

| Status | Priority | Table | Rows | Freshness | Widget |
|--------|----------|-------|------|-----------|--------|
| 🟢 LIVE | P0 | `agentsam_routing_arms` | 134 | 0.2h ago | Leaderboard — model key, score, executions |
| 🟢 LIVE | P0 | `agentsam_model_catalog` | 27 | 0.5h ago | Table — all models, active/degraded, cost |
| 🟠 WEEK | P0 | `agentsam_model_routing_memory` | 15 | 25.2h ago | Heat table — model × route success matrix |
| 🔵 NO_TS | P0 | `agentsam_model_drift_signals` | 3 | — | Alert cards — drift detected per model |
| 🟢 LIVE | P1 | `agentsam_model_tier` | 5 | 0.1h ago | Tier ladder viz — tier 0→4 with active model |
| 🟠 WEEK | P1 | `agentsam_agent_run` | 412 | 24.3h ago | Bar chart — runs per model, success rate |
| 🔴 STALE | P1 | `agentsam_usage_events` | 448 | 519.5h ago | Cost breakdown — spend by model over 7d |
| 🔵 NO_TS | P2 | `agentsam_prompt_cache_keys` | 8 | — | Cache hit rate gauge per model |

**Ship these first** (P0, has data):
- `agentsam_routing_arms` (134 rows) → Leaderboard — model key, score, executions
- `agentsam_model_catalog` (27 rows) → Table — all models, active/degraded, cost
- `agentsam_model_drift_signals` (3 rows) → Alert cards — drift detected per model
- `agentsam_model_routing_memory` (15 rows) → Heat table — model × route success matrix

## WORKERS — `/dashboard/analytics/workers`

**3 data-ready** | **2 stale** | **0 empty/missing**

| Status | Priority | Table | Rows | Freshness | Widget |
|--------|----------|-------|------|-----------|--------|
| 🟢 LIVE | P0 | `agentsam_cron_runs` | 3,125 | 0.2h ago | Heatmap — cron success/fail × time of day |
| 🟢 LIVE | P0 | `agentsam_webhook_events` | 1,226 | 0.0h ago | Volume chart + recent event list |
| 🔵 NO_TS | P0 | `agentsam_deployment_health` | 98 | — | Status grid — worker × deploy health badge |
| 🟡 FRESH | P1 | `agentsam_hook_execution` | 36 | 18.4h ago | Timeline — hook execution history |
| 🟠 WEEK | P1 | `agentsam_hook` | 21 | 30.9h ago | Table — registered hooks + last fired |
| 🟠 WEEK | P1 | `agentsam_error_log` | 49 | 28.2h ago | Error rate chart — errors/hour by worker |
| 🔵 NO_TS | P1 | `agentsam_analytics` | 25 | — | KPI strip — requests, errors, avg response |
| 🔵 NO_TS | P1 | `agentsam_health_daily` | 3 | — | Line chart — daily health score over 30d |

**Ship these first** (P0, has data):
- `agentsam_deployment_health` (98 rows) → Status grid — worker × deploy health badge
- `agentsam_cron_runs` (3,125 rows) → Heatmap — cron success/fail × time of day
- `agentsam_webhook_events` (1,226 rows) → Volume chart + recent event list

## MCP — `/dashboard/analytics/mcp`

**0 data-ready** | **6 stale** | **0 empty/missing**

| Status | Priority | Table | Rows | Freshness | Widget |
|--------|----------|-------|------|-----------|--------|
| 🟠 WEEK | P0 | `agentsam_mcp_tool_execution` | 36 | 30.7h ago | Leaderboard — tool, calls, avg ms, fail rate |
| 🟠 WEEK | P0 | `agentsam_tool_call_log` | 35 | 30.7h ago | Live feed — recent tool calls + status |
| 🔵 NO_TS | P0 | `agentsam_tool_stats_compacted` | 84 | — | Bar chart — top tools by call volume |
| 🔵 NO_TS | P1 | `agentsam_tool_chain` | 44 | — | Chain viz — tool sequence per session |
| 🔴 STALE | P1 | `agentsam_mcp_tools` | 393 | 183.8h ago | Catalog table — all tools, health, latency |
| 🔴 STALE | P1 | `agentsam_mcp_servers` | 3 | 215.4h ago | Server health cards — URL, status, last ping |
| 🟠 WEEK | P2 | `mcp_audit_log` | 566 | 27.0h ago | Audit feed — tool calls with actor + result |
| 🔴 STALE | P2 | `agentsam_mcp_allowlist` | 412 | 183.2h ago | Permission matrix — workspace × tool |

**Ship these first** (P0, has data):
- `agentsam_mcp_tool_execution` (36 rows) → Leaderboard — tool, calls, avg ms, fail rate
- `agentsam_tool_call_log` (35 rows) → Live feed — recent tool calls + status
- `agentsam_tool_stats_compacted` (84 rows) → Bar chart — top tools by call volume

## ADVISORS — `/dashboard/analytics/advisors`

**0 data-ready** | **4 stale** | **1 empty/missing**

| Status | Priority | Table | Rows | Freshness | Widget |
|--------|----------|-------|------|-----------|--------|
| 🟠 WEEK | P0 | `agentsam_error_log` | 49 | 28.2h ago | Severity cards — open issues grouped by type |
| 🔴 STALE | P0 | `agentsam_guardrails` | 13 | 168.2h ago | Policy table — rules, enabled/disabled |
| ⚪ EMPTY | P0 | `agentsam_guardrail_events` | 0 | — | Event stream — guardrail triggers + severity |
| 🟠 WEEK | P1 | `agentsam_escalation` | 22 | 24.3h ago | Open escalations — unresolved by age |
| 🔵 NO_TS | P1 | `agentsam_deployment_health` | 98 | — | Drift detector — git hash mismatch per worker |
| 🔵 NO_TS | P1 | `agentsam_model_drift_signals` | 3 | — | Quality drift — models degrading over time |
| 🟠 WEEK | P2 | `agentsam_memory` | 123 | 141.1h ago | Memory inspector — recall count, decay score |

**Ship these first** (P0, has data):
- `agentsam_error_log` (49 rows) → Severity cards — open issues grouped by type

**P0 gaps** (no data yet — need writes wired):
- `agentsam_guardrail_events` → Event stream — guardrail triggers + severity

---

## SUPABASE — semantic/analytics layer

| Table | Rows | Purpose |
|-------|------|---------|
| `agentsam_routing_decisions` | 17 | Routing decisions log — model choice audit trail |
| `agentsam_eval_runs` | 121 | Eval results — quality scores per model/run |
| `agentsam_error_events` | 18 | Error events — structured error stream |
| `agentsam_stream_events` | 17 | SSE stream events — token-level telemetry |
| `build_deploy_events` | 77 | Deploy events — CI/CD history |
| `codebase_snapshots` | 3 | Codebase index — for advisor insights |
| `agent_memory` | 121 | Embedded memory — semantic recall layer |

---

## Global Summary

**🟢 LIVE** (7 tables): `agentsam_cron_runs`, `agentsam_webhook_events`, `agentsam_routing_arms`, `agentsam_model_catalog`, `agentsam_model_tier`, `agentsam_cron_runs`, `agentsam_webhook_events`
**🟡 FRESH** (3 tables): `agentsam_plans`, `agentsam_plan_tasks`, `agentsam_hook_execution`
**🟠 WEEK** (20 tables): `agentsam_workflow_runs`, `agentsam_agent_run`, `agentsam_error_log`, `agentsam_workflow_runs`, `agentsam_execution_steps`, `agentsam_executions`, `agentsam_command_run`, `agentsam_execution_dependency_graph` + 12 more
**🔵 NO_TS** (15 tables): `agentsam_usage_rollups_daily`, `agentsam_deployment_health`, `agentsam_tool_stats_compacted`, `agentsam_execution_performance_metrics`, `agentsam_analytics`, `agentsam_execution_performance_metrics`, `agentsam_model_drift_signals`, `agentsam_prompt_cache_keys` + 7 more
**🔴 STALE** (6 tables): `agentsam_usage_events`, `agentsam_usage_events`, `agentsam_mcp_tools`, `agentsam_mcp_allowlist`, `agentsam_mcp_servers`, `agentsam_guardrails`
**⚪ EMPTY** (2 tables): `agentsam_approval_queue`, `agentsam_guardrail_events`

---
*Run `scripts/analytics_ui_audit.py` to refresh.*