# RAG / Vectorize setup for optimal agent search

The agent uses **Vectorize** (not Cloudflare AutoRAG) for RAG. The worker prefers `env.VECTORIZE_INDEX` (index `ai-search-iam-autorag`), then falls back to `env.VECTORIZE`.

## How the worker resolves content

`vectorizeRagSearch` in worker.js:

1. Embeds the query with `@cf/baai/bge-large-en-v1.5`.
2. Queries the Vectorize index with `index.query(vector, { topK, returnMetadata: 'all' })`.
3. For each match, content is taken in this order:
   - `metadata.text` or `metadata.content` (preferred; no R2 fetch).
   - Else `metadata.source` plus `env.R2.get(metadata.source)` to load text from R2.

So the index must either store **text in metadata** or store **source** as an R2 key that exists in the `R2` bucket.

## Optimal structure for a useful RAG

### 1. What to index

- **Memory:** `memory/daily/YYYY-MM-DD.md`, `memory/schema-and-records.md`, `memory/today-todo.md`, `memory/compacted-chats/`.
- **Docs/knowledge:** `knowledge/*.md`, `docs/*.md` (architecture, APIs, runbooks).
- **Stable reference:** Schema, roadmap steps, canonical table list, deployment checklist.

Keep one source of truth (e.g. R2 markdown) and derive chunks from that so RAG stays consistent.

### 2. Chunking

- Use semantic or fixed-size chunks with overlap so queries hit full sentences.
- Worker uses `chunkMarkdown()` (~600 chars, ~80 overlap) and `@cf/baai/bge-large-en-v1.5` (1024 dims).
- Vectorize index must be **dimensions=1024, metric=cosine** to match that model.

### 3. Metadata on each vector

For **content without R2 fetch** (best for reliability and speed):

- `metadata.text` or `metadata.content`: the chunk text (or a truncated version, e.g. 8–12k chars).
- `metadata.source`: R2 key or doc id (e.g. `memory/daily/2026-03-18.md`).
- Optional: `metadata.date`, `metadata.title` for filtering or display.

If you **do not** store text in metadata:

- `metadata.source` must be an **R2 key** that exists in the bucket bound as `env.R2` (e.g. `iam-platform`). The worker will call `env.R2.get(metadata.source)` to load the object body as text.

### 4. Index population

- **Option A (Cloudflare AI Search / AutoRAG):** If you use AI Search ingestion for `ai-search-iam-autorag`, ensure its output stores either chunk text or a resolvable `source` in metadata. Check the AI Search docs for the exact metadata shape; the worker’s `ragDebug.sampleMatch` shows what the index is returning.
- **Option B (Self-managed Vectorize):** Use the same embedding model (`@cf/baai/bge-large-en-v1.5`). Upsert vectors with `id`, `values`, and `metadata: { source, text }` (or `content`). Prefer storing `text` in metadata so the worker does not depend on R2 for that index.

The worker’s `indexMemoryMarkdownToVectorize()` builds chunks from R2 paths above and prepares `id`, `text`, `source`, `date`; its Vectorize upsert is currently disabled to avoid conflicting with AI Search. To use a self-managed index, enable upsert against **one** index (e.g. `VECTORIZE_INDEX`) and ensure metadata includes `source` and ideally `text`.

### 5. Endpoints for troubleshooting

- `GET /api/agent/rag/status` – bindings present (VECTORIZE_INDEX, VECTORIZE, AI, R2).
- `POST /api/agent/rag/query` – body `{ "query": "..." }`; response includes `ragDebug` (indexUsed, rawMatchCount, resultCount, sampleMatch).
- `POST /api/agent/rag/index-memory` – (re)index R2 memory into the pipeline that feeds your index (when upsert is enabled).

### 6. Quick checklist

- [ ] Vectorize index exists with dimensions=1024, metric=cosine.
- [ ] wrangler has `VECTORIZE_INDEX` (and optionally `VECTORIZE`) bound to that index.
- [ ] Each vector has either `metadata.text`/`metadata.content` or `metadata.source` pointing to an existing R2 key.
- [ ] R2 bucket bound as `R2` contains any keys you use in `metadata.source`.
- [ ] After changes, test with `/api/agent/rag/query` and confirm `ragDebug.resultCount > 0` and `matches` populated.
