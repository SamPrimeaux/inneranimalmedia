---
title: "Dashboard Agent — Mobile Operator UX"
category: agentsam
updated: 2026-05-28
importance: high
surface: /dashboard/agent
---

# Mobile operator UX

## Breakpoint

`isNarrowViewport`: `matchMedia('(max-width: 767px)')` (`dashboard/App.tsx` ~473–485).

## Mobile-specific UI

| Feature | Implementation |
|---------|----------------|
| More tools sheet | `mobileMoreOpen` + bottom sheet (`md:hidden` trigger ~2663) |
| Edge swipe back | `mobileEdgeSwipeHandlers` when `narrowNeedsBack` (~2123) |
| Agent position | `agentPosition` persisted to `localStorage` only when **not** narrow (~487–494) |
| Chat/repo drawer | `githubExpandRepo` for GitHub panel on small screens |

Desktop-only: top chrome “More” menu (`hidden md:block` ~2714).

## Layout risks on mobile

- **Three-pane IDE** (rail + workbench + chat) competes for width; chat often `agentPosition` right or full-width stack.  
- **Monaco + Browser + Terminal** tabs share one column — switching tabs is manual; no split editor.  
- **Tool approval modal** must remain reachable while keyboard open — `ToolApprovalModal` uses route gate `/dashboard/agent`.  
- **Terminal:** `XTermShell` height capped with status/mobile chrome (~1151).

## Chat on mobile

Same `ChatAssistant` + `POST /api/agent/chat` SSE as desktop. No separate mobile API. Composer placeholder: `Message Agent Sam...` (E2E spec).

## Failure modes

| Symptom | Cause |
|---------|--------|
| Cannot reach MCP/Browser | Hidden behind “More tools” sheet |
| Swipe navigates away unintentionally | Edge swipe handler on main column |
| Approvals missed | Modal + poll UI small; queue drain may send next message |
| PTY unusable | xterm fit + virtual keyboard overlap |

## Cursor gap

Mobile is **responsive shell**, not **operator-first** single-column agent mode. No dedicated “agent-only” mobile layout with execution log pinned.

## Files

- `dashboard/App.tsx` — `isNarrowViewport`, `mobileMoreOpen`, swipe handlers  
- `dashboard/src/components/ToolApprovalModal.tsx` — route-scoped poll  
