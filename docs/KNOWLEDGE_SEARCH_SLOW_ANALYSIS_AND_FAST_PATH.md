# Why Agent Sam Codebase Search Is Slow (2+ min) vs Cursor Instant

## 1. How `knowledge_search` currently works (code path in worker.js)

### Entry points (three call sites)

| Location | When | What runs |
|----------|------|-----------|
| **runToolLoop** (non-streaming tool loop) | Model returns `tool_calls` with `knowledge_search` | Lines 1597-1614 |
| **invokeMcpToolFromChat** (MCP/execute-approved-tool path) | Same tool by name | Lines 4526-4600 |
| **Pre-chat RAG inject** | Before every chat when `lastUserContent` has >10 words | Lines 3233-3246 |

### Main path (runToolLoop and invokeMcpToolFromChat)

1. **Lines 1601-1603 (runToolLoop)** or **4534-4536 (invokeMcpToolFromChat)**  
   Single call:  
   `env.AI.autorag('inneranimalmedia-aisearch').search({ query, max_num_results: 5 })`

2. **What Cloudflare `.search()` does** (per Cloudflare AI Search docs):
   - **Query rewrite** (optional, can be enabled in AI Search config) — extra LLM or rewrite step
   - **Embed query** — Workers AI embedding model call
   - **Vectorize query** — lookup against index `ai-search-inneranimalmedia-aisearch`
   - **Reranking** (optional) — reranker model over top-K
   - Returns **raw chunks** (no answer generation; `.aiSearch()` would add an LLM response)

3. **Fallback when AI Search returns 0 results** (invokeMcpToolFromChat only, lines 4540-4565):
   - `env.AI.run(RAG_MEMORY_EMBED_MODEL, { text: [query] })` — one embed call
   - `env.VECTORIZE.query(vector, { topK: 5, returnMetadata: 'all' })` — direct Vectorize
   - For each match: `env.R2.get(source)` — **one R2 get per match** (up to 5)
   - Build `results` and `answer` from R2 body text

4. **After search**: Result is JSON-stringified and either:
   - Appended to `messages` in runToolLoop and the **model is called again** (second full round), or
   - Returned from invokeMcpToolFromChat; the client or caller then continues the conversation (another model round elsewhere).

So the **full** code path for a single “codebase question” that uses the tool is:

- Request hits `/api/agent/chat`.
- **Context build** (see below) — cache miss can mean R2 + D1 + compiled context.
- **Pre-chat RAG** (if last user message has >10 words): one `autorag(...).search()`.
- **First model call** — model may decide to call `knowledge_search` and return tool_use.
- **Tool execution** — `autorag(...).search()` (or Vectorize fallback + 5× R2.get).
- **Second model call** — messages + tool result sent back; model generates final answer.

No per-file iteration in the worker: it’s one (or two) `.search()` calls per tool use. Slowness is not “searching files one by one”; it’s **round-trips and what’s behind `.search()`**.

---

## 2. Why it’s slow

### A. Multiple round-trips (dominant)

- **Two LLM rounds** when the model uses the tool: first to emit `knowledge_search`, second to turn tool output into an answer. Each round can be 15–60+ seconds.
- **Pre-chat RAG** adds one `autorag.search()` before the first model call (only when message has >10 words).
- So: 1× context build + 1× pre-chat search (optional) + 1× LLM + 1× tool search + 1× LLM → easily **1–2+ minutes**.

### B. What `.search()` does (Cloudflare AI Search)

- Embedding the query (Workers AI).
- Vector search (Vectorize).
- Optionally **query rewrite** and **reranking** (if enabled in the AI Search instance), which add latency.
- Even without those, a single `.search()` can be on the order of **1–5+ seconds** (network + embed + vector DB).

### C. Index contents (not “full codebase”)

- **Indexed today**: `indexMemoryMarkdownToVectorize` (lines 5449–5523) only pulls from R2 prefixes:
  - `memory/daily/`, `memory/compacted-chats/`, `knowledge/`, `docs/`
- So the **2.17k vectors** are almost certainly **memory/knowledge/docs markdown**, not the full repo (e.g. not `worker.js`, not `agent-dashboard/`).
- “Codebase search” in the UI therefore often hits **docs/memory**, not the actual code. The model may still call the tool, get back only loosely related chunks, and then spend two full LLM rounds to produce an answer — hence slow and sometimes off.

### D. No search-side caching

- Every `knowledge_search` and pre-chat RAG call does a fresh `.search()`. No in-worker cache by query (or query hash), so repeated or similar questions each pay full latency.

### E. Compiled context on cache miss (smaller factor)

- Lines 3253–3377: cache miss triggers R2 gets (schema, daily, yesterday) + several D1 queries (memory_index, ai_knowledge_base, mcp_services) and a large string build. Typically **1–3 s**, not minutes, but it adds up.

---

## 3. Difference between: knowledge_search (tool), AutoRAG, Vectorize

| Term | Meaning in this codebase |
|------|---------------------------|
| **knowledge_search (tool)** | A **tool** the model can call. Implemented in worker.js (runToolLoop + invokeMcpToolFromChat). It calls **Cloudflare AI Search** (see below) and returns chunks/answer to the model. So “knowledge_search” = tool name; the **implementation** is “call AutoRAG/AI Search (and sometimes Vectorize fallback)”. |
| **AutoRAG / AI Search** | Cloudflare’s managed RAG product. In worker it’s used as `env.AI.autorag('inneranimalmedia-aisearch')`. That instance is backed by the **same** Vectorize index. `.search()` = embed + vector search + optional rewrite/rerank; `.aiSearch()` = same + **LLM generation**. We use `.search()` only. So “AutoRAG” here = the Cloudflare service + the way we call it (embed + vector search, no answer generation in worker). |
| **Vectorize (2.17k vectors)** | Cloudflare’s vector DB. Index name: `ai-search-inneranimalmedia-aisearch` (wrangler: `VECTORIZE` binding). The **same** index is used by: (1) AI Search / autorag, (2) direct `env.VECTORIZE.query()` in the knowledge_search fallback, (3) `indexMemoryMarkdownToVectorize` (and any other upserts). So “Vectorize” = the index and binding; “2.17k vectors” = what’s currently in that index (memory/knowledge/docs chunks, not full codebase). |

So:

- **knowledge_search** = the tool that uses **AutoRAG (AI Search)** (and sometimes **Vectorize** + R2 directly).
- **AutoRAG** = Cloudflare’s search pipeline (embed + Vectorize + optional rewrite/rerank).
- **Vectorize** = the vector index; content is currently **not** the full codebase.

---

## 4. How to make codebase search fast (sub-second feel like Cursor)

### High-impact (reduce round-trips and latency)

1. **Inject RAG once, avoid tool for simple Q&A**
   - Run **one** retrieval step **before** the first model call (e.g. always, or when the last message looks like a question).
   - Put the retrieved chunks into the **system** (or a system section) so the model can answer **without** calling `knowledge_search`.
   - Effect: **One** LLM round instead of two; no tool-call latency. Biggest win.

2. **Use direct Vectorize + embed instead of `.search()` for retrieval**
   - In the worker: `env.AI.run(embedModel, { text: [query] })` then `env.VECTORIZE.query(vector, { topK })`.
   - Skip AI Search’s optional rewrite/rerank for the “fast path.”
   - Effect: Lower, more predictable latency than going through the full AI Search pipeline.

3. **Cache retrieval by query**
   - Hash the query (or normalized form); cache (e.g. KV or in-memory with TTL) the top-K chunk IDs or text.
   - Effect: Repeated/similar questions become sub-second.

4. **Index the actual codebase**
   - Add a pipeline (e.g. from repo or R2) that chunks **source code** (worker.js, agent-dashboard, etc.), embeds with the same model, and **upserts into the same Vectorize index** (or a dedicated codebase index). Then both pre-chat RAG and `knowledge_search` return **code** chunks, not only docs.
   - Effect: “Codebase questions” get real code context; answers improve and fewer useless tool rounds.

### Medium-impact (infrastructure)

5. **LSP / static index (optional)**
   - For “where is X defined” / “references to Y”, a language-aware index (LSP or similar) can be faster and more precise than semantic search. Can be a separate fast path (e.g. dedicated endpoint or tool that queries LSP instead of Vectorize).
   - Effect: Better and faster for “find definition” / “find references” style queries.

6. **Pre-chat RAG unconditionally (or for all questions)**
   - Today pre-chat RAG runs only when `lastUserContent.split(' ').length > 10`. Option: run a single retrieval for (almost) every user message and inject into system, so the model rarely needs to call the tool.
   - Effect: Fewer tool calls; more single-round answers.

### Low-latency retrieval path (concrete)

- **Fast path** in worker (e.g. for `/api/agent/chat` or a dedicated “quick search” endpoint):
  1. Embed query: `env.AI.run(RAG_MEMORY_EMBED_MODEL, { text: [query] })`.
  2. Query Vectorize: `env.VECTORIZE.query(vector, { topK: 5, returnMetadata: 'all' })`.
  3. Optionally: resolve only metadata (no R2.get) if stored in Vectorize metadata; or keep 1–5 R2.gets for full text.
  4. Optionally: cache result by `queryHash` in KV (e.g. 5–15 min TTL).
- Use this **same** path for:
  - Pre-chat context inject (so one fast retrieval before the model),
  - And/or the implementation of `knowledge_search` when you want minimum latency (at the cost of not using AI Search’s rewrite/rerank).

---

## 5. What needs to be done to get sub-second search like Cursor

Summary of changes:

| Priority | What to do | Effect |
|----------|------------|--------|
| P0 | **Always (or almost always) run one retrieval before the first model call** and inject chunks into the system prompt. Prefer **direct Vectorize + embed** for this step (no AI Search). | Removes one LLM round + one tool round for most Q&A; 2+ min → ~30–60 s. |
| P0 | **Index the codebase** (worker, dashboard, key repos) into Vectorize (or a dedicated index) and use it for this retrieval. | “Codebase” questions get code; quality and relevance match user expectation. |
| P1 | **Fast retrieval path**: implement a single path that does embed + `VECTORIZE.query` (+ optional R2 or metadata-only), use it for pre-chat inject and optionally for `knowledge_search`. | Sub-second retrieval; predictable latency. |
| P1 | **Cache retrieval** by query (e.g. KV, key = hash(query), value = top-K IDs or text, TTL 5–15 min). | Repeated/similar queries sub-second. |
| P2 | **Optional**: LSP or code-index for “definition / references” as a separate fast path. | Cursor-like behavior for navigation-style queries. |

Cursor feels instant because:

- The editor has **local/indexed code** (and often LSP), so “search codebase” is a local index lookup, not a 2-round LLM + cloud RAG.
- They can **pre-fill** context so the model rarely needs an extra tool round for simple code Q&A.

To approach that in Agent Sam:

- **One** fast retrieval (direct Vectorize + embed, optional cache) **before** the model.
- **Code** in the index, not only docs.
- **No** (or rare) `knowledge_search` tool use for simple “what/how/where” codebase questions.

---

## References (worker.js)

- `fileContext` / body: 3179  
- Pre-chat RAG (AISEARCH): 3233–3246  
- Compiled context (cache + build): 3253–3377  
- knowledge_search in runToolLoop: 1597–1614  
- knowledge_search in invokeMcpToolFromChat: 4526–4600  
- Vectorize fallback (direct query + R2.get): 4540–4565  
- `/api/agent/rag/query`: 3883–3897  
- indexMemoryMarkdownToVectorize (what’s indexed): 5449–5523  
- RAG_MEMORY_EMBED_MODEL: 5140  
