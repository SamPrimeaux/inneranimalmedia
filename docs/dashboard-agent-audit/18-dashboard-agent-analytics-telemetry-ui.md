---
title: "Dashboard Agent — Analytics Telemetry UI (Reference)"
category: agentsam
updated: 2026-05-28
importance: low
surface: /dashboard/agent
---

# Analytics / telemetry UI (reference)

Not primary on `/dashboard/agent` but linked:

| Component | Route |
|-----------|-------|
| `AnalyticsPage` | `/dashboard/analytics` (lazy) |
| `AgentChatPlanTracePanel` | analytics sub-panel |
| Status bar deploy line | `lastDeployLine` in `App.tsx` |
| Stream debug | `__IAM_AGENT_LAST_STREAM_DEBUG` — `24` |

Run/cost truth: D1 `agentsam_agent_run`, `agentsam_tool_call_log` — surfaced partially in chat (`21`).

Agent shell health poll: `healthOk`, `tunnelHealthy` in status bar.
