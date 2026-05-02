# AutoRAG/Search System Audit

**Date:** 2026-03-17  
**Scope:** worker.js, wrangler.production.toml, agent-dashboard search UI. No code changes — mapping only.

---

## 1. Search & Indexing Systems Audit

### System 1: AI Search (Cloudflare AutoRAG)

| Field | Value |
|-------|--------|
| **Location** | worker.js lines 729-730, 1606, 3240, 3888, 4534 |
| **Purpose** | Primary search backend: `env.AI.autorag('inneranimalmedia-aisearch').search({ query })` or `.aiSearch({ query, stream: false })`. Used by RAG query endpoint, chat context, MCP tool, and runToolLoop. |
| **R2 Source** | None directly. AI Search is a Cloudflare product; index is configured separately (see Vectorize). |
| **Vectorize Index** | Same index backs AI Search: **ai-search-inneranimalmedia-aisearch** (binding `VECTORIZE`, index_name in wrangler line 62). |
| **Status** | **Unclear.** Depends on Cloudflare AI Search being wired to the Vectorize index and returning the shape the code expects. |
| **Connected to UI** | Yes. "Search knowledge base" calls `/api/agent/rag/query`, which uses only this. |

**Response shape expected in worker:**  
- `/api/agent/rag/query` (3888-3894) and chat context (3242-3246) expect: `results.data` = array of `{ content: [ { type: 'text', text: string } ] }`.  
- `invokeMcpToolFromChat` (4534-4539) accepts `results ?? data` and `r.content ?? r.text`.  
If AI Search returns a different shape (e.g. `results` instead of `data`, or top-level `text`), the UI and context paths can get empty `matches`.

---

### System 2: Vectorize direct query (fallback)

| Field | Value |
|-------|--------|
| **Location** | worker.js 4540-4565 (inside `invokeMcpToolFromChat` for `knowledge_search`) |
| **Purpose** | When AI Search returns 0 results, embed the query with `RAG_MEMORY_EMBED_MODEL`, query `env.VECTORIZE.query(vector, { topK: 5, returnMetadata: 'all' })`, then fetch full text from `env.R2.get(source)` for each match. |
| **R2 Source** | **iam-platform** (binding `env.R2`). Keys in metadata are R2 keys (e.g. `memory/daily/2026-03-17.md`, `knowledge/...`). |
| **Vectorize Index** | Same: **VECTORIZE** → **ai-search-inneranimalmedia-aisearch** |
| **Status** | **Working** only if index is populated with 1024-dim vectors (bge-large) and metadata contains R2 keys that exist in **iam-platform**. |
| **Connected to UI** | No. Only used when the MCP tool `knowledge_search` is invoked from chat; the UI search does not call this path (it only hits `/api/agent/rag/query`, which has no fallback). |

---

### System 3: POST /api/admin/vectorize-kb (D1 → Vectorize)

| Field | Value |
|-------|--------|
| **Location** | worker.js 335-384 |
| **Purpose** | Index D1 table `ai_knowledge_base` (rows with `is_indexed=0`) into Vectorize. Chunks with `chunkByTokenApprox(..., 2048, 200)`, embeds with **@cf/baai/bge-base-en-v1.5**, upserts to `env.VECTORIZE`. Optionally inserts into `ai_knowledge_chunks`. |
| **R2 Source** | None. Source is D1 only. |
| **Vectorize Index** | **VECTORIZE** → **ai-search-inneranimalmedia-aisearch** (single index). |
| **Status** | **Broken / mismatch.** bge-base-en-v1.5 outputs **768 dimensions**. The rest of the codebase (and comment at 5446) assumes the index is **1024 dimensions** (bge-large-en-v1.5). A single Vectorize index cannot mix 768- and 1024-dim vectors; vectorize-kb would either fail on upsert or the index is 768 and then memory/codebase indexing (1024) would be wrong. |
| **Connected to UI** | No. Admin-only endpoint. |

---

### System 4: indexMemoryMarkdownToVectorize (R2 → Vectorize)

| Field | Value |
|-------|--------|
| **Location** | worker.js 5449-5556 |
| **Purpose** | List R2 keys under `memory/daily/`, `memory/compacted-chats/`, `knowledge/`, `docs/`, plus fixed keys `memory/schema-and-records.md`, `memory/today-todo.md`. Chunk with `chunkMarkdown`, embed with **@cf/baai/bge-large-en-v1.5** (1024 dims), upsert to `env.VECTORIZE` with metadata `{ source, date }`. |
| **R2 Source** | **iam-platform** (env.R2). Prefixes: `memory/daily/`, `memory/compacted-chats/`, `knowledge/`, `docs/`. |
| **Vectorize Index** | **VECTORIZE** → **ai-search-inneranimalmedia-aisearch** |
| **Status** | **Working** only if index is 1024 dims, cosine. Runs on: POST `/api/agent/rag/index-memory`, optional after `/api/agent/rag/compact-chats` (`then_index`), and in cron (5084). |
| **Connected to UI** | No. Used by admin/cron and compact-chats. |

---

### System 5: performCodebaseIndexing (R2 DASHBOARD source/ → Vectorize)

| Field | Value |
|-------|--------|
| **Location** | worker.js 5560-5622, handler 5624-5637 |
| **Purpose** | List **env.DASHBOARD** (agent-sam bucket) prefix `source/`, filter `.js`, `.jsx`, `.md`. Chunk by lines with `chunkCodeFile`, embed with **bge-large-en-v1.5**, upsert to `env.VECTORIZE` with metadata `{ type: 'code', source, start_line, end_line, language }`. |
| **R2 Source** | **agent-sam** (env.DASHBOARD), prefix **source/** (worker, agent-dashboard, mcp-server, docs). |
| **Vectorize Index** | **VECTORIZE** → **ai-search-inneranimalmedia-aisearch** |
| **Status** | **Working** only if index is 1024 dims. Invoked by POST `/api/admin/reindex-codebase` (sync or async). |
| **Connected to UI** | No. Admin-only. |

---

### System 6: Embedding models and constants

| Item | Location | Value |
|------|----------|--------|
| RAG_MEMORY_EMBED_MODEL | 5140 | `@cf/baai/bge-large-en-v1.5` (1024 dims) |
| vectorize-kb embed model | 348 | `@cf/baai/bge-base-en-v1.5` (768 dims) |
| RAG_EMBED_BATCH_SIZE | 5143 | 32 |
| chunkMarkdown | 5166, 5476 | Used by indexMemoryMarkdownToVectorize |
| chunkByTokenApprox | 5148, 357 | Used by vectorize-kb and elsewhere |

---

## 2. Agent Sam Search Flow (User clicks "Search knowledge base")

1. **UI**  
   - AgentDashboard.jsx 2424: Connector popup item "Search knowledge base" sets `setKnowledgeSearchOpen(true)`, clears query/results.  
   - 2538-2539: User types in `knowledgeSearchQuery`.  
   - 360-426: `useEffect` when `knowledgeSearchOpen` and `knowledgeSearchQuery.trim().length >= 2`: after 300ms debounce, runs in parallel:
     - `GET /api/r2/buckets`
     - **`POST /api/agent/rag/query`** with `body: JSON.stringify({ query })`
     - `GET /api/agent/conversations/search?q=...`
   - Then for each bucket from buckets API: `GET /api/r2/search?bucket=...&q=...`.
   - RAG result: `kbData.matches` (array) — each item rendered as type `"knowledge"` with title/source from string or object (404-409). So the UI expects **matches** to be an array (of strings or objects with at least something to show).

2. **Endpoint**  
   - **POST /api/agent/rag/query** (worker.js 3883-3897).  
   - Reads `body.query` or `body.q`, calls:
     - `env.AI.autorag('inneranimalmedia-aisearch').search({ query: query.trim() })`
   - Parses: `chunks = (results?.data || []).flatMap(r => r.content || []).filter(c => c.type === 'text').map(c => c.text)`.  
   - Returns `jsonResponse({ matches: chunks, count: chunks.length })`.  
   - **No Vectorize fallback.** No `env.R2` used in this path. If AI Search returns empty or a different shape, UI gets empty matches.

3. **Which Vectorize index**  
   - The same one used by AI Search: **ai-search-inneranimalmedia-aisearch** (backed by binding **VECTORIZE**). The endpoint does not query Vectorize directly; it goes through AI Search only.

4. **Which R2 buckets**  
   - For the **RAG part** of "Search knowledge base": **none**. The RAG request does not read R2. The UI also fetches R2 bucket list and runs `/api/r2/search` per bucket; those are separate from RAG and fill the same result list with type `"file"` and `"chat"` results.

---

## 3. Vectorize Configuration

- **wrangler.production.toml** (60-62):
  - One Vectorize binding only:
    - `binding = "VECTORIZE"`
    - `index_name = "ai-search-inneranimalmedia-aisearch"`

- **Worker usage of env.VECTORIZE:**
  - 342, 372: vectorize-kb (admin) — `env.VECTORIZE.upsert`
  - 3902, 3922: index-memory and compact-chats — check and call `indexMemoryMarkdownToVectorize` which uses `env.VECTORIZE.upsert`
  - 4547: invokeMcpToolFromChat knowledge_search fallback — `env.VECTORIZE.query(vector, { topK: 5, returnMetadata: 'all' })`
  - 5519-5520, 5562, 5609-5610: indexMemoryMarkdownToVectorize and performCodebaseIndexing — `env.VECTORIZE.upsert`

**Summary:**  
- **One index** in config: **ai-search-inneranimalmedia-aisearch**.  
- **One binding:** **VECTORIZE**.  
- **Queried directly** only in the knowledge_search Vectorize fallback (4547).  
- **Upserted** by: vectorize-kb (768-dim — mismatch), indexMemoryMarkdownToVectorize (1024-dim), performCodebaseIndexing (1024-dim).

---

## 4. R2 Source Buckets (for search/indexing)

From **getR2Binding** (2094-2100):

- **agent-sam** → **env.DASHBOARD**  
  - **Indexable content:** `source/` (worker, agent-dashboard, mcp-server, docs).  
  - **Indexing function:** `performCodebaseIndexing(env)` only.  
  - **When:** POST `/api/admin/reindex-codebase` (manual or async).

- **iam-platform** → **env.R2**  
  - **Indexable content:**  
    - `memory/daily/*.md`, `memory/compacted-chats/*.md`, `knowledge/*`, `docs/*`, plus `memory/schema-and-records.md`, `memory/today-todo.md`.  
  - **Indexing function:** `indexMemoryMarkdownToVectorize(env)`.  
  - **When:** POST `/api/agent/rag/index-memory`, optional after POST `/api/agent/rag/compact-chats` (`then_index`), and in cron (5084).

**Other R2 writes (for context):**  
- Post-deploy and knowledge sync write to **env.R2** (iam-platform): `knowledge/architecture/worker-structure.md`, `knowledge/database/schema.md`, `knowledge/rules/cursor-rules.md`, `knowledge/memory/daily-*.md`, `knowledge/priorities/current.md`, etc.  
- Compacted chats write to **env.R2**: `memory/compacted-chats/YYYY-MM-DD.md`.  
- Daily digest can write **env.R2**: `memory/daily/YYYY-MM-DD.md`.

---

## 5. SSE/Monaco Integration (search/RAG relevance)

- **agent-dashboard/src:**  
  - AgentDashboard.jsx 223: state type related to SSE.  
  - 961, 968, 994: streaming chat response (fetch with `stream: useStreaming`, parsing `text/event-stream`).  
- **Conclusion:** SSE is used for **chat streaming**, not for the "Search knowledge base" RAG request. The search flow is a normal POST to `/api/agent/rag/query` and does not use EventSource or stream for results.

---

## 6. Current User Flow (Summary)

1. User clicks **"Search knowledge base"** and types a query (min 2 chars).  
2. UI calls **POST /api/agent/rag/query** with `{ query }`.  
3. Worker calls **env.AI.autorag('inneranimalmedia-aisearch').search({ query })** only.  
4. Worker parses **results.data[].content[].text** (type === 'text') into `matches` and returns `{ matches, count }`.  
5. If that shape is wrong or AI Search returns nothing, **matches** is empty and the UI shows "No matches" for the knowledge part.  
6. **Vectorize and R2 are not used** in this endpoint; the fallback that uses Vectorize + R2 exists only for the MCP tool `knowledge_search` (invokeMcpToolFromChat), not for the UI search.

---

## 7. The Problem (Why code might not be “found”)

- **Response shape:** `/api/agent/rag/query` and the chat context assume AI Search returns `results.data` with `content[]` and `type: 'text'`, `text`. If the product returns `results.results` or a different structure, parsing yields empty arrays and the UI shows no knowledge results.  
- **No fallback in UI path:** The only place that does Vectorize + R2 fallback is `invokeMcpToolFromChat` (tool call from chat). The "Search knowledge base" UI does not trigger that; it only hits `/api/agent/rag/query`, which has no fallback. So even if Vectorize is populated, the UI search never uses it.  
- **Index dimension mismatch:** vectorize-kb uses 768-dim embeddings (bge-base) while the rest of the system assumes 1024-dim (bge-large). With a single index, one of these is wrong: either vectorize-kb fails or memory/codebase indexing is incompatible with the index.

---

## 8. The Solution (Single focused fix)

- **Option A (recommended):** Make **POST /api/agent/rag/query** use the same logic as the MCP `knowledge_search` in `invokeMcpToolFromChat`: call AI Search first; if `results.length === 0`, run the Vectorize + R2 fallback (embed query, query VECTORIZE, fetch from R2, return same `matches` shape). That way the UI search can find content that is in Vectorize/R2 even when AI Search returns nothing, and one code path handles both shapes (results/data, content/text).  
- **Option B:** If the goal is to rely only on AI Search, then fix the response parsing in `/api/agent/rag/query` (and chat context) to match the **actual** AI Search response shape (e.g. use `results?.results ?? results?.data` and `r.content ?? r.text` like invokeMcpToolFromChat), and ensure the index is populated and wired to AI Search.  
- **Separate fix:** Resolve the embedding dimension conflict: either (1) use **bge-large-en-v1.5** in vectorize-kb and ensure the index is 1024 dims, or (2) create a second Vectorize index (768 dims) for KB and a second binding, and query it only for KB-style search. Do not mix 768- and 1024-dim vectors in the same index.

---

**End of audit. No code was changed.**
