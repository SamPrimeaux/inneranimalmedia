---
title: "Dashboard Agent — Auth Session (Reference)"
category: agentsam
updated: 2026-05-28
importance: low
surface: /dashboard/agent
---

# Auth session (reference)

**Scope:** Session cookie gates all `/api/agent/*`, `/api/browser/*`, terminal WS.

| Concern | Location |
|---------|----------|
| Sign-in pages | `dashboard/components/auth/*` |
| Session bootstrap | `GET /api/auth/me` in `App.tsx` |
| Workspace header | `x-iam-workspace-id`, `workspace_id` on chat |
| OAuth return | `return_to=/dashboard/agent` on GitHub/Drive starts |

**Blockers:** 401 on chat → missing/expired `session` cookie. `WORKSPACE_CONTEXT_MISSING` → no workspace resolved.

**Deep audits:** chat auth gates in `09`; OAuth explorers in `19`.
