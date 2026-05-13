# Inner Animal Media — Codebase Source Map
Generated: 2026-05-13T20:19:17Z  
Repo: `SamPrimeaux/inneranimalmedia` | Branch: `main`  
Index job: `cidx_ws_inneranimalmedia`

---

## Overview

| Metric | Value |
|--------|-------|
| Total runtime source files | 358 |
| API routes | 470 |
| Active D1 tables | 113 |
| Legacy tables (inspect) | 47 |
| Extinct tables (drop safe) | 2 |
| Supabase codebase_chunks | 6,183 (1024-dim embedded) |
| Supabase codebase_files | ~2,070 (last 3 snapshots) |

---

## Directory Structure

| Directory | Files | Purpose |
|-----------|-------|---------|
| `src/core/` | ~60 | Routing, memory, workflow executor, hooks, guardrails |
| `src/api/` | ~80 | HTTP handlers — agent, auth, mcp, billing, settings |
| `src/tools/` | ~20 | Builtin MCP tool handlers |
| `src/cron/` | ~15 | Scheduled jobs — digest, rollup, retention |
| `src/do/` | ~5 | Durable Objects — AgentChat |
| `src/integrations/` | ~10 | Provider integrations, OAuth |
| `scripts/` | 308 | Operational Python/JS — audit, smoke, backfill |
| `dashboard/src/` | 139 | React SPA components (TSX) |

---

## Runtime Source Files — top 40 by size

| File | Language | Size |
|------|----------|------|
| `src/api/agent.js` | javascript | 318KB |
| `src/api/settings.js` | javascript | 125KB |
| `src/api/auth.js` | javascript | 71KB |
| `src/api/integrations.js` | javascript | 57KB |
| `scripts/agentsam-execution-fabric-designer.py` | python | 49KB |
| `scripts/smoke/agentsam_full_mirrored_eval_series.py` | python | 48KB |
| `src/do/AgentChat.js` | javascript | 47KB |
| `src/core/agentsam-task-executor.js` | javascript | 46KB |
| `src/api/oauth.js` | javascript | 44KB |
| `src/api/mail.js` | javascript | 44KB |
| `scripts/agentsam-command-workflow-designer.py` | python | 43KB |
| `scripts/agentsam-true-e2e-workflow-runner.py` | python | 42KB |
| `src/api/mcp.js` | javascript | 42KB |
| `src/api/onboarding.js` | javascript | 41KB |
| `scripts/audit/agentsam_mcp_tool_e2e_sprint.py` | python | 40KB |
| `src/api/command-run-telemetry.js` | javascript | 39KB |
| `scripts/agentsam-e2e-workflow-runner.py` | python | 39KB |
| `scripts/smoke/smoke_todo_fix.py` | python | 39KB |
| `scripts/agentsam-planner-challenge.py` | python | 38KB |
| `src/core/workflow-executor.js` | javascript | 37KB |
| `src/api/rag.js` | javascript | 37KB |
| `src/api/settings-sections.js` | javascript | 37KB |
| `scripts/d1_schema_audit.py` | python | 37KB |
| `src/api/storage.js` | javascript | 36KB |
| `scripts/audit/agentsam_route_tool_alignment_e2e.py` | python | 35KB |
| `scripts/smoke_agentsam_latency.py` | python | 35KB |
| `src/index.js` | javascript | 34KB |
| `src/core/retention.js` | javascript | 34KB |
| `src/api/learn.js` | javascript | 33KB |
| `src/api/billing.js` | javascript | 32KB |
| `scripts/audit/iam_cms_agentsam_structure_audit.py` | python | 32KB |
| `src/api/workspaces.js` | javascript | 32KB |
| `src/api/overview-bundle.js` | javascript | 32KB |
| `scripts/agentsam-workflows-frontend-runtime-planner.py` | python | 32KB |
| `scripts/agentsam-capability-fabric-planner.py` | python | 31KB |
| `scripts/agentsam-agent-chat-plan-workflow.py` | python | 30KB |
| `src/api/themes.js` | javascript | 30KB |
| `src/core/routing.js` | javascript | 30KB |
| `src/api/dashboard.js` | javascript | 30KB |
| `src/api/settings-api-keys.js` | javascript | 29KB |

---

## API Routes — 470 found

```
/api/(cms|themes|pages|sections)|cms_
/api/admin/run-retention
/api/agent
/api/agent/*
/api/agent/alignment-sync
/api/agent/approval/pending
/api/agent/approve
/api/agent/artifact
/api/agent/artifact-filters
/api/agent/artifacts
/api/agent/boot
/api/agent/bootstrap
/api/agent/browse
/api/agent/chat
/api/agent/cicd
/api/agent/commands
/api/agent/context-picker/catalog
/api/agent/conversations/search
/api/agent/db/query-history
/api/agent/db/snippets
/api/agent/db/tables
/api/agent/do-history
/api/agent/execute
/api/agent/git/branches
/api/agent/git/repos
/api/agent/git/status
/api/agent/git/sync
/api/agent/github
/api/agent/github/file
/api/agent/github/repos
/api/agent/health
/api/agent/intake
/api/agent/intake/answer
/api/agent/intake/start
/api/agent/keyboard-shortcuts
/api/agent/mcp
/api/agent/memory/list
/api/agent/memory/search
/api/agent/memory/sync
/api/agent/memory/upsert
/api/agent/models
/api/agent/modes
/api/agent/notifications
/api/agent/plan-task/resume
/api/agent/problems
/api/agent/proposals/:id/approve
/api/agent/proposals/:id/deny
/api/agent/proposals/pending
/api/agent/propose
/api/agent/rag/query
/api/agent/rules
/api/agent/session/mode
/api/agent/sessions
/api/agent/subagent-profiles
/api/agent/telemetry
/api/agent/terminal/complete
/api/agent/terminal/config-status
/api/agent/terminal/exec
/api/agent/terminal/run
/api/agent/terminal/socket-url
/api/agent/terminal/status
/api/agent/terminal/ws
/api/agent/today-todo
/api/agent/todo
/api/agent/tool-smoke
/api/agent/tools
/api/agent/vertex-test
/api/agent/workers-ai/image
/api/agent/workflow/approve
/api/agent/workflow/start
/api/agent/workflows/trigger
/api/agents
/api/agentsam
/api/agentsam/agent-chat-plan-trace
/api/agentsam/ai
/api/agentsam/browser/trust
/api/agentsam/config
/api/agentsam/invocations
/api/agentsam/plans
/api/agentsam/prompts
/api/agentsam/skills
/api/agentsam/time
/api/agentsam/workflow-runs/:id
/api/agentsam/workflows
/api/agentsam/workflows/:id
/api/agentsam/workflows/:id/run
/api/agent|agentsam_|mcp
/api/ai
/api/ai/models
/api/ai/providers
/api/analytics/
/api/artifacts
/api/artifacts/{out[
/api/auth
/api/auth-hooks/
/api/auth-hooks/before-user-created
/api/auth-hooks/custom-access-token
/api/auth-hooks/send-email
/api/auth/agent-session/mint
/api/auth/backup-code
... and 370 more
```

---

## D1 Table Map

**`src/core/`**  
- `agentsam_workflow_runs`
- `agentsam_execution_steps`
- `agentsam_plans`
- `agentsam_plan_tasks`
- `agentsam_approval_queue`
- `agentsam_command_run`
- `agentsam_routing_arms`
- `agentsam_model_catalog`
- `agentsam_mcp_tools`
- `agentsam_mcp_tool_execution`
- `agentsam_tool_call_log`
- `agentsam_memory`
- `agentsam_usage_events`
- `agentsam_hook`
- `agentsam_hook_execution`
- `agentsam_guardrails`
- `agentsam_feature_flag`
- `agentsam_ai`

**`src/api/`**  
- `agent_sessions`
- `agent_messages`
- `agent_costs`
- `agent_model_registry`
- `mcp_services`
- `mcp_agent_sessions`
- `mcp_audit_log`
- `mcp_workspace_tokens`
- `ai_prompts_library`
- `ai_provider_usage`
- `ai_search_analytics`
- `agentsam_skill`
- `agentsam_prompt_routes`
- `agentsam_route_requirements`

**`src/cron/`**  
- `agentsam_cron_runs`
- `agentsam_health_daily`
- `agentsam_usage_rollups_daily`
- `agent_platform_context`
- `ai_compiled_context_cache`


### Inspect — data present, no runtime refs (47 tables)

| Table | Rows |
|-------|------|
| `agent_tool_chain` | 251 |
| `mcp_registered_tools` | 180 |
| `ai_knowledge_chunks` | 236 |
| `agent_intent_execution_log` | 480 |
| `agent_commands` | 124 |
| `agent_sessions` | 1495 |
| `agent_costs` | 1237 |
| `agent_capabilities` | 51 |
| `agent_prompts` | 37 |
| `agent_recipe_prompts` | 53 |
| ... and 37 more | — |

### Extinct — safe to drop

- `ai_usage_log` (0 rows)
- `mcp_prompt_registry` (0 rows)

DROP script: `scripts/sql/drop_extinct_tables.sql`

---

## Key Files by Role

| Role | File |
|------|------|
| Worker entry | `src/index.js` |
| AI routing | `src/core/routing.js` |
| Model selection | `src/core/resolveModel.js` |
| Workflow executor | `src/core/workflow-executor.js` |
| Agent planner | `src/core/agentsam-planner.js` |
| Memory read/write | `src/core/memory.js` |
| MCP tool execution | `src/core/mcp-tool-execution.js` |
| Thompson sampling | `src/core/thompson.js` |
| Route-tool resolver | `src/core/agentsam-route-tool-resolver.js` |
| Capability aliases | `src/core/agentsam-capability-aliases.js` |
| Guardrails | `src/core/guardrails.js` |
| Auth | `src/core/auth.js` |
| Feature flags | `src/core/features.js` |
| Agent chat handler | `src/api/agent.js` |
| MCP handler | `src/api/mcp.js` |
| Workspace tokens | `src/core/workspace-tokens.js` |

---

## Supabase Tables

| Table | Rows | Purpose |
|-------|------|---------|
| `codebase_snapshots` | 3 | Repo snapshot metadata, last 3 retained |
| `codebase_files` | ~2,070 | Per-file records |
| `codebase_chunks` | 6,183 | Chunked content, 1024-dim embeddings |
| `codebase_symbols` | 1,035 | Functions, classes, exports |
| `agent_memory` | 119 | Structured memory, embedded, synced from D1 |
| `knowledge_edges` | 82 | Semantic graph — tool taxonomy, route→capability |
| `documents` | 698 | Knowledge docs with embeddings |

---
*Auto-generated by `scripts/generate_source_map.py` — do not edit manually.*