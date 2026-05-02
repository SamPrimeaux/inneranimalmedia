# How RAG works (Inner Animal Media)

Three layers: **pre-prompt AutoRAG** (chat), **tool-driven `knowledge_search` / `rag_search`**, and **Vectorize memory indexing** (cron / admin).

## 1. Pre-prompt RAG (`POST /api/agent/chat`)

**Location:** `worker.js` ~7410–7451.

**Conditions:**

- `chatMode === 'agent'`
- `env.AI_SEARCH_TOKEN` present
- Last user text has at least **`RAG_MIN_QUERY_WORDS` (4)** words (~7411)
- Joined chunk text length >= **`RAG_MIN_CONTEXT_CHARS` (100)** (~7412, 7440)

**HTTP call:**

`POST https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai-search/instances/iam-autorag/search`

**Headers:** `Authorization: Bearer ${AI_SEARCH_TOKEN}`, `Content-Type: application/json`

**Body:** `messages: [{ role: 'user', content: lastUserContent }]`, `ai_search_options: { retrieval: { max_num_results: 5 } }` (~7427–7429)

**Response parsing:** `ragData.result.chunks` — each chunk `text` (~7435–7438). On non-OK, worker logs status and body (~7444–7446).

**Failure modes:** Missing/invalid token → console warning; chat continues without `ragContext`. Session history (`docs/autorag-knowledge/sessions/2026-03-23-session-summary.md`) notes verifying **AI Search Run** permissions on tokens.

## 2. Tool-driven RAG

- **`knowledge_search`:** `runKnowledgeSearchMerged` (~12822) — parallel **D1** `ai_knowledge_base` + **`autoragAiSearchQuery`**.
- **`autoragAiSearchQuery`:** (~12757+) prefers **`env.AI_SEARCH.search`** binding; else REST with **`CLOUDFLARE_API_TOKEN`** (not `AI_SEARCH_TOKEN`) to same **instances/iam-autorag/search** URL.
- **`rag_search`:** uses merged search path; tool registration `ensureRagSearchToolRegistered` (~12839+).

## 3. Workers AI embedding (Vectorize memory path)

**Not** the same embedding model as the managed AutoRAG service.

- Constant **`RAG_MEMORY_EMBED_MODEL = '@cf/baai/bge-large-en-v1.5'`** (~12862).
- **`indexMemoryMarkdownToVectorize`** (~13215+): chunks markdown from R2 keys under `memory/`, `knowledge/`, etc., embeds with **`env.AI.run(RAG_MEMORY_EMBED_MODEL, ...)`**, upserts to **`env.VECTORIZE`** / index selection in that code path.
- Comment ~13212: Vectorize index should be **1024 dims, cosine** to align with AI Search expectations.

## 4. Indexes and buckets

- **AI Search instance:** **`iam-autorag`** (`[[ai_search]]` in `wrangler.production.toml`).
- **Vectorize index (AutoRAG-related):** **`ai-search-iam-autorag`** binding **`VECTORIZE_INDEX`**.
- **Ingest bucket:** **`autorag`** (`AUTORAG_BUCKET`).
- **Docs / markdown for humans + agents:** **`iam-docs`** (`DOCS_BUCKET`) — this documentation tree; future AutoRAG source material can be synced via existing `/api/agentsam/autorag/*` flows.

## 5. Tool inventory note

**73** refers to **enabled rows in `mcp_registered_tools`** (see `docs/autorag-knowledge/architecture/agent-sam-capabilities.md`), not vector count.

## 6. Word threshold

**4 words** minimum for pre-prompt RAG (`RAG_MIN_QUERY_WORDS`).
