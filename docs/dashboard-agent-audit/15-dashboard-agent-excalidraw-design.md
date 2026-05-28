---
title: "Dashboard Agent — Excalidraw Design (Reference)"
category: agentsam
updated: 2026-05-28
importance: low
surface: /dashboard/agent
---

# Excalidraw / design tab (reference)

| UI | Notes |
|----|-------|
| `ExcalidrawView` (lazy) | Tab `excalidraw` from agent shell |
| SSE | `surface_open` / plan map on `tool_done` (`useAgentChatStream`) |
| Design studio route | `/dashboard/design` — separate lazy page, not agent shell |

Agent tools may open excalidraw surface via capability router (`10`).

**Deploy:** excalidraw chunk in `static/dashboard/app/vendor-*` — verify 200 after frontend deploy (`02`).
