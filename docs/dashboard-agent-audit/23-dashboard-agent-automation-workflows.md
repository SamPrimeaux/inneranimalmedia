---
title: "Dashboard Agent — Automation Workflows"
category: agentsam
updated: 2026-05-28
importance: high
surface: /dashboard/agent
---

# Automation workflows (agent surface)

## When chat becomes a workflow

1. **Surface preflight** — `resolveSurfaceWorkflowPreflightExecution` returns `execute`  
2. **Message match** — `resolveWorkflowForMessage` + `/dashboard/agent` metadata (`10`)  
3. **Plan pipeline** — long work modes emit `plan_*` / `task_*` SSE events  

Executor: `src/core/workflow-executor.js` — nodes dispatch via **`agentsam_workflow_handlers`** (`handler_key`, `executor_kind`).

## SSE events (workflow path)

`workflow_start`, `workflow_step`, `workflow_complete`, `workflow_error`, `workflow_approval_required`.

UI: partial handling in `useAgentChatStream.ts`; `workflow_approval_required` **not** resumed from ChatAssistant.

## D1 (minimal)

| Table | Role |
|-------|------|
| `agentsam_workflows` | `workflow_key`, `metadata_json` |
| `agentsam_workflow_handlers` | executor binding |
| `agentsam_workflow_runs` | run ledger + `supabase_sync_status` |
| `agentsam_todo` | operator tasks linked from plans |

## Lifecycle (required)

Insert run `status=running` → complete/fail (never delete failed runs) → mirror Supabase → patch D1 sync fields (see workspace alignment rules).

## Failure modes

| Symptom | Cause |
|---------|--------|
| Chat “does nothing” then graph | Unexpected workflow match on surface |
| Stuck after workflow approval | No resume wired in UI |
| Handler not found | Missing `agentsam_workflow_handlers` row |
| `d1_sql` on Postgres table | Wrong `executor_kind` for Supabase lane |

## Cursor gap

Workflows should be **opt-in automations**, not silent hijacks of casual chat on `/dashboard/agent`.

## Files

`workflow-executor.js`, `agent.js` (`executeWorkflowAndStream`), `useAgentChatStream.ts`
