---
title: "Dashboard Agent — Settings Policy (Reference)"
category: agentsam
updated: 2026-05-28
importance: low
surface: /dashboard/agent
---

# Settings and policy (reference)

| Surface | Path |
|---------|------|
| Settings lazy routes | `/dashboard/settings/*` via `SettingsPanel` |
| Chat policy fetch | `agentsamChatPolicy` state in `App.tsx` |
| Tool allowlist | `POST /api/agent/allowlist` from `ToolApprovalModal` |
| MCP tools editor | `PATCH /api/settings/mcp/tools/:id` — Monaco save path `07` |
| PTY policy | `agentsam_user_policy.can_run_pty` — `14` |

**Rules tab:** `dashboard/components/settings` — subagents, skills (not expanded here).

Auto-run / approval modes affect `needsApproval` in `12`.
