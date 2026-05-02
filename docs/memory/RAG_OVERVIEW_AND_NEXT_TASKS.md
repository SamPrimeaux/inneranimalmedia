# Agent Sam RAG & sync — overview and next tasks

**Deployed:** 2026-03-09. Worker Version ID `ab5c16ac-afaf-42ab-a197-b4e033a4dd71`. Deploy recorded in D1 with `TRIGGERED_BY=agent`.

---

## What’s in place (no manual sync needed)

### 1. Chat compaction → R2

- **compactAgentChatsToR2(env)** reads the last **48 hours** of `agent_messages` from D1, groups by `conversation_id`, and writes one markdown file per day to R2:
  - **Key:** `memory/compacted-chats/YYYY-MM-DD.md`
  - Content: conversation IDs, user/assistant snippets (max 800 chars per message), timestamps. Keeps RAG-relevant context without storing full raw logs in the index.

### 2. Memory indexing → Vectorize

- **indexMemoryMarkdownToVectorize(env)** lists and chunks:
  - **memory/daily/** — daily logs
  - **memory/compacted-chats/** — compacted chats (from step 1)
  - **memory/schema-and-records.md** — schema/canonical tables
  - **memory/today-todo.md** — today's to-do (realtime production list; also in D1 `agent_memory_index` key `today_todo`)
- Chunks are embedded with **@cf/baai/bge-large-en-v1.5** (1024 dims) and upserted into **VECTORIZE** (ai-search-inneranimalmedia-aisearch). Same index used by **autorag** and `/api/agent/rag/query`.

### 3. Daily cron (6 AM UTC)

- **0 6 * * *** runs in order:
  1. **compactAgentChatsToR2** — D1 → R2 `memory/compacted-chats/YYYY-MM-DD.md`
  2. **indexMemoryMarkdownToVectorize** — R2 memory markdown → Vectorize

So each day:
- New daily logs you upload to R2 (`memory/daily/`) are picked up.
- Recent agent chats (last 48h) are compacted and written to R2, then indexed.
- No need to manually run sync unless you want an immediate re-index.

### 4. APIs for on-demand use

- **POST /api/agent/rag/compact-chats**  
  Compacts last 48h of chats to R2 now.  
  Body (optional): `{ "then_index": true }` to also run index-memory after.

- **POST /api/agent/rag/index-memory**  
  Re-indexes all memory markdown (daily, compacted-chats, schema) into Vectorize now.

Use these from the Agent UI (e.g. “Re-index memory” or Terminal) when you’ve just uploaded a daily log or want RAG to reflect the latest chats immediately.

---

## Next tasks to improve / finish the system

1. **Fix AI Search “Unacceptable type” errors**  
   In Cloudflare AI Search, 3 items fail: `_docs/agent-overview.md`, `_docs/user.md`, `_docs/metrics.md`. Adjust the AI Search data source (path/type rules or allowlist) so these are accepted, or exclude them if they’re not needed for RAG.

2. **Optional: LLM summarization for compacted chats**  
   Right now compaction is a structured dump (snippets + timestamps). For stronger “compact and search” behavior, add an optional step that summarizes each conversation (or last N turns) with Workers AI and appends that summary to the compacted file before indexing. Would improve retrieval quality at the cost of one extra LLM call per run.

3. **Return-to-agent after OAuth**  
   After “Connect Google Drive” / “Connect GitHub”, users land on `/dashboard/overview`. Add a `return_to` (or similar) query param to the OAuth start URLs so they can land back on `/dashboard/agent` when coming from the agent chat.

4. **Drive / GitHub file pickers**  
   Connect buttons are wired; “attach from Drive/GitHub” still needs backend APIs (list files, select one, attach to message). Implement when you want in-chat file selection from those sources.

5. **Time documentation fix**  
   Roadmap step **step_time_documentation** is open: timer never stops, not user-aware, validity/caps. See `docs/memory/agent-plans/time-documentation-fix.md` and D1 `roadmap_steps` for the plan.

6. **Bootstrap / daily log freshness**  
   Keep uploading `docs/memory/daily/YYYY-MM-DD.md` to R2 `memory/daily/` after each significant day (e.g. via `./scripts/with-cloudflare-env.sh ./scripts/upload-daily-log-to-r2.sh YYYY-MM-DD`). The 6 AM cron will index it; bootstrap also reads it for that day’s context.

7. **Quick “Re-index memory” in Agent UI**  
   Add a small button or menu item in the agent chat that calls `POST /api/agent/rag/index-memory` (and optionally `POST /api/agent/rag/compact-chats` with `then_index: true`) so you can trigger a full sync from the UI without opening Terminal or curl.

   **Update:** Done. The + popup now has "Re-index memory" and "Compact & re-index" buttons.

---

## Reference

- **RAG pipeline detail:** `docs/memory/RAG_MEMORY_PIPELINE.md`
- **Worker:** `worker.js` — `compactAgentChatsToR2`, `indexMemoryMarkdownToVectorize`; cron `0 6 * * *`; routes `/api/agent/rag/compact-chats`, `/api/agent/rag/index-memory`
- **D1:** `agent_messages`, `agent_sessions` (canonical chat tables)
- **R2 (iam-platform):** `memory/daily/`, `memory/compacted-chats/`, `memory/schema-and-records.md`
