---
title: "Dashboard Agent — Workspace Launcher (Reference)"
category: agentsam
updated: 2026-05-28
importance: low
surface: /dashboard/agent
---

# Workspace launcher (reference)

| UI | API |
|----|-----|
| `WorkspaceLauncher` | `GET /api/settings/workspaces` |
| Recent workspaces | `dashboard/src/recentWorkspacesStorage.ts` |
| Theme per workspace | `fetchAndApplyActiveCmsTheme` in `App.tsx` |

Chat uses `workspace_id` + display name in chrome. Wrong workspace → wrong tools scope and R2 paths.

**Blocker:** Theme race after Settings apply — `activeThemeAbortRef` in `App.tsx`.

See `01` for shell; `07` for IDE persist per conversation.
