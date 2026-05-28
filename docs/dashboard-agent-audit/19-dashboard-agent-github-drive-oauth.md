---
title: "Dashboard Agent — GitHub Drive OAuth (Reference)"
category: agentsam
updated: 2026-05-28
importance: low
surface: /dashboard/agent
---

# GitHub / Drive OAuth (reference)

| Explorer | OAuth start |
|----------|-------------|
| `GitHubExplorer.tsx` | `/api/oauth/github/start?return_to=/dashboard/agent` |
| `GoogleDriveExplorer.tsx` | `/api/oauth/google/start?connectDrive=1&return_to=/dashboard/agent` |

Saves use `handleSaveFile` branches (`07`). Chat mentions: `mentionContext.ts` tool hints.

**Gap:** OAuth popup flow documented in older audits — verify connect buttons in `ChatAssistant` if integration still missing.

**Not MCP:** OAuth tokens in D1 `user_oauth_tokens` — separate from `MCP_AUTH_TOKEN` (`16`).
