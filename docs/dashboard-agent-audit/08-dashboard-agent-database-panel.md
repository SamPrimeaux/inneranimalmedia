---
title: "Dashboard Agent — Database Panel (Reference)"
category: agentsam
updated: 2026-05-28
importance: low
surface: /dashboard/agent
---

# Database panel (reference)

| UI | Route |
|----|-------|
| `DatabaseBrowser` in agent shell | Activity tab `database` |
| SQL safety | `dashboard/src/lib/databaseSqlSafety.ts` |
| Agent tools | `d1_query` / `d1_write` via chat (write = approval) |

`browserContext.databaseContext` may be sent on chat POST for schema-aware prompts.

**Lanes:** D1 tools use `env.DB` only — not Supabase (`rule_database_tool_surfaces_d1_supabase`).

Approvals: `12`. Surface tools: `10`.
