---
title: "Dashboard Agent — Chat SSE Stream"
category: agentsam
updated: 2026-05-28
importance: critical
surface: /dashboard/agent
---

# Chat SSE stream (priority #1)

## UI → network

| Step | Location |
|------|----------|
| Send | `ChatAssistant.tsx` ~1441–1543 — `FormData` + `fetch` stream reader |
| Parse | `useAgentChatStream.ts` — `consumeAgentChatSseBody` ~235–1453 |
| Debug | `streamDebug.ts` → `window.__IAM_AGENT_LAST_STREAM_DEBUG` |

```
POST /api/agent/chat
Content-Type: multipart/form-data
credentials: same-origin
Optional header: x-iam-workspace-id
```

### Form fields (operational)

`message`, `mode` / `agent_mode`, `model`, `provider`, `conversationId`, `workspace_id`, `contextMode`, `browserContext` (JSON incl. `dashboard_route`), `workspaceContext` (JSON: tabs, `browserUrl`, `plan_id`), `active_file_*`, attachments `files`, subagent fields.

`browserContext.dashboard_route` = `window.location.pathname` — drives surface routing (see `10`).

### Wire format

```
data: {"type":"<event>", ...}\n\n
```

Terminator: `data: [DONE]\n\n` or `{ "type": "done" }`.

## Worker chain

```
src/index.js
  → production-dispatch.js (POST /api/agent/*)
    → handleAgentApi → agentChatSseHandler (agent.js ~6227)
```

`emit(type, payload)` (~7836): writes SSE lines to `TransformStream`.

### Handler branch order

1. Auth + workspace (401 / `WORKSPACE_CONTEXT_MISSING`)  
2. `resolveAgentCommand` (slash commands)  
3. ASK fast path  
4. `resolveSurfaceWorkflowPreflightExecution` (browser/monaco preflight)  
5. `resolveWorkflowForMessage` (incl. `/dashboard/agent`)  
6. Long plan pipeline (`plan_*` events)  
7. Image fast path  
8. Default: `emit('context')` + `runAgentToolLoop` (~8197)  

## Tool events (loop ~4484–4874)

| Event | When |
|-------|------|
| `tool_blocked` | max calls, validation, guardrail |
| `tool_error` | bad args / exec failure |
| `approval_required` | `needsApproval` → `agentsam_approval_queue` |
| `tool_start` | before dispatch — `{ tool_name, input_preview }` |
| `tool_output` | streaming chunk |
| `tool_done` | completion — duration, status |
| `tool_result` | model-facing summary |
| `surface_open` | excalidraw / capability surfaces |

### UI handling gaps

| Bug | Detail |
|-----|--------|
| `tool_blocked` label | Worker sends `tool`; UI reads `tool_name` (`useAgentChatStream` ~478) |
| `tool_approval_request` | **Never emitted** by Worker; handler exists in UI |
| Queue drain | Next queued user message may send while approval pending (`ChatAssistant` ~1588) |
| Stream safety stop | `MAX_EMPTY_RUN` / 900s caps can kill tool-heavy runs with little visible text |

## Approval paths (see `12`)

- Plan terminal: `approval_required` + `POST /api/agent/plan-task/resume`  
- Generic queue: `ToolApprovalModal` polls `GET /api/agent/approval/pending` — **no SSE resume** after PATCH approve  
- Inline: `POST /api/agent/chat/execute-approved-tool`  

## Related endpoints

| Route | Role |
|-------|------|
| `POST /api/agent/chat` | Main SSE |
| `POST /api/agent/chat/execute-approved-tool` | Approved tool completion |
| `POST /api/agent/plan-task/resume` | Plan task SSE resume |
| `GET/PATCH /api/agent/approval/*` | Queue poll/approve |

## Cursor gap

Single chat stream works, but **approval fragmentation**, **weak tool timeline**, and **silent stream aborts** break “autonomous orchestration” trust.

## Files

`useAgentChatStream.ts`, `ChatAssistant.tsx`, `streamParsing.ts`, `src/api/agent.js`, `src/core/production-dispatch.js`
