---
title: "Dashboard Agent — Unified Search (Reference)"
category: agentsam
updated: 2026-05-28
importance: low
surface: /dashboard/agent
---

# Unified search (reference)

**Component:** `UnifiedSearchBar.tsx` — Cmd+K in agent shell top chrome.

| Action | Effect |
|--------|--------|
| File pick | `onNavigate` → open editor tab |
| Command | `terminalRef.runCommand(cmd)` |
| Facets | `searchInitialFacets` from `App.tsx` |

Includes autorag facet id `db-autorag` (subtitle only — actual RAG panel is `KnowledgeSearchPanel`).

**Indexing fix:** `22` (broken `/api/rag/query`).
