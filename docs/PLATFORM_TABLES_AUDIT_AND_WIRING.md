# Platform tables audit — connect and populate

**Purpose:** Audit the tables you listed (and related ones) so we can close the gap between "schema exists in D1" and "platform actually writes/reads and UI shows data." This doc maps each table to migrations, worker/dashboard usage, and concrete wiring steps.

---

## Summary: the disconnect

Many tables exist in D1 (from migrations or other sources) but:

- **No writer** — code never INSERTs (e.g. `activity_log`, `cicd_events`, `cicd_runs`).
- **Writer exists but path rarely runs** — e.g. `ai_rag_search_history` only on `/api/search` and `invokeMcpToolFromChat` knowledge_search; `mcp_tool_calls` only for non-builtin tools when invoked via Anthropic/execute-approved-tool.
- **Overlap / duplication** — e.g. `time_entries` / `timesheets` vs canonical `project_time_entries`; `cost_tracking` vs `spend_ledger` + `agent_telemetry`.
- **Table in D1 but no migration in repo** — e.g. `cicd`, `cicd_events`, `activity_log`, `agent_memory_for_context`; we can't assume schema.

Optimal approach: **one canonical table per concern**, **one clear write path**, **dashboard reads from that table**.

---

## 1. Table-by-table audit

### agent_memory_for_context

| Item | Status |
|------|--------|
| Migration in repo | No |
| Worker read/write | No. Worker uses **agent_memory_index** (and ai_knowledge_base, ai_compiled_context_cache) for context. |
| Recommendation | **Consolidate:** Treat **agent_memory_index** as the canonical "memory for context" table. If `agent_memory_for_context` exists in D1, either (a) add a migration that creates it and wire worker to write high-importance rows there, or (b) document it as deprecated and use agent_memory_index only. Prefer (b) to avoid duplicate tables. |

---

### ai_rag_search_history

| Item | Status |
|------|--------|
| Migration in repo | No (table may exist in D1 from elsewhere) |
| Worker write | Yes. Two call sites: (1) `/api/search` handler (~917) — INSERT id, tenant_id, query_text, context_used, created_at; (2) **invokeMcpToolFromChat** knowledge_search (~5399) — INSERT with optional retrieved_chunk_ids_json. |
| Worker read | No (no dashboard or API reads it in this repo) |
| Why often empty | RAG is also used in: runToolLoop (OpenAI/Google) and pre-inject RAG in chat — those paths do **not** write to ai_rag_search_history. So only /api/search and Agent knowledge_search tool calls create rows. |
| Recommendation | (1) Add migration **CREATE TABLE IF NOT EXISTS ai_rag_search_history** with columns (id, tenant_id, query_text, context_used, created_at, optional retrieved_chunk_ids_json) so schema is in repo. (2) Optionally add INSERT in runToolLoop after knowledge_search and in chat RAG pre-inject so **all** RAG queries are logged. (3) Add dashboard or API to **read** this table (e.g. "Recent RAG queries" in Overview or MCP page). |

---

### ci_di_workflow_runs

| Item | Status |
|------|--------|
| Migration in repo | Yes — **140_ci_di_workflow_runs.sql** |
| Worker read | Not in worker; documented in AUTORAG_SYNC.md for manual query |
| Written by | **scripts/record-workflow-run.sh** (e.g. from .githooks/post-merge after autorag sync) |
| Recommendation | (1) Ensure post-merge (or any CI step) calls `record-workflow-run.sh` so rows appear. (2) Optionally add GET /api/overview/ci-di-runs or include in activity-strip to show "CI/DI runs this week" in Overview using this table (distinct from cicd_runs). |

---

### cicd_build_steps, cicd_environment_vars

| Item | Status |
|------|--------|
| Migration in repo | No |
| Worker | No references |
| Recommendation | **Defer or consolidate.** If you need build-step granularity, add a migration and have a GitHub (or other) webhook write rows when a workflow runs. Otherwise use **cicd_runs** (or ci_di_workflow_runs) as the single source of truth for "run" and skip per-step tables until needed. |

---

### cicd_runs

| Item | Status |
|------|--------|
| Migration in repo | No (suggested 142 in OVERVIEW_DASHBOARD_DB_AUDIT.md) |
| Worker read | Yes. **GET /api/overview/deployments** — SELECT last 10, returns to Overview "CI/CD runs" widget. |
| Worker write | No. Table exists in D1 (verification showed 0 rows). |
| Recommendation | (1) Add migration **142_cicd_runs.sql** (run_id, workflow_name, branch, status, conclusion, started_at, completed_at, etc.). (2) Add **POST /api/internal/cicd-run** (or use GitHub webhook) to INSERT on workflow_run completed. (3) Overview already reads; once rows exist, widget fills. |

---

### cicd

| Item | Status |
|------|--------|
| Migration in repo | No (116 references it as used by /api/agent/boot but does not create it) |
| Worker read | Yes. **GET /api/agent/cicd** — SELECT cicd JOIN cicd_events, returns list with activity_count. Daily plan cron also reads cicd (pending/in_progress/blocked). |
| Worker write | No (no INSERT/UPDATE in worker) |
| Recommendation | (1) If table exists in D1, add a migration to this repo that does CREATE IF NOT EXISTS so schema is versioned. (2) Add write path: e.g. POST /api/agent/cicd (or internal) to create/update workflows so the Agent or dashboard can populate it; or a script that seeds from roadmap_steps / another source. |

---

### cicd_active_workflows, cicd_events

| Item | Status |
|------|--------|
| Migration in repo | No. cicd_events is JOINed in /api/agent/cicd (activity_count). |
| Worker read | cicd_events — yes (JOIN in cicd query). cicd_active_workflows — mentioned in agentsam-clean as a view (cl.name fix). |
| Worker write | No INSERT into cicd_events in worker. |
| Recommendation | (1) Add migrations: **cicd** and **cicd_events** (and optional view cicd_active_workflows) so schema is in repo. (2) Whenever a cicd workflow is updated (e.g. status change), INSERT a row into cicd_events (cicd_workflow_id, event_type, created_at, etc.). Wire that to the same API or script that writes cicd. |

---

### activity_log (D1 Studio screenshot)

| Item | Status |
|------|--------|
| Migration in repo | No |
| Worker | No references in this repo (different from cicd_events) |
| Recommendation | **Decide purpose.** If "activity_log" is for general platform events (logins, page views, deploy clicks): add migration and one central place (e.g. POST /api/internal/activity or a helper) that INSERTs. Call it from auth callback, deploy record, key dashboard actions. If it duplicates cicd_events or agent_audit_log, consolidate into one and deprecate the other. |

---

### cloudflare_deployments

| Item | Status |
|------|--------|
| Migration in repo | Yes — **113**, plus 114 (timing), 115 (deployment_notes) |
| Worker read | Overview activity-strip, deployments widget, stats, recent activity |
| Worker write | **POST /api/internal/record-deploy** (added recently); scripts/post-deploy-record.sh (via deploy-with-record.sh) |
| Recommendation | Already wired. Use **docs/DEPLOY_TRACKING.md** so every deploy path records (npm run deploy or record-deploy API). |

---

### cost_tracking

| Item | Status |
|------|--------|
| Migration in repo | No |
| Worker | No references. Docs mention "step_cost_tracking" and per-session/per-deploy cost. |
| Recommendation | **Consolidate.** Canonical cost data is **spend_ledger** ($) and **agent_telemetry** (tokens). Add a view or dashboard query that aggregates by session/deploy/provider from those tables instead of a new cost_tracking table. If you need a dedicated cost_tracking table, add migration and wire agent/chat and deploy flows to write there (and avoid duplicating spend_ledger). |

---

### deployment_health_checks

| Item | Status |
|------|--------|
| Migration in repo | No |
| Worker | No references |
| Recommendation | **Defer** until you have a health-check job (e.g. cron that hits key URLs and stores results). Then add migration and wire that job to INSERT. |

---

### github_repositories, github_webhook_events

| Item | Status |
|------|--------|
| Migration in repo | No |
| Worker | github_repos / github_file are **tool names** (mcp_registered_tools); worker calls GitHub API but does not store repo list or webhook events in D1. |
| Recommendation | **Optional.** If you want a table of "connected repos" or "webhook events": add migrations and (1) populate github_repositories from OAuth or API when user connects GitHub, (2) add a webhook endpoint that receives GitHub events and INSERTs into github_webhook_events (and optionally triggers cicd_runs INSERT). |

---

### mcp_agent_sessions

| Item | Status |
|------|--------|
| Migration in repo | Yes — **121_mcp_dashboard_tables.sql**; 135 adds conversation_id, last_activity, tool_calls_count |
| Worker read | /api/agent/boot (sessions list), /api/agent/mcp |
| Worker write | **upsertMcpAgentSession(env, conversationId)** — called from /api/agent/chat when conversationId is set (streaming and non-streaming paths). INSERT or ON CONFLICT UPDATE. |
| Recommendation | Ensure **conversationId** is always set when a user starts a chat so upsertMcpAgentSession runs. If table is still empty, verify chat handler passes conversationId and that 135 columns exist in D1 (run migrations 134, 135 if not already). |

---

### mcp_audit_log

| Item | Status |
|------|--------|
| Migration in repo | No. **agent_command_audit_log** exists (106). |
| Worker | No mcp_audit_log references; agent_command_audit_log is used for command audit. |
| Recommendation | **Consolidate.** Use **agent_command_audit_log** (or a single "audit" table) for MCP-related audit events if needed, or add mcp_audit_log migration and wire recordMcpToolCall (or tool failure path) to INSERT. Prefer one audit table. |

---

### mcp_registered_tools

| Item | Status |
|------|--------|
| Migration in repo | Seeds in 126 (knowledge_search), 130, 131, 138, etc. Table likely created in same ecosystem as mcp_services. |
| Worker read | Many: tool list for chat, boot, execute-approved-tool, knowledge sync, route list. |
| Worker write | Migrations only (INSERT OR IGNORE for new tools). |
| Recommendation | Already central. Add new tools via migrations. Ensure dashboard "Tools" or MCP page reads from this table. |

---

### mcp_services

| Item | Status |
|------|--------|
| Migration in repo | Not created in 121 (comment: "mcp_services already exists"); 135 adds last_used. |
| Worker read | /api/agent/boot, /api/agent/mcp, compiled context |
| Worker write | **recordMcpToolCall** updates health_status and last_used when a tool is used; POST /api/agent/mcp can INSERT new service. |
| Recommendation | Ensure recordMcpToolCall is called for every tool use (including builtin) if you want mcp_services.last_used and health updated; currently only invoked from invokeMcpToolFromChat path. |

---

### mcp_tool_calls

| Item | Status |
|------|--------|
| Migration in repo | Yes — **137_mcp_tool_calls_table.sql** |
| Worker read | Dashboard/Agent can query via d1_query or dedicated API. |
| Worker write | **recordMcpToolCall** (invokeMcpToolFromChat path); **runToolLoop** INSERTs only for **non-builtin** tools. knowledge_search is builtin so runToolLoop does not write it; invokeMcpToolFromChat does. |
| Recommendation | (1) If you want **every** tool call (including builtins) logged: in runToolLoop after handling a builtin tool, call recordMcpToolCall (or a single INSERT). (2) Verify migrations 134, 137 applied so table and columns exist. |

---

### mcp_usage_log

| Item | Status |
|------|--------|
| Migration in repo | Yes — **134_mcp_usage_log.sql** |
| Worker write | **recordMcpToolCall** — INSERT or ON CONFLICT UPDATE (tenant_id, tool_name, date, call_count, success_count, failure_count). |
| Worker read | None in repo (dashboard could show "tool usage by day"). |
| Recommendation | recordMcpToolCall is only called from invokeMcpToolFromChat, so usage_log fills only when tools are used via that path. Optionally call recordMcpToolCall from runToolLoop for builtins so mcp_usage_log reflects all tool use. Add a small dashboard widget or API that reads mcp_usage_log for "RAG/tool usage this week." |

---

### time_entries, timesheets

| Item | Status |
|------|--------|
| Migration in repo | No (project_time_entries is in repo only as suggested 143 if missing) |
| Worker | **project_time_entries** is the canonical table; worker never references time_entries or timesheets. |
| Recommendation | **Consolidate.** Use **project_time_entries** for all time tracking. If time_entries/timesheets exist in D1, treat as legacy: (1) add a view or ETL that aggregates project_time_entries into timesheets if needed, or (2) document as deprecated and use only project_time_entries. Dashboard and Overview already use project_time_entries. |

---

## 2. Priority wiring checklist

| Priority | Table(s) | Action |
|----------|----------|--------|
| P0 | **cloudflare_deployments** | Already wired. Use npm run deploy or record-deploy API (see DEPLOY_TRACKING.md). |
| P0 | **project_time_entries** | Already wired. Use Time Tracking start/end/heartbeat; ensure session user_id matches. |
| P1 | **cicd_runs** | Add migration 142; add webhook or POST /api/internal/cicd-run to INSERT on workflow run. Overview already reads. |
| P1 | **ci_di_workflow_runs** | Ensure record-workflow-run.sh runs (e.g. post-merge). Optionally surface in Overview. |
| P1 | **ai_rag_search_history** | Add migration; optionally add INSERT in runToolLoop + RAG pre-inject; add dashboard read. |
| P2 | **cicd**, **cicd_events** | Add migrations; add write API or script; wire activity_log INSERT on workflow update. |
| P2 | **activity_log** | Define scope; add migration + single write path (auth, deploy, key actions). |
| P2 | **mcp_tool_calls**, **mcp_usage_log**, **mcp_agent_sessions** | Ensure recordMcpToolCall and upsertMcpAgentSession run on all tool/chat paths; optionally log builtins in runToolLoop. |
| P3 | **cost_tracking** | Prefer aggregating spend_ledger + agent_telemetry; or add one table and wire once. |
| P3 | **deployment_health_checks**, **github_repositories**, **github_webhook_events**, **cicd_build_steps**, **cicd_environment_vars** | Defer or add when you have concrete use (webhooks, health cron). |

---

## 3. Optimal configuration summary

1. **One canonical table per concern** — Time: project_time_entries. Cost: spend_ledger + agent_telemetry. Deploys: cloudflare_deployments. CI/DI runs: ci_di_workflow_runs and/or cicd_runs. MCP: mcp_tool_calls, mcp_usage_log, mcp_agent_sessions, mcp_services, mcp_registered_tools. RAG: ai_rag_search_history.
2. **Single write path per table** — e.g. deploy: only post-deploy-record.sh + record-deploy API; time: only time-track start/end/heartbeat; CI/DI: only record-workflow-run.sh and (when added) cicd webhook.
3. **Migrations in repo for every table the worker uses** — So schema is versioned and deployable; no "table exists in D1 but not in repo."
4. **Dashboard/Overview read from canonical tables** — Already true for deployments, projects, hours, activity-strip; add reads for ai_rag_search_history, mcp_usage_log, ci_di_workflow_runs, cicd_runs once populated.
5. **Fill gaps in call sites** — e.g. recordMcpToolCall for builtin tools; ai_rag_search_history for all RAG paths; upsertMcpAgentSession on every chat start.

---

## 4. Next steps (concrete)

1. **Run verification queries** (from OVERVIEW_DASHBOARD_DB_AUDIT.md) for the tables above to confirm which exist and have rows.
2. **Add missing migrations** for: ai_rag_search_history, cicd_runs (142), cicd, cicd_events, activity_log (if you keep it). Prefer CREATE IF NOT EXISTS so existing D1 tables are not broken.
3. **Add one write path per empty table** — e.g. GitHub webhook → cicd_runs; workflow script → ci_di_workflow_runs; chat/tool handlers → mcp_*, ai_rag_search_history; cicd API or script → cicd + cicd_events.
4. **Wire Overview/dashboard** to read the new/updated tables (e.g. CI/CD runs, RAG history, MCP usage) so the UI reflects reality.

After this, the platform and D1 stay in sync and the "huge disconnect" shrinks to zero for the tables you care about.
