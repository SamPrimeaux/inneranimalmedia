---
title: "Vector lanes — current production map (no Ollama)"
category: agentsam
updated: 2026-05-28
importance: high
surface: /dashboard/agent
---

# Vector lanes (current production)

**Rule:** index dimension + embedding model at **ingest** must match **query** time. Ollama `mxbai-embed-large` appears only as a **fallback** in `createEmbedding` (Supabase 1024 path) and in legacy offline scripts — **not** the primary Agent Sam lane.

## Cloudflare Vectorize indexes (`wrangler.production.toml`)

| Worker binding | Index name | Typical dims | Embed model (production) | Used for |
|----------------|------------|--------------|---------------------------|----------|
| `VECTORIZE` | `ai-search-inneranimalmedia-autorag` | **1024** | Workers AI `@cf/baai/bge-m3` | Chat pre-context (`agent.js` `resolveVectorContext`), AI Search / autorag R2 corpus |
| `AGENTSAMVECTORIZE` | `inneranimalmedia-vectors` | **1536** (env default) | OpenAI `text-embedding-3-large` @ 1536, or Workers AI `@cf/baai/bge-large-en-v1.5` if index is 768/1024 | Agent Sam semantic memory upsert/search (`agentsam-vectorize.js`) |
| `AGENTSAM_VECTORIZE_MEMORY` | `agentsam-memory-oai3large-1536` | **1536** | OpenAI `text-embedding-3-large` via `createAgentsamEmbedding` | RAG lane `memory` |
| `AGENTSAM_VECTORIZE_CODE` | `agentsam-codebase-oai3large-1536` | **1536** | same | RAG lane `code` |
| `AGENTSAM_VECTORIZE_COURSES` | `agentsam-courses-oai3large-1536` | **1536** | same | RAG lane `docs` |
| `AGENTSAM_VECTORIZE_SCHEMA` | `agentsam-schema-oai3large-1536` | **1536** | same | RAG lane `schema` |

Lane registry: `src/core/rag-lanes.js` (`writeToLane`, `queryLanes`).

`VECTORIZE_DOCS` is referenced in `src/queue/docs-vectorize.js` (Workers AI `bge-m3`) but is **not** bound in `wrangler.production.toml` today.

## Runtime embedding providers (Worker)

| API / module | Lanes | Provider order | Target dims |
|--------------|-------|----------------|-------------|
| `createAgentsamEmbedding` | AGENTSAMVECTORIZE + 4× lane indexes | OpenAI `text-embedding-3-large` **or** Workers AI `bge-large-en-v1.5` (from `describe()`) | 1536 / 768 / 1024 per index |
| `createEmbedding` (`rag.js`) | Supabase `vector(1024)` RPCs | **text_default:** OpenAI `text-embedding-3-small` @ 1024 → Ollama fallback; **edge_bulk:** `@cf/baai/bge-m3`; **multimodal:** Gemini | **1024** |
| `generateWorkersAiEmbedding` | docs queue, cron | Workers AI `@cf/baai/bge-m3` | 1024 |
| `resolveVectorContext` | `VECTORIZE` ai-search | Workers AI `@cf/baai/bge-m3` | 1024 |

Env vars (`wrangler.production.toml`):

- `RAG_OPENAI_EMBEDDING_MODEL` = `text-embedding-3-large`
- `RAG_EMBEDDING_DIMENSIONS` = `1024`
- `AGENTSAM_OPENAI_EMBEDDING_MODEL` = `text-embedding-3-large`
- `AGENTSAM_EMBEDDING_DIMENSIONS` = `1536`

## Supabase pgvector (Hyperdrive) — paired with 1536 lanes

| RAG lane | Supabase table | Vectorize binding |
|----------|----------------|-------------------|
| `memory` | `agentsam.agentsam_memory_oai3large_1536` | `AGENTSAM_VECTORIZE_MEMORY` |
| `code` | `agentsam.agentsam_codebase_chunks_oai3large_1536` | `AGENTSAM_VECTORIZE_CODE` |
| `docs` | `agentsam.agentsam_documents_oai3large_1536` | `AGENTSAM_VECTORIZE_COURSES` |
| `schema` | `agentsam.agentsam_schema_oai3large_1536` | `AGENTSAM_VECTORIZE_SCHEMA` |
| `archive` | `agentsam.agentsam_deep_archive_oai3large_3072` | none |

Separate Supabase **public** tables (1024-dim `createEmbedding` path):

- `public.agent_memory` — semantic recall (`match_agent_memory`)
- `public.codebase_chunks` — codebase RAG backfill (`text-embedding-3-large` @ 1024 per migration notes)

## Recommended lane for `dashboard-agent-audit` corpus

| Goal | Use |
|------|-----|
| **Production-aligned Agent Sam RAG** | Lane **`memory`** → OpenAI `text-embedding-3-large` @ **1536** → `agentsam-memory-oai3large-1536` (+ Hyperdrive row) |
| **Match live chat Vectorize pre-search** | `VECTORIZE` / ai-search → embed with **`@cf/baai/bge-m3` @ 1024** (Workers AI only — use Worker or CF AI API, not Ollama) |
| **Avoid** | Ollama-only offline upsert into ai-search while chat queries with `bge-m3` |

Ingest script: `scripts/ingest_dashboard_agent_audit_vectorize.py` — defaults to **`--lane memory`** (OpenAI 1536).

## Describe index at runtime

```http
GET /api/internal/agentsam-vectorize/describe
```

Returns `inneranimalmedia-vectors` dimensions + resolved model (`src/api/agentsam-vectorize-describe.js`).

## Legacy / offline scripts (do not treat as canonical)

| Script | Model | Index |
|--------|-------|-------|
| `ingest_rag_knowledge.js`, `vectorize_knowledge_ollama_cf.py` | Ollama mxbai @ 1024 | ai-search |
| `embed_audit_artifacts.py` | Ollama mxbai @ 1024 | ai-search |
| `embed_agentsam_clean_chunks_openai.py` | OpenAI 3-large @ 1024 | ai-search |
| `embed_codebase_vectorize.py` | OpenAI 3-large @ 1536 | AGENTSAMVECTORIZE + Supabase |
