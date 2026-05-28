---
title: "Dashboard Agent — Shell Layout"
category: agentsam
updated: 2026-05-28
importance: high
surface: /dashboard/agent
---

# Agent shell (`/dashboard/agent`)

## Route

| Constant | Path |
|----------|------|
| `AGENT_HOME_PATH` | `/dashboard/agent` |
| `AGENT_QUICKSTART_PATH` | `/dashboard/agent/quickstart` |

`isAgentShellPath()` keeps **ChatAssistant + workspace tabs mounted** instead of lazy `Routes` pages (`dashboard/lib/agentRoutes.ts`, `dashboard/App.tsx`).

## Layout (production)

```
App.tsx (agent shell)
├── Activity rail (Files, Search, Git, DB, MCP, …)
├── Center workbench tabs: workspace | code | browser | terminal | excalidraw | …
├── Agent column: ChatAssistant (left/right/off via agentPosition)
├── StatusBar (health, deploy line, cursor, notifications)
└── XTermShell (in-layout on agent routes; global drawer on other routes)
```

**Eager imports** (not code-split): `ChatAssistant`, `MonacoEditorView`, `BrowserView`, `XTermShell`, `LocalExplorer` — see `App.tsx` line ~86 comment.

## Key state bridges

| State | File | Fed to chat |
|-------|------|-------------|
| `activeFile` | `EditorContext` + `App.tsx` | `active_file_*` form fields |
| `ideWorkspace`, `recentFiles` | `ideWorkspace.ts` | debounced PUT `/api/agent/workspace/:conversationId` |
| `activeAgentRunId` | `App.tsx` | `ToolApprovalModal` poll, browser metadata |
| `browserUrl` / open tabs | `App.tsx` | `workspaceContext` JSON on chat POST |

## Workbench tab open paths

- **Code:** `openTab('code')` + `MonacoEditorView`  
- **Browser:** `openTab('browser')` + `BrowserView`  
- **Terminal:** `openTab('terminal')` or `XTermShell` drawer (`Cmd+J`)  
- **Agent-driven:** SSE `surface_open` / `agent_surface_open` → `useAgentChatStream` callbacks  

## Failure modes

| Symptom | Likely cause |
|---------|----------------|
| Blank main, shell OK | Wrong R2 HTML/JS prefix (`agent/` vs `app/`) — see `02` |
| Agent column missing | `agentPosition === 'off'` or narrow viewport layout |
| Tabs empty after refresh | No `conversationId` → IDE hydrate skipped |
| Double terminal | Agent route uses in-layout shell; non-agent uses bottom drawer |

## Cursor gap

Shell density is high; **concurrent agent lanes** and **trustworthy global progress** are weaker than Cursor — streaming state is per-chat bubble, not a unified run timeline.

## Files

- `dashboard/App.tsx` — shell composition  
- `dashboard/lib/agentRoutes.ts` — path guards  
- `dashboard/src/EditorContext.tsx` — editor tabs  
- `dashboard/components/StatusBar.tsx` — footer chrome  
