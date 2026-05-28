---
title: "Dashboard Agent — Memory and Indexing"
category: agentsam
updated: 2026-05-28
importance: high
surface: /dashboard/agent
---

# Memory and indexing

## Workbench UI

`KnowledgeSearchPanel.tsx` — thread list via `GET /api/agent/sessions`; search intended via RAG.

**Production bug:** panel `POST /api/rag/query` — **route not implemented**. Use:

- `POST /api/rag/search` (`handleRagSearchRoute`)  
- `POST /api/agent/rag/query` (`unifiedRagSearch` in `agent.js`)

## D1 operational memory

**`agentsam_memory`** — key/value (`memory_type`, `user_id`, `key`, `value`). Agent tools: `src/tools/memory.js`. List API: `GET /api/agent/memory/list` returns `{ items: [...] }`.

**Not** Supabase `agent_memory` (vectors) — separate lane per workspace rules.

## Semantic / codebase index (Supabase + queues)

| Job | Handler | Target |
|-----|---------|--------|
| `codebase_index_sync` | `src/queue/codebase-index-sync.js` | `codebase_files`, `codebase_chunks` |
| R2 doc puts | `src/queue/docs-vectorize.js` | `VECTORIZE_DOCS` |
| Playwright | `playwright-queue-job.js` | `playwright_jobs` |

Requires `HYPERDRIVE` for `POST /api/agent/memory/upsert` (curated → Supabase `agent_memory`).

## Terminal bootstrap bug

`TerminalSessionPane` treats `/api/agent/memory/list` as bare array — API returns `{ items }` → startup greeting path broken (related to `14`).

## Failure modes

| Symptom | Cause |
|---------|--------|
| Knowledge search always fails | Wrong `/api/rag/query` path |
| Agent “forgets” | D1 memory not written; wrong `user_id` scope |
| Stale RAG | Queue not consumed; missing `route-map.md` priority files |
| Semantic vs KV mixed | Writing to wrong table schema |

## Cursor gap

Memory should be **automatic session summary + codebase awareness** without manual panel; search dead URL blocks operator trust.

## Files

`KnowledgeSearchPanel.tsx`, `memory.js`, `src/core/memory.js`, `rag.js`, `codebase-index-sync.js`, `TerminalSessionPane.tsx`
