# RAG pipeline: memory markdown → Vectorize

## Overview

Markdown files in R2 **iam-platform** under `memory/` are indexed into the Vectorize index **ai-search-inneranimalmedia-aisearch** so Agent Sam’s RAG (and `/api/agent/rag/query`) can retrieve them by semantic search.

## Sources

- **memory/daily/YYYY-MM-DD.md** — daily logs (listed via R2 `list({ prefix: 'memory/daily/' })`).
- **memory/compacted-chats/YYYY-MM-DD.md** — compacted agent chat history from D1 `agent_messages` (last 48h), written by `compactAgentChatsToR2()` so RAG can search recent conversations without manual sync.
- **memory/schema-and-records.md** — schema and canonical tables doc (single key).

## Pipeline

1. **List** — List R2 keys under `memory/daily/` (iam-platform bucket).
2. **Fetch** — Get each key’s body as text; add `memory/schema-and-records.md` if not in the list.
3. **Chunk** — Split markdown by `##` / `#` sections; sub-split long sections into ~600‑char chunks with 80‑char overlap.
4. **Embed** — Workers AI `@cf/baai/bge-large-en-v1.5` (1024 dimensions), in batches of 32 texts.
5. **Upsert** — `env.VECTORIZE.upsert(vectors)` with id `mem-{slug}-{i}`, metadata `{ source, date }`.

## API

- **POST /api/agent/rag/index-memory**  
  Runs the pipeline once. No body required.  
  Returns: `{ indexed: number, chunks: number, error?: string, message?: string }`.

- **POST /api/agent/rag/compact-chats**  
  Compacts last 48h of `agent_messages` from D1 to R2 at `memory/compacted-chats/YYYY-MM-DD.md`.  
  Body (optional): `{ then_index: true }` to also run index-memory after compacting.  
  Returns: `{ conversations, messages, key }` or `{ compact, index }` if `then_index` was true.

## Cron

- **0 6 * * *** (6 AM UTC) — Worker `scheduled()` runs:
  1. **compactAgentChatsToR2(env)** — writes `memory/compacted-chats/YYYY-MM-DD.md` from last 48h of D1 `agent_messages`.
  2. **indexMemoryMarkdownToVectorize(env)** — re-indexes all memory markdown (daily logs, compacted chats, schema) into Vectorize.

  No manual sync needed: daily logs uploaded to R2 and chat activity in D1 are picked up by this cron and vectorized for autorag/search.

## Requirements

- **Vectorize index** must be **384 dimensions**, **cosine** metric (to match `@cf/baai/bge-small-en-v1.5`, same as Cloudflare AI Search inneranimalmedia-aisearch).
  If the existing index has different dimensions, either create a new index with 384 dims and point the binding to it, or change the code to use an embedding model that matches the current index (e.g. `@cf/baai/bge-base-en-v1.5` for 768 dims).
- **R2** binding = iam-platform (memory keys). **AI** binding = Workers AI (embed). **VECTORIZE** binding = index ai-search-inneranimalmedia-aisearch.

## Query

- **POST /api/agent/rag/query** — Body `{ query: "..." }`. Uses `env.AI.autorag('inneranimalmedia-aisearch').search({ query })` and returns matching text chunks. Chat handler also injects RAG context when the last user message is long enough.

## Manual run

After uploading a new daily log to R2 (e.g. `memory/daily/2026-03-09.md`), trigger a re-index:

```bash
curl -X POST https://inneranimalmedia.com/api/agent/rag/index-memory \
  -H "Content-Type: application/json" \
  --cookie "session=YOUR_SESSION"
```

Or from the dashboard/Agent Sam UI, call the same URL (e.g. via Terminal or a “Re-index memory” button if you add one).
