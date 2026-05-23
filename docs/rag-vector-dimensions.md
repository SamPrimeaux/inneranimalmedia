# RAG vector dimensions

Canonical setup for Agent Sam embeddings and Vectorize indexes.

## Two lanes (do not mix dimensions)

| Lane | Binding | Index / table | Dims | Metric | Model |
|------|-----------|---------------|------|--------|-------|
| **Legacy RAG / documents** | `VECTORIZE` | `ai-search-inneranimalmedia-autorag` + `public.documents` | **1024** | cosine | `text-embedding-3-small` @1024 (`RAG_EMBEDDING_DIMENSIONS`) |
| **Agent Sam memory & code** | `AGENTSAMVECTORIZE` | `inneranimalmedia-vectors` + `public.agent_memory`, `code_chunks` | **1536** | cosine | `text-embedding-3-large` @1536 (`AGENTSAM_EMBEDDING_DIMENSIONS`) |

## Worker — documents / unified RAG (1024)

- **Env:** `RAG_EMBEDDING_DIMENSIONS = "1024"`, `RAG_OPENAI_EMBEDDING_MODEL = "text-embedding-3-large"` (truncated to 1024 in API).
- **Code:** `src/api/rag.js` → `createEmbedding()` → `RAG_SUPABASE_VECTOR_DIM`.

## Worker — Agent Sam semantic memory (1536)

- **Env:** `AGENTSAM_EMBEDDING_DIMENSIONS = "1536"`, `AGENTSAM_OPENAI_EMBEDDING_MODEL = "text-embedding-3-large"`.
- **Code:** `src/core/agentsam-vectorize.js` → `createAgentSamEmbedding()`, `upsertAgentsamVectorizeMemory()`.
- **Paths:** `insertCuratedAgentMemory`, `searchCuratedAgentMemory`, `searchAgentMemoryHybrid`, `handleAgentMemorySync`, `/api/agent/memory/*`.

## Cloudflare Vectorize

- **`VECTORIZE`** → `ai-search-inneranimalmedia-autorag` (1024, cosine) — AutoRAG / knowledge ingest.
- **`AGENTSAMVECTORIZE`** → [inneranimalmedia-vectors](https://dash.cloudflare.com/ede6590ac0d2fb7daf155b35653457b2/ai/vectorize) (1536, cosine) — curated chat memory + code search.

D1 registry row: `vectorize_index_registry.id = vidx_agentsam_vectors` (migration `373_agentsam_vectorize_registry_1536.sql`).

## Supabase (pgvector)

- **`public.agent_memory`:** `vector(1536)` — RPCs `match_agent_memory`, `search_agent_memory` (migration `supabase/migrations/20260523120000_agent_memory_1536_agentsam_vectorize.sql`).
- **`public.code_chunks`:** `vector(1536)` — see `migrations/supabase_semantic_code_search_1536.sql`.
- **Documents / session summaries / tenant_context:** remain **`vector(1024)`** unless migrated separately.
- **Legacy:** `agent_context_snapshots` / `agent_decisions` may still be **768** — do not write 1536-d vectors there.

## After changing dimensions

1. Apply Supabase migration (clears `agent_memory.embedding`; re-embed required).
2. Apply D1 registry migration `373`.
3. Deploy Worker (`npm run deploy:full` or Worker-only if no dashboard change).
4. Re-embed: Worker upserts on `/api/agent/memory/upsert` and webhooks, or run targeted backfill with **1536** model (edge `backfill-embeddings` must match table width).
