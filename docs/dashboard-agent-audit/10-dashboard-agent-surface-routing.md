# Chunk 10 — Surface routing

**Status:** Draft

## Purpose
CustomEvents that open browser, code, canvas, R2 from agent without new buttons.

## Live production scope
iam:* events in App.tsx + useAgentChatStream. — **https://inneranimalmedia.com/dashboard/agent** only. UI source: **`dashboard/`** only.

## Existing live code paths
- dashboard/App.tsx — iam:agent-open-surface, handleBrowserNavigateFromAgent
- useAgentChatStream — onBrowserNavigate, surface_open
- AgentMessageList — surface dispatch

## What is ALREADY engineered
surface browser/code/excalidraw/r2; browser blocks /api/r2/file URLs.

## What is PARTIALLY engineered
Mobile toasts to return to chat.

## What is BROKEN
Race: narrow viewport overlay vs open code (mitigated revealMainWorkspaceIfNarrow).

## UX reality today
Agent opens tabs remotely; user may not see change on mobile until back.

## Data / event / execution flow
SSE tool_done → onBrowserNavigate → CustomEvent → App tab state

## Validation commands
```bash
rg iam:agent-open-surface dashboard
rg onBrowserNavigate useAgentChatStream
```

## Acceptance criteria
- [ ] All paths verified with `rg` on current main
- [ ] No references to `agent-dashboard/` as live source
- [ ] Repair IDs linked in chunk 25

## Repair backlog IDs
_None assigned yet — add when triage complete._

## Immediate next implementation step
Single diagram of all iam-* events on agent page.
