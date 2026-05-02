# D1 schema overview (`inneranimalmedia-business`)

**Database ID (wrangler):** `cf87b717-d4e2-4cf8-bab0-a81268e32d49`

This is a **non-exhaustive** overview grounded in `worker.js` and project docs. Run `PRAGMA table_info(...)` or migrations for authoritative columns.

## Ops / deploy

| Table | Purpose |
|-------|---------|
| **deployments** | Worker deploy history; columns include `id` (often Worker version UUID), `timestamp`, `version`, `git_hash`, `description`, `status`, `deployed_by`, `environment`, `deploy_time_seconds`, `worker_name`, `triggered_by`, `notes` (see `post-deploy-record.sh` INSERT). |
| **deployment_changes** | Per-file changes linked to `deployments.id` (`handleDeploymentLog` ~360+). |
| **dashboard_versions** | Cache-bust registry for dashboard assets (`deploy-with-record.sh`). |
| **cloudflare_deployments** | Alternate tracking table used in some session flows (see session log). |
| **playwright_jobs** / **playwright_jobs_v2** | Async browser jobs from queue consumer (~3953+). |

## Agent / chat

| Table | Purpose |
|-------|---------|
| **agent_sessions** | Session metadata for agent chat. |
| **agent_messages** | Message rows for conversations. |
| **agent_conversations** | Conversation grouping (referenced in compaction ~13190+). |
| **agent_telemetry** | Token / usage telemetry. |
| **mcp_registered_tools** | **73 enabled tools** loaded into chat (`docs/autorag-knowledge/architecture/agent-sam-capabilities.md`); `tool_name`, `tool_category`, `input_schema`, `enabled`. |
| **mcp_tool_calls** | Audit of tool invocations from `runToolLoop` / MCP. |
| **mcp_services** / **mcp_registered_tools** | MCP registry (see AGENT_SAM_FULL_CAPABILITY_AUDIT). |

## Spend / usage

| Table | Purpose |
|-------|---------|
| **spend_ledger** | Unified spend rows (`fetchUnifiedSpendGrouped` ~453+). |
| **ai_usage_log** | Model usage lines (fallback column names handled in worker). |
| **project_time_entries** | Time tracking (API handlers elsewhere). |

## Auth

| Table | Purpose |
|-------|---------|
| **auth_users** | User records. |
| **auth_sessions** / cookies | Session validation via `getAuthUser` patterns. |
| **user_oauth_tokens** | Integration tokens (Google, GitHub). |

## Projects / work

| Table | Purpose |
|-------|---------|
| **projects** | Client/project records (`/api/projects`). |
| **tasks** | Task rows where present (grep worker for `tasks`). |
| **workspaces** | Workspace list (Agent welcome command). |

## Knowledge / RAG

| Table | Purpose |
|-------|---------|
| **ai_knowledge_base** | D1 knowledge rows; merged with AutoRAG hits in `runKnowledgeSearchMerged` (~12822+). |
| **ai_compiled_context_cache** | Cached compiled system context per `context_hash` (`invalidateCompiledContextCache` ~177+). |
| **context_search_log** | Logs context index searches; **`scope`** and **`query_snippet`** columns added per `docs/cursor-session-log.md` (2026-03-23/24) — verify with `PRAGMA table_info(context_search_log)` on remote D1. |

## Indexing jobs

| Table | Purpose |
|-------|---------|
| **agentsam_code_index_job** | Code index job status (queried ~9741+ in agentsam API). |

## Known schema fixes (recent)

- **context_search_log:** `query_snippet` and `scope` — remote ALTER documented in session log; worker `logContextSearch` writes these fields when present.
- **Pre-prompt RAG URL:** worker uses **`.../ai-search/instances/iam-autorag/search`** (not legacy `indexes/.../query`); see session log entries for 2026-03-23.
