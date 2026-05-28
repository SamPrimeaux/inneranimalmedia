---
title: "Dashboard Agent — Terminal and PTY"
category: agentsam
updated: 2026-05-28
importance: high
surface: /dashboard/agent
---

# Terminal and PTY

## UI

| Component | Role |
|-----------|------|
| `XTermShell.tsx` | Drawer / in-layout terminal on agent routes |
| `TerminalSessionPane.tsx` | xterm + WebSocket |
| `App.tsx` | `terminalRef.current?.runCommand(cmd)` from UnifiedSearchBar |

Agent route: in-layout shell (`!isAgentShellPath` uses global bottom drawer only — `App.tsx` ~3325).

## WebSocket path

```
GET /api/agent/terminal/ws
  → AGENT_SESSION Durable Object (src/do/AgentChat.js)
  → upstream PTY (PTY_SERVICE or TERMINAL_WS_URL + PTY_AUTH_TOKEN)
```

Bootstrap: `GET /api/agent/terminal/config-status` — `terminal_configured`, `terminal_enabled` (from `can_run_pty`).

Resume: `GET /api/terminal/session/resume`.

## Policy gate (required)

```sql
SELECT can_run_pty FROM agentsam_user_policy
WHERE user_id = ? AND workspace_id = ?
```

**Never** use `isSuperAdmin()` for PTY (`.cursorrules` `rule_terminal_policy_gate`).

Implemented in `src/core/terminal.js` (`userCanRunPtyFromPolicy`).

## Agent tool path (non-interactive)

`POST /api/agent/terminal/run` — `src/core/agent-terminal-run.js`, `src/tools/terminal-dispatch.js`.

On `/dashboard/agent` surface, **`terminal_execute` is approval-gated** (`AGENT_DASHBOARD_SURFACE_CAPABILITY_REQUIRES_APPROVAL`).

## D1 (minimal)

| Table | Columns |
|-------|---------|
| `agentsam_user_policy` | `can_run_pty` |
| `terminal_sessions` | `id`, `user_id`, `workspace_id`, `cwd`, `auth_token_hash`, `status` |
| `terminal_connections` | Bridge fallback when env PTY URL missing |

## Production blockers

| Blocker | Symptom |
|---------|---------|
| `can_run_pty = 0` | WS rejected; config-status disabled |
| `AGENT_SESSION` DO missing | 503 on WS |
| PTY backend unset | `terminal_configured: false` |
| Tenant not resolved | `TENANT_CONTEXT_REQUIRED` on WS |
| Memory greeting bug | `TerminalSessionPane` expects array from `/api/agent/memory/list` but API returns `{ items }` |

## Cursor gap

PTY is the **dependable fallback** when browser/MCP fail — policy and backend config must be green; today greeting/memory bootstrap is broken on terminal open.

## Files

`XTermShell.tsx`, `TerminalSessionPane.tsx`, `AgentChat.js`, `terminal.js`, `agent-terminal-run.js`, `dashboard.js` (WS dispatch)
