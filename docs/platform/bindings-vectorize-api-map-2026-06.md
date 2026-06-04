# IAM Bindings → Vectorize → API Map

Last verified: **2026-06-04** (post `scripts/rag_ingest.mjs --lane all`)

Related: [IAM runtime architecture](./iam-runtime-architecture-2026-06.md) · [Platform baseline](./platform-baseline-2026-06-03.md) · [Agent layer / RAG snapshot](./agent-layer-snapshot-p0-rag-2026-06.md)

---

## 1. Two retrieval planes

Agent Sam semantic search uses **Cloudflare Vectorize first**, **Supabase pgvector (Hyperdrive) fallback**:

```
Query → createAgentsamEmbedding (OpenAI text-embedding-3-large @ 1536)
      → env.AGENTSAM_VECTORIZE_*.query(filter: workspace_id)
      → hydrate full text via env.HYPERDRIVE from agentsam.* table
      → if zero hits: direct pgvector query on same table
```

**Canonical code:** `src/core/semantic-retrieval-dispatch.js` · **Lane config:** `src/core/rag-lanes.js`

**Not used for Agent chat lanes:** `AI_SEARCH_ENDPOINT` / `AI_SEARCH_TOKEN` (1024-dim legacy `/api/search` only).

---

## 2. Vectorize quad map (production bindings)

| Worker binding | CF index | Dims | Supabase table | Semantic lane | Catalog tool |
|----------------|----------|------|----------------|---------------|--------------|
| `AGENTSAM_VECTORIZE_CODE` | `agentsam-codebase-oai3large-1536` | 1536 | `agentsam_codebase_chunks_oai3large_1536` | `code_semantic_search` | `code_semantic_search` |
| `AGENTSAM_VECTORIZE_SCHEMA` | `agentsam-schema-oai3large-1536` | 1536 | `agentsam_database_schema_oai3large_1536` | `schema_semantic_search` | `schema_semantic_search` |
| `AGENTSAM_VECTORIZE_MEMORY` | `agentsam-memory-oai3large-1536` | 1536 | `agentsam_memory_oai3large_1536` | `memory_semantic_search` | `memory_semantic_search` |
| `AGENTSAM_VECTORIZE_COURSES` | `agentsam-courses-oai3large-1536` | 1536 | `agentsam_documents_oai3large_1536` | `docs_knowledge_search` | `docs_knowledge_search` |
| *(none)* | — | 3072 | `agentsam_deep_archive_oai3large_3072` | `deep_archive_search` | `deep_archive_search` |

**Docs lane quirk:** document rows live in `agentsam_documents_oai3large_1536` but Vectorize upserts target the **courses** index until `AGENTSAM_VECTORIZE_DOCUMENTS` is bound to `agentsam-documents-oai3large-1536`.

**Stored vectors (2026-06-04 ingest):** CODE 262 · SCHEMA 593 · MEMORY 192 · COURSES/docs 307

---

## 3. Embedding env vars

| Variable | Role |
|----------|------|
| `AGENTSAM_EMBEDDING_DIMENSIONS` | 1536 — lane indexes |
| `AGENTSAM_OPENAI_EMBEDDING_MODEL` | `text-embedding-3-large` |
| `OPENAI_API_KEY` | Query-time embeddings |
| `OPENAI_API_BASE_URL` | Embeddings + chat |
| `SUPABASE_*` | Ingest scripts; Worker uses `HYPERDRIVE` at runtime |

---

## 4. API paths

### Automatic (chat pre-context)

`POST /api/agent/chat` → `resolveAgentChatLaneContextBlock` → `dispatchSemanticRetrieval` → prompt sections (`## Code semantic context`, etc.)

### Explicit tools

Same dispatcher via `catalog-tool-executor.js` (`dispatcher: semantic_retrieval`) after `dispatchByToolCode`.

### Hyperdrive (SQL / pgvector, not Vectorize bindings)

| Tool family | Binding | Operations |
|-------------|---------|------------|
| `agentsam_supabase_*` | `HYPERDRIVE` | `supabase.query`, `supabase.write`, `vector.search`, `autorag.search` |
| `agentsam_d1_*` | `DB` (cf lane) | `d1.query`, `d1.write`, `d1.migrate` |

### Legacy

`POST /api/search` → `AI_SEARCH_*` (1024-dim AutoRAG; dashboard search UI, not Agent chat spine).

### Ops

- `GET /api/internal/agentsam-vectorize/describe`
- `node scripts/rag_ingest.mjs --lane all --update-registry`

---

## 5. Workspace scoping

- **Vectorize filter:** D1 workspace key (e.g. `ws_inneranimalmedia`)
- **Postgres:** Supabase UUID via `resolveSupabaseWorkspaceId()` in `rag-lanes.js`

---

## 6. Full worker binding map (main worker)

| Binding | Resource | Primary use |
|---------|----------|-------------|
| `DB` | D1 `inneranimalmedia-business` | Control plane, `agentsam_*` registry |
| `HYPERDRIVE` | Supabase pooler | pgvector fallback, SQL tools |
| `AGENTSAM_VECTORIZE_*` | Four 1536 indexes | Semantic lanes (above) |
| `ASSETS` / `DASHBOARD` | R2 `inneranimalmedia` | Static app, assets, GLBs |
| `AUTORAG_BUCKET` | R2 `inneranimalmedia-autorag` | Autorag corpus |
| `AGENT_SESSION` | DO `AgentChatSqlV1` | Chat persistence, SSE |
| `BROWSER_SESSION` | DO `AgentBrowserLiveV1` | MYBROWSER / CDT tools |
| `MYBROWSER` | Browser Run | Live browser automation |
| `PTY_SERVICE` | VPC `iam-vpc` | Terminal / python_execute |
| `AI` | Workers AI | Optional embed fallback |
| `KV` / `SESSION_CACHE` | KV | MCP tokens, prompt cache |
| `MY_QUEUE` | Queue | Async jobs |
| `IAM_COLLAB` / `CHESS_SESSION` | DOs | Collab / chess |

**Two repos:** in-app Agent Sam never routes through `mcp.inneranimalmedia.com`. MCP worker reads same `agentsam_tools` catalog.

---

## 7. Agent OS rules (D1)

Platform law for every chat turn: `agentsam_rules_document` row `rule_iam_bindings_vectorize_api_map` (`apply_mode=always`, `trigger_type=system`). Worker: `appendTriggeredRulesToSystemPrompt` in `src/api/agent.js`.

Re-sync Vectorize after Supabase embed changes:

```bash
./scripts/with-cloudflare-env.sh node scripts/rag_ingest.mjs --lane all --update-registry
```
