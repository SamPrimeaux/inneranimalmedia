---
title: "Dashboard Agent — Approvals and Tool Runs"
category: agentsam
updated: 2026-05-28
importance: high
surface: /dashboard/agent
---

# Approvals and tool runs

## Resolution chain (chat)

1. `validateToolCall` — `agentsam_tools` (+ MCP row if linked)  
2. `needsApproval(validation, modeConfig, userPolicy)` — skipped if `auto_run_mode === 'auto'` and mode allows  
3. `createApprovalRequest` → `agentsam_approval_queue`  
4. SSE `approval_required` with `proposal_id`  
5. User action → resume path (see below)

Hard-coded high-risk patterns also in `src/core/tool-registry.js` (`d1_write`, `terminal_execute`, `bash`, …).

## Three approval UX paths

| Path | UI | Approve | Resume stream |
|------|-----|---------|---------------|
| **Plan terminal** | Inline card in `ChatAssistant` | `POST /api/agent/proposals/:id/approve` | `POST /api/agent/plan-task/resume` (SSE) |
| **Queue modal** | `ToolApprovalModal.tsx` | `PATCH /api/agent/approval/:id` | **No** — loop already returned “Awaiting approval” |
| **Inline tool card** | `pendingToolApproval` | `POST /api/agent/chat/execute-approved-tool` | Appends to last bubble |

`ToolApprovalModal` polls only when `pathname.startsWith('/dashboard/agent')` (~54, ~215).

## Tool execution logging

| Table | Role |
|-------|------|
| `agentsam_tool_call_log` | Catalog executor inserts (`catalog-tool-executor.js`) |
| `agentsam_mcp_tool_execution` | MCP hop ledger (`mcp-tool-execution.js`) |
| `agentsam_approval_queue` | Pending/approved/denied proposals |

Read-only tools (`d1_query`, grep-style) should **not** require approval when catalog `requires_approval=0` and policy allows — verify per-row in D1, not docs.

## Production blockers

| Blocker | Impact |
|---------|--------|
| Split approval UX | Operators approve in modal but chat does not continue |
| `tool_approval_request` dead | UI handler never receives Worker event |
| Duplicate pending | `checkApprovalGate` blocks same `user_id`+`tool_name` |
| `execute-approved-tool` HTTP 200 on error | False success in UI |
| `workflow_approval_required` | Points to `/api/agent/workflow/approve` — not wired in ChatAssistant |

## Cursor gap

Cursor: **one inline approval per tool call with automatic resume**. Production: **three paths**, queue path does not reconnect SSE.

## Files

`ToolApprovalModal.tsx`, `ChatAssistant.tsx`, `agent.js` (`needsApproval`, `createApprovalRequest`, `runAgentToolLoop`), `tool-registry.js`, `catalog-tool-executor.js`
