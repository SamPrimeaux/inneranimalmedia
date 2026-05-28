# Chunk 09 — Chat SSE stream

**Status:** Draft

## Purpose
POST /api/agent/chat streaming — tokens, tools, progress, stop.

## Live production scope
ChatAssistant + useAgentChatStream only. — **https://inneranimalmedia.com/dashboard/agent** only. UI source: **`dashboard/`** only.

## Existing live code paths
- dashboard/components/ChatAssistant/hooks/useAgentChatStream.ts
- dashboard/components/ChatAssistant/ChatAssistant.tsx
- dashboard/components/ChatAssistant/components/AgentMessageList.tsx
- dashboard/components/ChatAssistant/streamDebug.ts
- src/api/agent.js — /api/agent/chat

## What is ALREADY engineered
SSE loop, tool_start/tool_done, executionPlan on messages, toolTraceRows, abort/stop.

## What is PARTIALLY engineered
B09-001 — operator-grade progress narrative.

## What is BROKEN
Stream safety limits message in useAgentChatStream; tool pairing via activeToolTraceId.

## UX reality today
Desktop stream ok; mobile hub tabs split context; users want competent working feel.

## Data / event / execution flow
POST chat → SSE events → UI messages + tool traces + surface events

## Validation commands
```bash
rg tool_start useAgentChatStream.ts
rg executionPlan AgentMessageList
```

## Acceptance criteria
- [ ] All paths verified with `rg` on current main
- [ ] No references to `agent-dashboard/` as live source
- [ ] Repair IDs linked in chunk 25

## Repair backlog IDs
| ID | Title | Paths | Expected | Validation |
|----|-------|-------|----------|------------|
| B09-001 | Structured autonomous progress feed | useAgentChatStream.ts | Progress feed UX | SSE test |

## Immediate next implementation step
Map every SSE type string to UI handler in table (B09-001).
