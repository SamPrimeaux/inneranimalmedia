# agentsam_* Table Enhancement Suggestions
> Generated: 20260508T061622Z  
> Tables audited: 83

Use this file in Cursor: each section = one table, one PR/task.
Priority order: ACTIVE tables first, then EMPTY capability tables.

## `agentsam_artifacts`  🟢 ACTIVE

**Purpose:** Captured artifacts (code, files, outputs) from agent runs.

**Dashboard tabs:** analytics/agent (drilldown)

**Key metrics:** artifact count, storage size

| Property | Value |
|---|---|
| rows | 3 |
| last write | 46.3h ago |
| columns | 15 |
| indexes | 1 |
| timestamp col | `created_at` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Missing expected columns:** `run_id`, `size_bytes`

**Suggested enhancements:**

- ADD INDEX on (run_id) — always joined from agent_run drilldown
- ADD INDEX on (tenant_id, artifact_type, created_at DESC)
- SURFACE as artifact list in Agent run drilldown drawer

---

## `agentsam_bootstrap`  🟢 ACTIVE

**Purpose:** Bootstrap/seed data tracking. Records initial setup state.

**Dashboard tabs:** N/A — internal

**Key metrics:** N/A

| Property | Value |
|---|---|
| rows | 12 |
| last write | 48.8h ago |
| columns | 43 |
| indexes | 8 |
| timestamp col | `created_at` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Missing expected columns:** `key`, `completed_at`, `version`

**Suggested enhancements:**

- ENSURE bootstrap steps are idempotent — add UNIQUE on key
- ADD version INTEGER to track re-bootstrap after migrations

---

## `agentsam_command_run`  🟢 ACTIVE

**Purpose:** Individual command execution record within an agent run. Feeds execution performance metrics.

**Dashboard tabs:** analytics/agent

**Key metrics:** command success rate, latency by command, failure breakdown

| Property | Value |
|---|---|
| rows | 76 |
| last write | 3.1h ago |
| columns | 28 |
| indexes | 5 |
| timestamp col | `created_at` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Missing expected columns:** `command_id`, `command_slug`, `status`, `started_at`, `model_key`

**Suggested enhancements:**

- ADD INDEX on (command_slug, started_at DESC) for per-command leaderboard
- ENSURE FK to agentsam_commands(id) has ON DELETE SET NULL not CASCADE
- VALIDATE command_slug is never NULL — needed for GROUP BY in analytics
- SOURCE for agentsam_execution_performance_metrics compaction job

---

## `agentsam_cron_runs`  🟢 ACTIVE

**Purpose:** Cron job execution records. CRITICAL for validating all compaction jobs are running.

**Dashboard tabs:** analytics/overview (data health strip)

**Key metrics:** last run per job, failure count, missed runs

| Property | Value |
|---|---|
| rows | 499 |
| last write | 0.3h ago |
| columns | 14 |
| indexes | 5 |
| timestamp col | `created_at` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Missing expected columns:** `cron_key`

**Suggested enhancements:**

- ADD INDEX on (cron_key, started_at DESC)
- SURFACE in Overview 'Data Health' strip — show last run time per compaction job
- ADD expected_interval_seconds to detect missed runs automatically
- CRITICAL: verify agentsam_execution_performance_metrics, usage_rollups_daily, tool_stats_compacted, health_daily all have cron_key entries here

---

## `agentsam_error_log`  🟢 ACTIVE

**Purpose:** Runtime error records. Primary source for error monitoring tab.

**Dashboard tabs:** analytics/errors, analytics/overview (health strip)

**Key metrics:** error count, error rate, top error types

| Property | Value |
|---|---|
| rows | 4 |
| last write | 4.5h ago |
| columns | 13 |
| indexes | 4 |
| timestamp col | `created_at` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Missing expected columns:** `message`, `severity`, `source_table`

**Suggested enhancements:**

- ADD INDEX on (tenant_id, severity, created_at DESC)
- ADD INDEX on (error_type, created_at DESC) for error leaderboard
- ADD TTL cleanup job: archive rows older than 90d to R2
- SURFACE as 'Error Inbox' widget in Overview + dedicated Errors tab
- ADD resolved_at INTEGER + resolved_by TEXT for error triage workflow

---

## `agentsam_eval_runs`  🟢 ACTIVE

**Purpose:** Execution records for eval suites. Primary Evals tab data source.

**Dashboard tabs:** analytics/evals

**Key metrics:** pass rate, regression count, eval run frequency

| Property | Value |
|---|---|
| rows | 12 |
| last write | 109.1h ago |
| columns | 29 |
| indexes | 1 |
| timestamp col | `run_at` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Missing expected columns:** `status`, `pass_count`, `fail_count`, `created_at`

**Suggested enhancements:**

- ADD INDEX on (suite_id, created_at DESC)
- ADD INDEX on (tenant_id, created_at DESC)
- SURFACE pass rate trend as line chart in Evals tab
- SURFACE failing cases as drilldown table

---

## `agentsam_memory`  🟢 ACTIVE

**Purpose:** Persisted agent memory entries. Used for context injection in subsequent turns.

**Dashboard tabs:** settings/agents

**Key metrics:** memory entry count, memory freshness

| Property | Value |
|---|---|
| rows | 116 |
| last write | 2.8h ago |
| columns | 19 |
| indexes | 7 |
| timestamp col | `created_at` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Missing expected columns:** `memory_text`, `embedding_key`

**Suggested enhancements:**

- ADD TTL/cleanup job: memory older than 90d should be archived or pruned
- ADD INDEX on (user_id, created_at DESC)
- PAIR with Supabase pgvector for semantic memory retrieval

---

## `agentsam_model_routing_memory`  🟢 ACTIVE

**Purpose:** Persisted Thompson Sampling state per routing arm. Feeds routing_arms selection.

**Dashboard tabs:** analytics/models (advanced)

**Key metrics:** arm win rates, exploration vs exploitation ratio

| Property | Value |
|---|---|
| rows | 23 |
| last write | 3.8h ago |
| columns | 24 |
| indexes | 5 |
| timestamp col | `created_at` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Missing expected columns:** `routing_arm_id`, `alpha`, `beta`, `last_updated_at`

**Suggested enhancements:**

- ADD INDEX on (routing_arm_id)
- SURFACE as 'Routing Arm Performance' table in Models tab
- ADD last_updated_at if missing — stale memory = stale routing

---

## `agentsam_plan_tasks`  🟢 ACTIVE

**Purpose:** Individual tasks within a plan. Granular task-level success tracking.

**Dashboard tabs:** analytics/agent (drilldown)

**Key metrics:** task completion rate, most-failing task types

| Property | Value |
|---|---|
| rows | 97 |
| last write | 20.4h ago |
| columns | 38 |
| indexes | 11 |
| timestamp col | `created_at` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Missing expected columns:** `task_type`

**Suggested enhancements:**

- ADD INDEX on (plan_id) — always joined from plans
- ADD INDEX on (task_type, status) for failure categorization
- SURFACE as task completion breakdown in Agent run drilldown drawer

---

## `agentsam_plans`  🟢 ACTIVE

**Purpose:** Agent-generated execution plans. Parent of plan_tasks.

**Dashboard tabs:** analytics/agent

**Key metrics:** plans generated, plan completion rate

| Property | Value |
|---|---|
| rows | 15 |
| last write | 20.4h ago |
| columns | 36 |
| indexes | 4 |
| timestamp col | `created_at` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Missing expected columns:** `agent_run_id`

**Suggested enhancements:**

- ADD INDEX on (agent_run_id) — always joined from agent_run
- ADD INDEX on (tenant_id, status, created_at DESC)
- SURFACE plan completion rate as KPI in Agent tab

---

## `agentsam_plans_old`  🟢 ACTIVE

**Purpose:** Unknown — not in knowledge base

| Property | Value |
|---|---|
| rows | 15 |
| last write | 20.4h ago |
| columns | 36 |
| indexes | 9 |
| timestamp col | `created_at` |
| has tenant_id | ✓ |
| in knowledge base | ✗ — add to TABLE_KNOWLEDGE |

_No enhancements suggested — looks complete._

---

## `agentsam_tool_call_log`  🟢 ACTIVE

**Purpose:** Richer per-call log including non-MCP tools. Supplement to mcp_tool_execution for cost/latency drilldowns.

**Dashboard tabs:** analytics/mcp, analytics/agent

**Key metrics:** tool latency histogram, cost per tool, failure modes

| Property | Value |
|---|---|
| rows | 18 |
| last write | 37.7h ago |
| columns | 25 |
| indexes | 5 |
| timestamp col | `created_at` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Suggested enhancements:**

- ENSURE tool_category column exists to allow filter: tool_category='mcp'
- ADD INDEX on (tool_category, created_at DESC)
- ADD INDEX on (tool_name, status, created_at DESC) for leaderboard
- VALIDATE all writes include tenant_id — orphaned rows break multi-tenant KPIs
- CONSIDER adding retry_count INTEGER DEFAULT 0 for retry-storm detection

---

## `agentsam_tool_chain`  🟢 ACTIVE

**Purpose:** Ordered sequence of tool calls within a single agent turn/chain. Backbone for dependency graph.

**Dashboard tabs:** analytics/agent, analytics/workflow

**Key metrics:** chain length, step failure position, bottleneck tool

| Property | Value |
|---|---|
| rows | 19 |
| last write | 49.4h ago |
| columns | 41 |
| indexes | 10 |
| timestamp col | `started_at` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Missing expected columns:** `run_id`, `step_order`, `status`

**Suggested enhancements:**

- ADD INDEX on (run_id) — join key from execution_dependency_graph
- ENSURE step_order is always populated to enable chain replay
- CONSIDER adding parent_chain_id for nested chain tracking
- PAIR with agentsam_execution_dependency_graph for 'where did chain block?' UI

---

## `agentsam_tool_stats_compacted`  🟢 ACTIVE

**Purpose:** Pre-aggregated tool performance rollups. Feeds fast dashboard KPIs without hitting raw logs.

**Dashboard tabs:** analytics/mcp, analytics/agent

**Key metrics:** p95 latency, success rate trend, cost rollup

| Property | Value |
|---|---|
| rows | 81 |
| last write | 5.3h ago |
| columns | 18 |
| indexes | 5 |
| timestamp col | `compacted_at` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Missing expected columns:** `metric_date`

**Suggested enhancements:**

- ENSURE compaction job runs on a cron (agentsam_cron_runs) — check last_run freshness
- ADD UNIQUE constraint on (tool_name, metric_date, metric_grain) to prevent double-writes
- CONSIDER adding tenant_id to support per-workspace rollups
- SURFACE directly in MCP/Agent tab: eliminates expensive COUNT(*) on raw logs

---

## `agentsam_tools`  🟢 ACTIVE

**Purpose:** Unknown — not in knowledge base

| Property | Value |
|---|---|
| rows | 40 |
| last write | 166.5h ago |
| columns | 35 |
| indexes | 2 |
| timestamp col | `created_at` |
| has tenant_id | ✗ |
| in knowledge base | ✗ — add to TABLE_KNOWLEDGE |

**Suggested enhancements:**

- CONSIDER adding tenant_id for multi-tenant scoping

---

## `agentsam_workspace_state`  🟢 ACTIVE

**Purpose:** Live workspace state (active session count, last activity). Runtime.

**Dashboard tabs:** analytics/overview

**Key metrics:** active workspaces, last activity

| Property | Value |
|---|---|
| rows | 5 |
| last write | 37.4h ago |
| columns | 18 |
| indexes | 4 |
| timestamp col | `created_at` |
| has tenant_id | ✗ |
| in knowledge base | ✓ |

**Missing expected columns:** `last_active_at`, `active_sessions`

**Suggested enhancements:**

- SURFACE last_active_at in overview as 'Last Activity' KPI
- ADD upsert pattern on writes — this should have exactly one row per workspace

---

## `agentsam_agent_run`  🟡 DORMANT

**Purpose:** Top-level record of a single agent session/turn. Parent of tool_chain, tool_call_log.

**Dashboard tabs:** analytics/agent, analytics/overview

**Key metrics:** run count, success rate, avg duration, runs by user

| Property | Value |
|---|---|
| rows | 312 |
| last write | no data |
| columns | 27 |
| indexes | 6 |
| timestamp col | `created_at` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Missing expected columns:** `total_cost_usd`, `model_key`

**Suggested enhancements:**

- ADD INDEX on (tenant_id, started_at DESC) — primary time-range filter
- ADD INDEX on (status, started_at DESC) for failure-rate queries
- ENSURE completed_at is set on all terminal states (success/failure/timeout)
- DERIVE duration_ms = (completed_at - started_at)*1000 in query or add computed col
- CONSIDER trigger to auto-write to agentsam_usage_events on completion

---

## `agentsam_analytics`  🟡 DORMANT

**Purpose:** General analytics events table. Purpose may overlap with usage_events — needs audit.

**Dashboard tabs:** analytics/overview

**Key metrics:** TBD — depends on schema

| Property | Value |
|---|---|
| rows | 3 |
| last write | no data |
| columns | 50 |
| indexes | 6 |
| timestamp col | `None` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Missing expected columns:** `event_type`, `created_at`, `payload_json`

**Suggested enhancements:**

- AUDIT: clarify distinction from agentsam_usage_events
- If redundant, consolidate writes into usage_events and deprecate this table
- If distinct (e.g. UI events), document event_type taxonomy and add INDEX on (event_type, created_at)

---

## `agentsam_approval_queue`  🟡 DORMANT

**Purpose:** Pending approval items for requires_approval=1 MCP tools.

**Dashboard tabs:** analytics/overview (badge), settings/tools

**Key metrics:** pending count, avg wait time

| Property | Value |
|---|---|
| rows | 2 |
| last write | 193.8h ago |
| columns | 23 |
| indexes | 8 |
| timestamp col | `created_at` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Missing expected columns:** `approved_at`

**Suggested enhancements:**

- ADD INDEX on (tenant_id, status, created_at DESC)
- SURFACE as badge count in sidebar nav and Overview KPI row
- ADD expired_at to auto-expire stale approvals

---

## `agentsam_cad_jobs`  🟡 DORMANT

**Purpose:** CAD/conversion job records.

**Dashboard tabs:** analytics/storage (if applicable)

**Key metrics:** N/A — likely domain specific

| Property | Value |
|---|---|
| rows | 2 |
| last write | 193.8h ago |
| columns | 13 |
| indexes | 1 |
| timestamp col | `created_at` |
| has tenant_id | ✗ |
| in knowledge base | ✓ |

**Suggested enhancements:**

- AUDIT: determine if this is IAM-specific or a leftover from client work

---

## `agentsam_code_index_job`  🟡 DORMANT

**Purpose:** Codebase indexing job tracker. Feeds Supabase codebase_* tables.

**Dashboard tabs:** analytics/codebase

**Key metrics:** last index run, files indexed, index freshness

| Property | Value |
|---|---|
| rows | 8 |
| last write | no data |
| columns | 25 |
| indexes | 2 |
| timestamp col | `started_at` |
| has tenant_id | ✗ |
| in knowledge base | ✓ |

**Missing expected columns:** `files_processed`

**Suggested enhancements:**

- SURFACE last run + file count in analytics/codebase tab header
- ADD error_message TEXT for failed job diagnostics

---

## `agentsam_deployment_health`  🟡 DORMANT

**Purpose:** Per-deploy health snapshot. Feeds Deploys tab KPIs.

**Dashboard tabs:** analytics/deploys

**Key metrics:** deploy success rate, last deploy age, failure count

| Property | Value |
|---|---|
| rows | 12 |
| last write | no data |
| columns | 14 |
| indexes | 4 |
| timestamp col | `None` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Missing expected columns:** `health_score`, `created_at`

**Suggested enhancements:**

- JOIN to deployments table for full deploy context
- ADD INDEX on (tenant_id, created_at DESC)
- SURFACE as health sparkline per deployment in Deploys tab

---

## `agentsam_execution_performance_metrics`  🟡 DORMANT

**Purpose:** Pre-aggregated observability cube. PRIMARY KPI source for all performance charts.

**Dashboard tabs:** analytics/overview, analytics/agent, analytics/mcp, analytics/models, analytics/workflow

**Key metrics:** p95 latency, success rate, cost rollup, token volume, failure rate by tool/command/model

| Property | Value |
|---|---|
| rows | 34 |
| last write | no data |
| columns | 54 |
| indexes | 10 |
| timestamp col | `None` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Suggested enhancements:**

- CRITICAL: schedule compaction job (cron) to populate this daily — verify via agentsam_cron_runs
- ADD INDEX on (tenant_id, metric_date DESC, source_table) — primary query pattern
- ADD INDEX on (model_key, metric_date DESC) for Models tab
- ADD INDEX on (tool_name, metric_date DESC) for MCP/Tools tab
- ENSURE UNIQUE constraint enforced to prevent double-compaction
- VERIFY node_key column (added late) is included in all insert paths
- USE as primary source for /api/analytics/* — avoid raw log queries where possible

---

## `agentsam_executions`  🟡 DORMANT

**Purpose:** Execution lifecycle events. May overlap with agent_run — confirm which is canonical.

**Dashboard tabs:** analytics/agent

**Key metrics:** execution count, status distribution

| Property | Value |
|---|---|
| rows | 12 |
| last write | 916.4h ago |
| columns | 31 |
| indexes | 5 |
| timestamp col | `created_at` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Suggested enhancements:**

- AUDIT: if agentsam_agent_run and agentsam_executions overlap, designate one as canonical
- CONSIDER deprecating if agentsam_agent_run serves the same role
- If distinct: document in code what makes an 'execution' vs 'agent run'

---

## `agentsam_health_daily`  🟡 DORMANT

**Purpose:** Daily health snapshot rollup. Feeds health strip on overview/analytics.

**Dashboard tabs:** analytics/overview

**Key metrics:** system health score, error rate trend, uptime

| Property | Value |
|---|---|
| rows | 3 |
| last write | no data |
| columns | 18 |
| indexes | 3 |
| timestamp col | `None` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Missing expected columns:** `metric_date`, `health_score`, `error_count`, `success_count`, `warning_count`

**Suggested enhancements:**

- ADD UNIQUE on (metric_date, tenant_id) to prevent double-writes
- ENSURE daily cron writes this row even if all metrics are zero (gap detection)
- SURFACE as small health trend sparkline on Overview KPI row

---

## `agentsam_hook_execution`  🟡 DORMANT

**Purpose:** Execution records for hook firings. Needed for hook reliability monitoring.

**Dashboard tabs:** settings/hooks, analytics/errors

**Key metrics:** hook success rate, top failing hooks

| Property | Value |
|---|---|
| rows | 78 |
| last write | no data |
| columns | 25 |
| indexes | 9 |
| timestamp col | `created_at` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Missing expected columns:** `http_status_code`

**Suggested enhancements:**

- ADD INDEX on (hook_id, created_at DESC)
- ADD INDEX on (status, created_at DESC) for failure monitoring
- SURFACE hook success rate in settings/hooks as reliability badge

---

## `agentsam_mcp_tool_execution`  🟡 DORMANT

**Purpose:** Canonical record of every MCP tool call made by AgentSam. Primary source for MCP KPIs.

**Dashboard tabs:** analytics/mcp, analytics/overview

**Key metrics:** call count, success rate, latency p95, top tools by volume/error

| Property | Value |
|---|---|
| rows | 17 |
| last write | no data |
| columns | 25 |
| indexes | 4 |
| timestamp col | `created_at` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Missing expected columns:** `status`

**Suggested enhancements:**

- ADD INDEX on (tenant_id, created_at DESC) if missing — primary time-range filter
- ADD INDEX on (tool_name, status) for leaderboard queries
- ENSURE status uses enum: success|failure|timeout|blocked|skipped
- CONSIDER adding error_code TEXT for bucketed failure analysis
- CONSIDER adding session_id to correlate with agentsam_agent_run

---

## `agentsam_mcp_workflows`  🟡 DORMANT

**Purpose:** Unknown — not in knowledge base

| Property | Value |
|---|---|
| rows | 52 |
| last write | no data |
| columns | 43 |
| indexes | 11 |
| timestamp col | `created_at` |
| has tenant_id | ✓ |
| in knowledge base | ✗ — add to TABLE_KNOWLEDGE |

_No enhancements suggested — looks complete._

---

## `agentsam_model_drift_signals`  🟡 DORMANT

**Purpose:** Detected model quality/behavior regressions over time.

**Dashboard tabs:** analytics/models

**Key metrics:** drift events, affected models, severity trend

| Property | Value |
|---|---|
| rows | 3 |
| last write | 190.0h ago |
| columns | 20 |
| indexes | 2 |
| timestamp col | `detected_at` |
| has tenant_id | ✗ |
| in knowledge base | ✓ |

**Missing expected columns:** `signal_type`, `tenant_id`

**Suggested enhancements:**

- ADD INDEX on (model_key, detected_at DESC)
- SURFACE as 'Model Alerts' card in analytics/models tab
- CONSIDER webhook trigger when new high-severity drift detected

---

## `agentsam_todo`  🟡 DORMANT

**Purpose:** Agent-generated TODO items. May be user-facing tasks or internal agent checkpoints.

**Dashboard tabs:** overview (task widget)

**Key metrics:** open items, overdue items

| Property | Value |
|---|---|
| rows | 85 |
| last write | no data |
| columns | 40 |
| indexes | 6 |
| timestamp col | `created_at` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Missing expected columns:** `user_id`, `due_at`

**Suggested enhancements:**

- ADD INDEX on (tenant_id, status, due_at)
- SURFACE in Overview as 'Open Tasks' widget
- ADD completed_at INTEGER for completion time tracking

---

## `agentsam_usage_events`  🟡 DORMANT

**Purpose:** Canonical per-call usage+cost record. Primary source for Agent Calls KPI and spend tracking.

**Dashboard tabs:** analytics/overview, analytics/agent, analytics/costs

**Key metrics:** agent calls, total cost USD, token volume, cost by model

| Property | Value |
|---|---|
| rows | 402 |
| last write | no data |
| columns | 23 |
| indexes | 6 |
| timestamp col | `created_at` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Missing expected columns:** `input_tokens`, `output_tokens`, `total_cost_usd`

**Suggested enhancements:**

- ADD INDEX on (tenant_id, created_at DESC) — primary filter in all KPI queries
- ADD INDEX on (model_key, created_at DESC) for Models tab cost breakdown
- ADD INDEX on (provider, created_at DESC) for provider spend comparison
- REPLACE ai_usage_log and spend_ledger reads with this table in all new endpoints
- ENSURE total_cost_usd is never NULL — default 0.0 minimum
- VALIDATE input_tokens + output_tokens = total_tokens or add CHECK constraint

---

## `agentsam_usage_rollups_daily`  🟡 DORMANT

**Purpose:** Daily rollup of usage_events. Fast source for 30d/90d trend charts.

**Dashboard tabs:** analytics/overview, analytics/costs

**Key metrics:** daily spend trend, token volume by day, cost by model/day

| Property | Value |
|---|---|
| rows | 27 |
| last write | no data |
| columns | 19 |
| indexes | 1 |
| timestamp col | `None` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Missing expected columns:** `metric_date`, `model_key`, `provider`, `total_cost_usd`, `total_tokens`, `call_count`

**Suggested enhancements:**

- ENSURE daily compaction cron runs — verify via agentsam_cron_runs
- ADD UNIQUE on (metric_date, tenant_id, model_key, provider)
- USE this table (not usage_events) for 30d/90d trend charts to avoid full scans
- CONSIDER adding workspace_id dimension for per-workspace billing breakdowns

---

## `agentsam_webhook_events`  🟡 DORMANT

**Purpose:** Inbound/outbound webhook event log. Analytics surface for webhook monitoring.

**Dashboard tabs:** settings/hooks, analytics/overview

**Key metrics:** event volume, delivery success rate

| Property | Value |
|---|---|
| rows | 1,341 |
| last write | no data |
| columns | 28 |
| indexes | 1 |
| timestamp col | `None` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Missing expected columns:** `payload_size`, `created_at`

**Suggested enhancements:**

- ADD INDEX on (tenant_id, event_type, created_at DESC)
- SURFACE delivery success rate as KPI in settings/hooks

---

## `agentsam_webhook_weekly`  🟡 DORMANT

**Purpose:** Weekly rollup of webhook_events. Fast source for trend charts.

**Dashboard tabs:** analytics/overview

**Key metrics:** weekly webhook volume, weekly delivery rate

| Property | Value |
|---|---|
| rows | 1 |
| last write | no data |
| columns | 14 |
| indexes | 4 |
| timestamp col | `None` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Missing expected columns:** `total_events`, `success_count`

**Suggested enhancements:**

- ENSURE weekly compaction cron is scheduled
- ADD UNIQUE on (week_start, tenant_id)

---

## `agentsam_workflow_edges`  🟡 DORMANT

**Purpose:** Edge/transition records in workflow DAG. Needed for flow visualization.

**Dashboard tabs:** analytics/workflow (drilldown)

**Key metrics:** edge traversal count, conditional branch hit rate

| Property | Value |
|---|---|
| rows | 29 |
| last write | no data |
| columns | 10 |
| indexes | 7 |
| timestamp col | `created_at` |
| has tenant_id | ✗ |
| in knowledge base | ✓ |

**Missing expected columns:** `workflow_run_id`, `condition`, `traversed_at`

**Suggested enhancements:**

- ADD INDEX on (workflow_run_id) — always queried by run
- SURFACE as Mermaid/D3 graph in Workflow drilldown drawer
- CONSIDER adding traversal_result (satisfied/skipped/blocked) for branch analytics

---

## `agentsam_workflow_nodes`  🟡 DORMANT

**Purpose:** Node-level execution records within a workflow run. Powers step-level drilldowns.

**Dashboard tabs:** analytics/workflow (drilldown)

**Key metrics:** node success rate, avg node duration, bottleneck node

| Property | Value |
|---|---|
| rows | 22 |
| last write | no data |
| columns | 18 |
| indexes | 7 |
| timestamp col | `created_at` |
| has tenant_id | ✗ |
| in knowledge base | ✓ |

**Missing expected columns:** `workflow_run_id`, `status`, `started_at`, `duration_ms`

**Suggested enhancements:**

- ADD INDEX on (workflow_run_id) — always joined from workflow_runs
- ADD node_order INTEGER for waterfall chart ordering
- PAIR with agentsam_workflow_edges for full DAG visualization

---

## `agentsam_compaction_events`  🔴 EMPTY

**Purpose:** Log of compaction job runs. Complements cron_runs for data pipeline health.

**Dashboard tabs:** analytics/overview (data health)

**Key metrics:** last compaction time, rows compacted

| Property | Value |
|---|---|
| rows | 0 |
| last write | no data |
| columns | 16 |
| indexes | 2 |
| timestamp col | `compacted_at` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Missing expected columns:** `source_table`, `rows_written`

**Suggested enhancements:**

- ADD INDEX on (source_table, compacted_at DESC)
- SURFACE in Overview Data Health strip as pipeline status per table

---

## `agentsam_context_digest`  🔴 EMPTY

**Purpose:** Compressed context summaries for long-running sessions.

**Dashboard tabs:** analytics/agent (drilldown)

**Key metrics:** compression ratio, digest freshness

| Property | Value |
|---|---|
| rows | 0 |
| last write | no data |
| columns | 15 |
| indexes | 5 |
| timestamp col | `created_at` |
| has tenant_id | ✗ |
| in knowledge base | ✓ |

**Missing expected columns:** `run_id`, `original_token_count`, `compressed_token_count`

**Suggested enhancements:**

- SURFACE token savings metric in Agent tab as 'Context Compression' KPI
- ADD compression_ratio REAL as computed col or derive in query

---

## `agentsam_escalation`  🔴 EMPTY

**Purpose:** Escalation events (SLO breach, guardrail violation, approval required).

**Dashboard tabs:** analytics/errors

**Key metrics:** open escalations, escalation rate, avg resolution time

| Property | Value |
|---|---|
| rows | 0 |
| last write | no data |
| columns | 17 |
| indexes | 9 |
| timestamp col | `created_at` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Missing expected columns:** `escalation_type`, `severity`, `status`, `resolved_at`

**Suggested enhancements:**

- ADD INDEX on (tenant_id, status, created_at DESC)
- SURFACE unresolved escalations as badge count in sidebar nav
- ADD resolved_by TEXT for accountability tracking

---

## `agentsam_execution_dependency_graph`  🔴 EMPTY

**Purpose:** DAG of tool-chain dependencies within an execution. Powers 'why did chain block?' drilldowns.

**Dashboard tabs:** analytics/workflow (drilldown)

**Key metrics:** blocked chains, dependency depth, compensation triggers

| Property | Value |
|---|---|
| rows | 0 |
| last write | no data |
| columns | 19 |
| indexes | 9 |
| timestamp col | `created_at` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Suggested enhancements:**

- ADD INDEX on (workflow_run_id, status) for workflow drilldown queries
- ADD INDEX on (chain_id) and (depends_on_chain_id) — both are join keys
- SURFACE blocked/failed edges in Workflow tab as 'dependency failures'
- VALIDATE condition_json is valid JSON before insert (add CHECK or app-level guard)

---

## `agentsam_execution_steps`  🔴 EMPTY

**Purpose:** Step-level trace within an execution. Finest-grained latency + failure position data.

**Dashboard tabs:** analytics/agent (drilldown)

**Key metrics:** step latency, first failure step, step type distribution

| Property | Value |
|---|---|
| rows | 0 |
| last write | no data |
| columns | 20 |
| indexes | 8 |
| timestamp col | `created_at` |
| has tenant_id | ✗ |
| in knowledge base | ✓ |

**Missing expected columns:** `step_name`, `step_type`, `duration_ms`

**Suggested enhancements:**

- ADD INDEX on (execution_id) — always queried by parent execution
- ADD step_order INTEGER to enable waterfall chart rendering
- CONSIDER indexing (step_name, status) for 'most-failing step' aggregation

---

## `agentsam_guardrail_events`  🔴 EMPTY

**Purpose:** Fired guardrail violations. Runtime events from guardrail_rulesets.

**Dashboard tabs:** analytics/errors, analytics/agent

**Key metrics:** violation count, top violated rules, violation rate

| Property | Value |
|---|---|
| rows | 0 |
| last write | no data |
| columns | 28 |
| indexes | 5 |
| timestamp col | `created_at` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Missing expected columns:** `triggered_at`, `context_json`

**Suggested enhancements:**

- ADD INDEX on (guardrail_id, triggered_at DESC)
- ADD INDEX on (tenant_id, severity, triggered_at DESC)
- SURFACE in Agent tab as 'Guardrail Violations' chart (stacked by severity)
- ADD resolved BOOLEAN DEFAULT 0 for triage workflow

---

## `agentsam_prompt_cache_keys`  🔴 EMPTY

**Purpose:** Cached prompt prefix keys for Anthropic prompt caching.

**Dashboard tabs:** analytics/costs

**Key metrics:** cache hit rate, cache savings

| Property | Value |
|---|---|
| rows | 0 |
| last write | no data |
| columns | 24 |
| indexes | 2 |
| timestamp col | `None` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Missing expected columns:** `cache_key`, `created_at`

**Suggested enhancements:**

- ADD hit_count INTEGER to measure cache effectiveness
- SURFACE cache savings in analytics/costs as 'Prompt Cache Savings' KPI

---

## `agentsam_script_runs`  🔴 EMPTY

**Purpose:** Execution records for script runs.

**Dashboard tabs:** analytics/agent

**Key metrics:** script run count, failure rate

| Property | Value |
|---|---|
| rows | 0 |
| last write | no data |
| columns | 18 |
| indexes | 1 |
| timestamp col | `created_at` |
| has tenant_id | ✗ |
| in knowledge base | ✓ |

**Missing expected columns:** `output`, `tenant_id`

**Suggested enhancements:**

- ADD INDEX on (script_id, created_at DESC)
- ADD INDEX on (tenant_id, status, created_at DESC)

---

## `agentsam_skill_invocation`  🔴 EMPTY

**Purpose:** Record of every skill invocation. Source for skill usage analytics.

**Dashboard tabs:** analytics/agent

**Key metrics:** invocation count, success rate, top skills

| Property | Value |
|---|---|
| rows | 0 |
| last write | no data |
| columns | 21 |
| indexes | 1 |
| timestamp col | `None` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Missing expected columns:** `status`, `created_at`

**Suggested enhancements:**

- ADD INDEX on (skill_id, created_at DESC)
- ADD INDEX on (tenant_id, created_at DESC)
- SURFACE as 'Top Skills' leaderboard in Agent tab

---

## `agentsam_tool_cache`  🔴 EMPTY

**Purpose:** Unknown — not in knowledge base

| Property | Value |
|---|---|
| rows | 0 |
| last write | no data |
| columns | 23 |
| indexes | 7 |
| timestamp col | `created_at` |
| has tenant_id | ✓ |
| in knowledge base | ✗ — add to TABLE_KNOWLEDGE |

_No enhancements suggested — looks complete._

---

## `agentsam_workflow_runs`  🔴 EMPTY

**Purpose:** Runtime instance of a workflow. Primary source for workflow success/failure KPIs.

**Dashboard tabs:** analytics/workflow, analytics/overview

**Key metrics:** run count, success rate, avg duration, failure by workflow

| Property | Value |
|---|---|
| rows | 0 |
| last write | no data |
| columns | 49 |
| indexes | 9 |
| timestamp col | `created_at` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Missing expected columns:** `total_cost_usd`

**Suggested enhancements:**

- ADD INDEX on (tenant_id, started_at DESC)
- ADD INDEX on (workflow_id, status) for per-workflow success rate
- ENSURE completed_at is written on ALL terminal states
- DERIVE duration = completed_at - started_at in API layer
- REPLACE mcp_usage_log workflow counting with COUNT(*) on this table

---

## `agentsam_ai`  ⚪ CONFIG

**Purpose:** Canonical AI model catalog. All model resolution happens from this table. Config.

**Dashboard tabs:** settings/ai-models, analytics/models

| Property | Value |
|---|---|
| rows | 112 |
| last write | 83.9h ago |
| columns | 94 |
| indexes | 2 |
| timestamp col | `created_at` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Missing expected columns:** `input_cost_per_1m`, `output_cost_per_1m`

**Suggested enhancements:**

- ENSURE mode='model' AND status='active' filter is always applied in resolution queries
- JOIN to agentsam_usage_events.model_key for 'registered but never called' detection
- VERIFY no hardcoded model strings exist in codebase — all refs via this table
- ADD last_updated_at INTEGER for pricing freshness tracking

---

## `agentsam_browser_trusted_origin`  ⚪ CONFIG

**Purpose:** Trusted browser origins for cross-origin PTY/agent interactions.

**Dashboard tabs:** settings/network, settings/security

| Property | Value |
|---|---|
| rows | 10 |
| last write | no data |
| columns | 7 |
| indexes | 1 |
| timestamp col | `created_at` |
| has tenant_id | ✗ |
| in knowledge base | ✓ |

**Missing expected columns:** `tenant_id`, `enabled`

**Suggested enhancements:**

- ADD UNIQUE on (origin, tenant_id)
- SURFACE in settings/network alongside fetch_domain_allowlist

---

## `agentsam_command_allowlist`  ⚪ CONFIG

**Purpose:** Per-tenant command allow rules. Security enforcement.

**Dashboard tabs:** settings/agents, settings/security

| Property | Value |
|---|---|
| rows | 155 |
| last write | no data |
| columns | 6 |
| indexes | 3 |
| timestamp col | `created_at` |
| has tenant_id | ✗ |
| in knowledge base | ✓ |

**Missing expected columns:** `command_id`, `tenant_id`, `enabled`

**Suggested enhancements:**

- ADD UNIQUE on (command_id, tenant_id, workspace_id)

---

## `agentsam_command_pattern`  ⚪ CONFIG

**Purpose:** Regex/glob patterns for command matching in resolveAgentCommand.

**Dashboard tabs:** settings/agents

| Property | Value |
|---|---|
| rows | 10 |
| last write | no data |
| columns | 14 |
| indexes | 3 |
| timestamp col | `created_at` |
| has tenant_id | ✗ |
| in knowledge base | ✓ |

**Missing expected columns:** `command_id`, `priority`

**Suggested enhancements:**

- ADD UNIQUE on (pattern) to prevent duplicate matchers
- ADD INDEX on (priority) for ordered resolution

---

## `agentsam_commands`  ⚪ CONFIG

**Purpose:** Command definitions resolvable by resolveAgentCommand. Config.

**Dashboard tabs:** settings/agents

| Property | Value |
|---|---|
| rows | 372 |
| last write | no data |
| columns | 43 |
| indexes | 8 |
| timestamp col | `created_at` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Missing expected columns:** `name`, `handler`, `enabled`

**Suggested enhancements:**

- JOIN to agentsam_command_run for 'commands never executed' detection

---

## `agentsam_eval_cases`  ⚪ CONFIG

**Purpose:** Test case definitions for agent evaluation. Config/reference.

**Dashboard tabs:** analytics/evals

| Property | Value |
|---|---|
| rows | 12 |
| last write | 109.1h ago |
| columns | 10 |
| indexes | 1 |
| timestamp col | `created_at` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Missing expected columns:** `name`

**Suggested enhancements:**

- ADD version INTEGER for eval case versioning
- JOIN to agentsam_eval_runs for pass/fail rate per case

---

## `agentsam_eval_suites`  ⚪ CONFIG

**Purpose:** Named collections of eval cases. Config grouping.

**Dashboard tabs:** analytics/evals

| Property | Value |
|---|---|
| rows | 8 |
| last write | 109.1h ago |
| columns | 13 |
| indexes | 1 |
| timestamp col | `created_at` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Missing expected columns:** `case_ids`

**Suggested enhancements:**

- CONSIDER replacing case_ids JSON with a join table
- ADD last_run_at for staleness detection

---

## `agentsam_execution_context`  ⚪ CONFIG

**Purpose:** Snapshot of execution context (env vars, config state) at run time. Debug/replay support.

**Dashboard tabs:** analytics/agent (drilldown drawer)

**Key metrics:** N/A — reference data

| Property | Value |
|---|---|
| rows | 66 |
| last write | 3.1h ago |
| columns | 13 |
| indexes | 4 |
| timestamp col | `created_at` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Missing expected columns:** `execution_id`, `context_json`

**Suggested enhancements:**

- ENSURE context_json is compact — avoid storing large blobs (use R2 ref instead)
- ADD TTL/cleanup job: delete rows older than 30d to prevent unbounded growth
- SURFACE in 'Run Drilldown' drawer alongside agentsam_execution_steps

---

## `agentsam_feature_flag`  ⚪ CONFIG

**Purpose:** Feature flag definitions. Runtime gates for new capabilities.

**Dashboard tabs:** settings/general

| Property | Value |
|---|---|
| rows | 13 |
| last write | no data |
| columns | 15 |
| indexes | 1 |
| timestamp col | `created_at` |
| has tenant_id | ✗ |
| in knowledge base | ✓ |

**Missing expected columns:** `key`, `enabled`, `tenant_id`, `workspace_id`

**Suggested enhancements:**

- ADD rollout_pct INTEGER DEFAULT 100 for gradual rollout support
- SURFACE in settings/general as a toggle list
- JOIN to agentsam_user_feature_override for per-user exceptions

---

## `agentsam_fetch_domain_allowlist`  ⚪ CONFIG

**Purpose:** Allowed external fetch domains for agent browser/fetch tool calls. Security config.

**Dashboard tabs:** settings/network

| Property | Value |
|---|---|
| rows | 18 |
| last write | no data |
| columns | 6 |
| indexes | 3 |
| timestamp col | `created_at` |
| has tenant_id | ✗ |
| in knowledge base | ✓ |

**Missing expected columns:** `domain`, `tenant_id`, `enabled`, `added_by`

**Suggested enhancements:**

- ADD UNIQUE on (domain, tenant_id)
- ADD added_by TEXT + added_at INTEGER for audit
- SURFACE in settings/network alongside browser_trusted_origin

---

## `agentsam_guardrail_rulesets`  ⚪ CONFIG

**Purpose:** Named collections of guardrails. Config grouping layer.

**Dashboard tabs:** settings/rules

| Property | Value |
|---|---|
| rows | 2 |
| last write | no data |
| columns | 17 |
| indexes | 5 |
| timestamp col | `created_at` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Missing expected columns:** `name`, `guardrail_ids`

**Suggested enhancements:**

- CONSIDER replacing guardrail_ids JSON array with a join table for integrity

---

## `agentsam_guardrails`  ⚪ CONFIG

**Purpose:** Guardrail rule definitions. Config.

**Dashboard tabs:** settings/rules

| Property | Value |
|---|---|
| rows | 13 |
| last write | no data |
| columns | 22 |
| indexes | 6 |
| timestamp col | `created_at` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Missing expected columns:** `name`, `rule_type`, `enabled`

**Suggested enhancements:**

- JOIN to agentsam_guardrail_events for 'rules with most triggers' analytics
- ADD last_triggered_at for staleness detection in settings UI

---

## `agentsam_hook`  ⚪ CONFIG

**Purpose:** Hook definitions (event → action bindings). Config.

**Dashboard tabs:** settings/hooks

| Property | Value |
|---|---|
| rows | 14 |
| last write | no data |
| columns | 17 |
| indexes | 6 |
| timestamp col | `created_at` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Missing expected columns:** `event_type`, `target_url`, `enabled`

**Suggested enhancements:**

- JOIN to agentsam_hook_execution for 'hooks with most failures' analytics
- ADD last_triggered_at for activity detection in settings UI

---

## `agentsam_ignore_pattern`  ⚪ CONFIG

**Purpose:** File/path patterns the codebase indexer should skip.

**Dashboard tabs:** settings/github

| Property | Value |
|---|---|
| rows | 10 |
| last write | no data |
| columns | 10 |
| indexes | 3 |
| timestamp col | `created_at` |
| has tenant_id | ✗ |
| in knowledge base | ✓ |

**Missing expected columns:** `tenant_id`

**Suggested enhancements:**

- ADD UNIQUE on (pattern, workspace_id)
- SURFACE in settings/github as gitignore-style editor

---

## `agentsam_mcp_allowlist`  ⚪ CONFIG

**Purpose:** Per-tenant/workspace MCP tool allow rules. Security enforcement config.

**Dashboard tabs:** settings/tools

| Property | Value |
|---|---|
| rows | 412 |
| last write | no data |
| columns | 16 |
| indexes | 6 |
| timestamp col | `created_at` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Missing expected columns:** `enabled`

**Suggested enhancements:**

- ENSURE unique constraint on (tenant_id, workspace_id, tool_key)
- CONSIDER adding allowed_by (user_id) + allowed_at for audit trail

---

## `agentsam_mcp_servers`  ⚪ CONFIG

**Purpose:** Registry of connected MCP servers. Config — not metrics.

**Dashboard tabs:** settings/tools, analytics/mcp

**Key metrics:** server health, last_ping

| Property | Value |
|---|---|
| rows | 3 |
| last write | 80.5h ago |
| columns | 17 |
| indexes | 3 |
| timestamp col | `created_at` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Missing expected columns:** `name`, `status`, `last_ping_at`

**Suggested enhancements:**

- ADD last_ping_at INTEGER for server health monitoring
- ADD status TEXT CHECK(status IN ('active','degraded','offline'))
- SURFACE in MCP tab as 'MCP Services' health strip

---

## `agentsam_mcp_tools`  ⚪ CONFIG

**Purpose:** Registry of known MCP tools (metadata). Config table — not a metrics table.

**Dashboard tabs:** settings/tools, analytics/mcp

| Property | Value |
|---|---|
| rows | 392 |
| last write | no data |
| columns | 50 |
| indexes | 6 |
| timestamp col | `created_at` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Suggested enhancements:**

- JOIN to agentsam_mcp_tool_execution.tool_name for 'registered but never called' detection
- ADD enabled BOOLEAN DEFAULT 1 if missing
- CONSIDER requires_approval field to flag high-risk tools in UI

---

## `agentsam_model_catalog`  ⚪ CONFIG

**Purpose:** Extended model metadata (capabilities, context window, etc.). May extend agentsam_ai.

**Dashboard tabs:** settings/ai-models

| Property | Value |
|---|---|
| rows | 19 |
| last write | 16.2h ago |
| columns | 35 |
| indexes | 6 |
| timestamp col | `created_at` |
| has tenant_id | ✗ |
| in knowledge base | ✓ |

**Suggested enhancements:**

- AUDIT relationship to agentsam_ai — consider merging or making explicit FK
- SURFACE capability flags in settings/ai-models UI for model selection guidance

---

## `agentsam_model_tier`  ⚪ CONFIG

**Purpose:** Tier gating per model (free/pro/enterprise access gates). Config.

**Dashboard tabs:** settings/ai-models

| Property | Value |
|---|---|
| rows | 5 |
| last write | no data |
| columns | 18 |
| indexes | 2 |
| timestamp col | `created_at` |
| has tenant_id | ✗ |
| in knowledge base | ✓ |

**Missing expected columns:** `model_key`, `tier`, `tenant_id`

**Suggested enhancements:**

- ENSURE tier check happens in request path before model resolution
- SURFACE tier badges in /settings/ai-models model list

---

## `agentsam_project_context`  ⚪ CONFIG

**Purpose:** Project-scoped context blobs. Reference data injected into agent sessions.

**Dashboard tabs:** settings/workspace

| Property | Value |
|---|---|
| rows | 54 |
| last write | no data |
| columns | 37 |
| indexes | 7 |
| timestamp col | `created_at` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Missing expected columns:** `context_key`, `context_text`

**Suggested enhancements:**

- ADD size_bytes INTEGER for storage monitoring
- ADD version INTEGER for context versioning

---

## `agentsam_prompt_routes`  ⚪ CONFIG

**Purpose:** Routing rules that map intents to specific prompts/models. Config.

**Dashboard tabs:** settings/agents

| Property | Value |
|---|---|
| rows | 10 |
| last write | 17.1h ago |
| columns | 23 |
| indexes | 4 |
| timestamp col | `created_at` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Missing expected columns:** `intent_pattern`, `prompt_key`, `model_key`

**Suggested enhancements:**

- JOIN to agentsam_usage_events for 'route hit frequency' analytics

---

## `agentsam_prompt_versions`  ⚪ CONFIG

**Purpose:** Version-controlled prompt definitions. Config.

**Dashboard tabs:** settings/agents

| Property | Value |
|---|---|
| rows | 11 |
| last write | 79.7h ago |
| columns | 19 |
| indexes | 4 |
| timestamp col | `created_at` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Missing expected columns:** `content`

**Suggested enhancements:**

- ADD UNIQUE on (prompt_key, version)
- SURFACE version diff in settings/agents prompt editor

---

## `agentsam_route_requirements`  ⚪ CONFIG

**Purpose:** Required preconditions for route activation. Config.

**Dashboard tabs:** settings/agents

| Property | Value |
|---|---|
| rows | 10 |
| last write | no data |
| columns | 21 |
| indexes | 3 |
| timestamp col | `None` |
| has tenant_id | ✗ |
| in knowledge base | ✓ |

**Missing expected columns:** `route_id`, `requirement_type`, `value`

**Suggested enhancements:**

- SURFACE unmet requirements as warnings in settings/agents

---

## `agentsam_routing_arms`  ⚪ CONFIG

**Purpose:** Thompson Sampling arm definitions. Config + runtime state.

**Dashboard tabs:** analytics/models, settings/ai-models

**Key metrics:** arm selection frequency, current best arm

| Property | Value |
|---|---|
| rows | 57 |
| last write | no data |
| columns | 38 |
| indexes | 10 |
| timestamp col | `None` |
| has tenant_id | ✗ |
| in knowledge base | ✓ |

**Missing expected columns:** `weight`, `enabled`

**Suggested enhancements:**

- JOIN to agentsam_model_routing_memory for live arm health
- SURFACE active arms in /settings/ai-models for operator visibility

---

## `agentsam_rules_document`  ⚪ CONFIG

**Purpose:** Injected rules/instruction documents for agent behavior. Config.

**Dashboard tabs:** settings/rules

| Property | Value |
|---|---|
| rows | 4 |
| last write | no data |
| columns | 10 |
| indexes | 2 |
| timestamp col | `created_at` |
| has tenant_id | ✗ |
| in knowledge base | ✓ |

**Missing expected columns:** `name`, `tenant_id`, `content`, `enabled`

**Suggested enhancements:**

- ADD version INTEGER for rules versioning
- ADD last_applied_at to know if rule is actively used

---

## `agentsam_scripts`  ⚪ CONFIG

**Purpose:** Agent-runnable script definitions. Config.

**Dashboard tabs:** settings/agents

| Property | Value |
|---|---|
| rows | 106 |
| last write | 20.5h ago |
| columns | 22 |
| indexes | 3 |
| timestamp col | `created_at` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Missing expected columns:** `content`, `language`

**Suggested enhancements:**

- JOIN to agentsam_script_runs for 'scripts never executed' detection

---

## `agentsam_skill`  ⚪ CONFIG

**Purpose:** Skill definitions. Each skill = named capability with SKILL.md in R2.

**Dashboard tabs:** settings/agents

| Property | Value |
|---|---|
| rows | 48 |
| last write | no data |
| columns | 29 |
| indexes | 1 |
| timestamp col | `created_at` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Missing expected columns:** `enabled`

**Suggested enhancements:**

- JOIN to agentsam_skill_invocation for 'most-used skills' analytics
- ADD last_invoked_at for staleness detection

---

## `agentsam_skill_revision`  ⚪ CONFIG

**Purpose:** Version history for skill definitions.

**Dashboard tabs:** settings/agents

| Property | Value |
|---|---|
| rows | 0 |
| last write | no data |
| columns | 7 |
| indexes | 3 |
| timestamp col | `created_at` |
| has tenant_id | ✗ |
| in knowledge base | ✓ |

**Missing expected columns:** `file_path`

**Suggested enhancements:**

- ADD INDEX on (skill_id, version DESC)
- SURFACE version history in settings/agents skill editor

---

## `agentsam_slash_commands`  ⚪ CONFIG

**Purpose:** Slash command definitions (user-facing /commands).

**Dashboard tabs:** settings/agents

| Property | Value |
|---|---|
| rows | 22 |
| last write | no data |
| columns | 17 |
| indexes | 2 |
| timestamp col | `created_at` |
| has tenant_id | ✗ |
| in knowledge base | ✓ |

**Missing expected columns:** `command`, `handler`, `tenant_id`

**Suggested enhancements:**

- SURFACE in settings/agents as slash command editor
- JOIN to agentsam_command_run for usage frequency

---

## `agentsam_subagent_profile`  ⚪ CONFIG

**Purpose:** Subagent configurations (coder, browser, toolbox, recall). Config.

**Dashboard tabs:** settings/agents

| Property | Value |
|---|---|
| rows | 41 |
| last write | no data |
| columns | 37 |
| indexes | 3 |
| timestamp col | `created_at` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Missing expected columns:** `name`, `model_key`, `system_prompt_key`, `enabled`

**Suggested enhancements:**

- SURFACE in settings/agents as subagent profile editor
- JOIN to agentsam_usage_events for per-subagent cost breakdown

---

## `agentsam_subscription_registry`  ⚪ CONFIG

**Purpose:** Event subscription registry (pub/sub bindings). Config.

**Dashboard tabs:** settings/integrations

| Property | Value |
|---|---|
| rows | 16 |
| last write | 107.5h ago |
| columns | 11 |
| indexes | 1 |
| timestamp col | `created_at` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Missing expected columns:** `event_type`, `subscriber_url`, `enabled`

**Suggested enhancements:**

- JOIN to agentsam_webhook_events for 'subscription delivery rate' analytics
- ADD last_delivered_at for staleness monitoring

---

## `agentsam_task_slos`  ⚪ CONFIG

**Purpose:** SLO definitions per task type. Drives SLA breach counts in performance metrics.

**Dashboard tabs:** settings/agents, analytics/agent

| Property | Value |
|---|---|
| rows | 3 |
| last write | no data |
| columns | 10 |
| indexes | 1 |
| timestamp col | `None` |
| has tenant_id | ✗ |
| in knowledge base | ✓ |

**Missing expected columns:** `max_duration_ms`, `target_success_rate`

**Suggested enhancements:**

- ENSURE agentsam_execution_performance_metrics.sla_breach_count references these
- SURFACE SLO status per task_type in Agent tab as compliance indicators

---

## `agentsam_user_feature_override`  ⚪ CONFIG

**Purpose:** Per-user feature flag overrides. Supplements agentsam_feature_flag.

**Dashboard tabs:** settings/general

| Property | Value |
|---|---|
| rows | 0 |
| last write | no data |
| columns | 5 |
| indexes | 1 |
| timestamp col | `None` |
| has tenant_id | ✗ |
| in knowledge base | ✓ |

**Missing expected columns:** `feature_key`, `tenant_id`

**Suggested enhancements:**

- ADD UNIQUE on (user_id, feature_key, tenant_id)
- SURFACE in user management UI as feature override badges

---

## `agentsam_user_policy`  ⚪ CONFIG

**Purpose:** Per-user access policy overrides. Security enforcement config.

**Dashboard tabs:** settings/security

| Property | Value |
|---|---|
| rows | 4 |
| last write | no data |
| columns | 50 |
| indexes | 2 |
| timestamp col | `None` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Missing expected columns:** `policy_json`

**Suggested enhancements:**

- ADD updated_by TEXT for audit trail
- ENSURE policy_json schema is validated at write time

---

## `agentsam_workflows`  ⚪ CONFIG

**Purpose:** Workflow definitions/templates. Config — not metrics.

**Dashboard tabs:** settings/agents, analytics/workflow

| Property | Value |
|---|---|
| rows | 10 |
| last write | no data |
| columns | 20 |
| indexes | 6 |
| timestamp col | `created_at` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Missing expected columns:** `name`, `enabled`, `definition_json`

**Suggested enhancements:**

- JOIN to agentsam_workflow_runs for 'runs per workflow' KPI
- ADD version INTEGER for workflow definition versioning

---

## `agentsam_workspace`  ⚪ CONFIG

**Purpose:** Workspace entity definitions. Master config for multi-tenant workspace scoping.

**Dashboard tabs:** settings/workspace

| Property | Value |
|---|---|
| rows | 23 |
| last write | no data |
| columns | 19 |
| indexes | 3 |
| timestamp col | `created_at` |
| has tenant_id | ✓ |
| in knowledge base | ✓ |

**Suggested enhancements:**

- ENSURE all agentsam_* tables with workspace_id FK reference this table
- ADD plan_tier TEXT for workspace billing tier scoping

---
