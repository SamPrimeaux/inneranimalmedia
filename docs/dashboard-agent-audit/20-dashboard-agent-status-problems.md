---
title: "Dashboard Agent — Status and Problems (Reference)"
category: agentsam
updated: 2026-05-28
importance: low
surface: /dashboard/agent
---

# Status bar and problems (reference)

| UI | Data |
|----|------|
| `StatusBar.tsx` | cursor, encoding, branch, health, tunnel, terminal ok |
| `warningCount` / `systemProblems` | `App.tsx` — Problems panel commented (`ProblemsDebugPanel`) |
| Agent notifications | `agentNotifications` rows |

Settings link: `/dashboard/agent?tab=problems` referenced from `ToolsMcpSection.tsx`.

**Operator need:** surface tool failures in status bar, not only chat trace — backlog `25` P2.

See `09` for tool trace rows; `24` for health checks.
