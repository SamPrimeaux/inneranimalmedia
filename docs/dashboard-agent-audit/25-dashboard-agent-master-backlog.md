---
title: "Dashboard Agent — Master Backlog (Production Finish)"
category: agentsam
updated: 2026-05-28
importance: critical
surface: /dashboard/agent
---

# Master backlog — finish production workbench

Ordered by **blocking production quality** on `https://inneranimalmedia.com/dashboard/agent`.

## P0 — execution trust

| ID | Fix | Audit |
|----|-----|-------|
| P0-1 | Unify approval UX + **SSE resume** after queue approve | `12`, `09` |
| P0-2 | Fix `tool_blocked` field mismatch (`tool` vs `tool_name`) | `09` |
| P0-3 | Stop chat queue drain while approval pending | `09` |
| P0-4 | Retarget `KnowledgeSearchPanel` to `/api/rag/search` or `/api/agent/rag/query` | `22` |
| P0-5 | Fix `/api/agent/memory/list` shape for terminal greeting | `14`, `22` |

## P1 — editing and assets

| ID | Fix | Audit |
|----|-----|-------|
| P1-1 | `handleSaveFile` → update `EditorContext.lastSavedContent` | `07` |
| P1-2 | Wire Diff Accept to `apply_change_set` when pending | `07` |
| P1-3 | Enforce `deploy:frontend` in runbooks; deprecate `agent/`‑only sync | `02` |
| P1-4 | Merge `active_file_*` server-side into tool context (optional) | `07` |

## P1 — browser and PTY

| ID | Fix | Audit |
|----|-----|-------|
| P1-5 | Fail-closed browser trust check | `13` |
| P1-6 | Verify `MYBROWSER` + `agentsam_tools` browser rows in prod | `13` |
| P1-7 | Document/script `can_run_pty` enablement per workspace | `14` |

## P2 — orchestration polish

| ID | Fix | Audit |
|----|-----|-------|
| P2-1 | Surface-bound workflow indicator in UI | `10`, `23` |
| P2-2 | Wire `workflow_approval_required` resume | `23` |
| P2-3 | Align MCPPanel catalog with chat `agentsam_tools` | `16` |
| P2-4 | Per-run cost banner from `agentsam_agent_run` | `21` |
| P2-5 | Mobile operator layout (agent-first column) | `03` |

## P2 — validation

| ID | Fix | Audit |
|----|-----|-------|
| P2-6 | Playwright: approval + browser invoke smoke | `24` |
| P2-7 | Post-deploy script: chunk HEAD checks | `02`, `24` |

## Explicitly out of scope

- Full `agentsam_commands` inventory  
- Every MCP server row  
- Historical migrations / abandoned `agent-dashboard` nested package docs  
- New stub audit markdown beyond this series  

## D1 work item registration (when implementing)

Use sprint `plan_may22_2026_agent_sam` or register new `todo_iam_dashboard_agent_*` + matching `task_iam_*` per `.cursor/rules/agentsam-work-item-registration.mdc`.

## Cursor-quality target

One ask → visible plan → tools run with **correct approvals** → editor/browser/terminal stay in sync → honest progress and cost → mobile usable for ops.
