# Context, Embedding, Vectorize & Compaction — Production Map (2026-06)

**Purpose:** Planning reference for industry-grade, autonomously managed context compaction at scale.  
**Worker:** `inneranimalmedia` · **Schema:** Supabase `agentsam` · **Control plane:** D1 `inneranimalmedia-business`  
**Code truth:** `src/core/embedding-routes.js`, `src/core/rag-lanes.js`, `src/core/semantic-retrieval-dispatch.js`

---

## Golden rules (non-negotiable)

1. **Two embedding vector spaces — never mix in one index**
   - **Text RAG:** OpenAI `text-embedding-3-large` @ **1536**
   - **Multimodal media:** Google `gemini-embedding-2` @ **1536** (separate index only)
   - **Deep archive:** OpenAI `text-embedding-3-large` @ **3072** (Supabase pgvector only — no Vectorize mirror)

2. **Agent Sam chat hot path** uses the six `AGENTSAM_VECTORIZE_*` bindings + Hyperdrive pgvector — not legacy `VECTORIZE` / `AGENTSAMVECTORIZE` / Managed AI Search @1024.

3. **Compaction ≠ embedding.** Compaction reduces live context size; embedding makes durable atoms searchable later. Every compaction strategy should declare **target lane(s)**.

4. **Workspace scoping:** Vectorize metadata uses D1 `ws_*` keys; Supabase rows use UUID `workspace_id` — resolve via `resolveSupabaseWorkspaceId()`.

---

## 1) Embedding models (what produces vectors)

| Policy key | Provider | Model | Dims | Used for |
|------------|----------|-------|------|----------|
| `primaryTextRag` | OpenAI | `text-embedding-3-large` | 1536 | memory, docs, code, schema, deep_archive (3072 = no `dimensions` param) |
| `multimodalAssetSearch` | Google | `gemini-embedding-2` | 1536 | MovieMode / R2 media assets only |
| `cheapFastSearch` | — | (reserved) | 768 | Not a production Agent Sam lane today |
| Legacy / avoid | Workers AI | `@cf/baai/bge-m3` @ 1024 | 1024 | Old autorag / AI Search indexes — do not write new Agent Sam atoms here |

**Runtime entry points**

| Function | File | Role |
|----------|------|------|
| `createAgentsamEmbedding()` | `src/core/agentsam-vectorize.js` | OpenAI 1536 for all text lanes |
| `createEmbedding(..., multimodal)` | `src/api/rag.js` | Gemini multimodal @1536 |
| `resolveTextEmbeddingRoute()` | `src/core/embedding-routes.js` | Lane → embed spec |
| `resolveMultimodalEmbeddingRoute()` | `src/core/embedding-routes.js` | Media lane spec |

---

## 2) Vector storage — Worker-bound Cloudflare Vectorize (live)

Bound on production Worker (`wrangler.production.toml`). All **1536 cosine** unless noted.

| Binding | Index | Semantic task | Embed model | Best use |
|---------|-------|---------------|-------------|----------|
| `AGENTSAM_VECTORIZE_MEMORY` | `agentsam-memory-oai3large-1536` | `memory_semantic_search` | OpenAI 1536 | Stable facts, preferences, deploy rules, distilled session memory |
| `AGENTSAM_VECTORIZE_DOCUMENTS` | `agentsam-documents-oai3large-1536` | `docs_knowledge_search` | OpenAI 1536 | Skills, product docs, architecture notes, chunked knowledge |
| `AGENTSAM_VECTORIZE_COURSES` | `agentsam-courses-oai3large-1536` | Learn / course ingest | OpenAI 1536 | LMS course catalog (parallel to docs lane) |
| `AGENTSAM_VECTORIZE_CODE` | `agentsam-codebase-oai3large-1536` | `code_semantic_search` | OpenAI 1536 | Repo chunks — "where is X implemented?" |
| `AGENTSAM_VECTORIZE_SCHEMA` | `agentsam-schema-oai3large-1536` | `schema_semantic_search` | OpenAI 1536 | D1/Supabase/KV/R2 schema awareness, migrations |
| `AGENTSAM_VECTORIZE_MEDIA` | `agentsam-moviemode-gemini2-1536` | `media_semantic_search` | **Gemini 1536** | Image/video/audio/PDF + caption — **never OpenAI vectors** |

**Query path:** `dispatchSemanticRetrieval()` in `src/core/semantic-retrieval-dispatch.js`  
**Route-aware RAG:** `queryRouteRagLanes()` — `ask`/`research` → docs+memory; `db_*`/`debug`/`cf_ops` → schema+memory

### Account indexes NOT on Worker (legacy — do not extend)

| Index | Dims | Notes |
|-------|------|-------|
| `ai-search-iam-autorag` | 1024 | Cloudflare Managed AI Search |
| `ai-search-iam-docs-search` | 1024 | Managed AI Search |
| `ai-search-inneranimalmedia-autorag` | 1024 | Managed AI Search |
| `inneranimalmedia-vectors` | 1536 | Pre–five-lane legacy |

---

## 3) Vector storage — Supabase pgvector (`agentsam` schema)

Registry: D1 `agentsam_pgvector_lane_registry` · Hyperdrive: `env.HYPERDRIVE`

| Table | Dims | Vectorize pair | ~Rows | Structure / dedup | Compaction target |
|-------|------|----------------|-------|-------------------|-------------------|
| `agentsam_memory_oai3large_1536` | 1536 | MEMORY | ~196 | `memory_key` UPSERT | Session facts → stable keys (`deploy_rules`, `user_pref_*`) |
| `agentsam_documents_oai3large_1536` | 1536 | DOCUMENTS | ~346 | `content_hash`, `heading_path[]`, chunks | Long prose → chunked with breadcrumb metadata |
| `agentsam_database_schema_oai3large_1536` | 1536 | SCHEMA | ~593 | `database_kind`, `object_type`, `table_name` | Platform/DB truth atoms |
| `agentsam_codebase_chunks_oai3large_1536` | 1536 | CODE | ~262 | `file_path` + `chunk_index` | Code change summaries tied to paths |
| `agentsam_codebase_files_oai3large_1536` | 1536 | (parent) | ~48 | File catalog, no chunk body | File routing before chunk pull |
| `agentsam_media_gemini2_1536` | 1536 | MEDIA | new | `(workspace_id, asset_id)` | Media refs — D1 `media_assets` SSOT |
| `agentsam_deep_archive_oai3large_3072` | **3072** | none | ~86 | `archive_tier`, `content_hash` | Golden platform law — never truncate embed |

**Legacy (read-only):** `agentsam_schema_oai3large_1536` — superseded by `agentsam_database_schema_oai3large_1536`.

**Dual-write pattern:** Vectorize for low-latency edge search; Supabase for exact pgvector fallback, analytics, and MCP `supabase_vector` lane queries.

---

## 4) Compaction mechanisms (what shrinks live context)

Four distinct systems — do not conflate.

### A) In-flight provider compaction (Anthropic)

| Aspect | Detail |
|--------|--------|
| Trigger | Model catalog `supports_compaction` + beta `compact-2026-01-12` |
| Code | `src/integrations/anthropic.js`, `src/api/agent.js` (SSE `compaction` events) |
| Ledger | D1 `agentsam_compaction_events` (`summarize` \| `truncate` \| `selective` \| `full`) |
| Cost tracking | `src/core/agent-costs.js` — `scheduleCompactionFromAnthropicUsage()` |
| Post-compaction | **Optional:** distill summary → `writeMemoryLane()` for cross-session recall |

**Best for:** Long single-thread agent runs hitting context limits on Claude.

### B) Chat transcript compaction → durable markdown (R2)

| Aspect | Detail |
|--------|--------|
| API | `compactAgentChatsToR2()` — `src/api/rag.js` |
| Target | R2 `memory/compacted-chats/YYYY-MM-DD.md` (48h window, snippet cap) |
| Cron | Daily 6 AM UTC pipeline (with memory index job) |
| API routes | `POST /api/agent/rag/compact-chats`, `then_index: true` |
| Gap | Snippet dump today — **recommended:** LLM summarize step before index |

**Best for:** Batch archival of conversational noise → searchable corpus.

### C) Semantic memory atoms (structured compaction output)

| Aspect | Detail |
|--------|--------|
| Operational KV | D1/Supabase `agentsam_memory` — structured keys, not vectors |
| Vector recall | `writeMemoryLane()` → `agentsam_memory_oai3large_1536` + Vectorize MEMORY |
| Dedup | `memory_key` stable identifier |
| When | After compaction, tool outcomes, explicit "remember X" |

**Best for:** Autonomous long-horizon agent — facts survive thread rotation.

### D) Run / conversation archive (D1 hygiene)

| Aspect | Detail |
|--------|--------|
| Job | `compactAgentChatsToR2()` in `src/cron/jobs/compact-agent-chats.js` (distinct from rag.js) |
| Target | R2 `archive/conversations/{id}/summary.json` |
| Action | Prune old `agentsam_agent_run` rows (>30d, high run count) |

**Best for:** D1 bloat control — not semantic retrieval.

### E) Thread summarization (optional hook)

| Aspect | Detail |
|--------|--------|
| Code | `src/core/summarize-thread.js` |
| Role | Post-archive LLM summary — non-blocking, never throws |

---

## 5) Content routing matrix (compaction → storage)

Use this when designing the autonomous compaction protocol.

| Incoming content | Compaction strategy | Write target | Search lane |
|------------------|---------------------|--------------|-------------|
| Long chat turn history | Anthropic compact OR R2 markdown summarize | R2 compacted → optional docs ingest | `memory_semantic_search` + `docs_knowledge_search` |
| User preference / decision | Extract atom | `writeMemoryLane` | `memory_semantic_search` |
| Platform rule / ADR | Extract + tier | `agentsam_deep_archive_oai3large_3072` | `deep_archive_search` |
| Skill / doc chunk | Chunk + hash | `agentsam_documents_oai3large_1536` | `docs_knowledge_search` |
| Schema/migration note | Object descriptor | `agentsam_database_schema_oai3large_1536` | `schema_semantic_search` |
| Code change | Path + chunk | `agentsam_codebase_chunks_oai3large_1536` | `code_semantic_search` |
| Uploaded media | Caption + bytes embed | D1 `media_assets` + dual-write media table/index | `media_semantic_search` |

**Priority when trimming live prompt context (retrieval order):**

1. `deep_archive` golden tier  
2. `memory` atoms (stable keys)  
3. `schema` (if DB/SQL task)  
4. `docs` / `code` (task-dependent)  
5. `media` metadata only (never raw bytes in prompt)

---

## 6) Autonomous management — recommended control plane

### Registries (D1 SSOT)

| Table | Purpose |
|-------|---------|
| `vectorize_index_registry` | CF index ↔ binding metadata |
| `agentsam_pgvector_lane_registry` | Supabase table ↔ purpose ↔ dims |
| `agentsam_routing_arms` | Thompson sampling per `task_type` (includes embed model arms) |
| `agentsam_compaction_events` | Observability — tokens before/after, strategy, cost saved |

### Triggers (event → action)

| Event | Autonomous action |
|-------|-------------------|
| Anthropic `compaction` SSE | Log `agentsam_compaction_events`; optionally enqueue memory atom extraction |
| Session idle > N hours | `compactAgentChatsToR2` + summarize hook |
| `agentsam_agent_run` count > threshold | Archive job (cron) |
| New skill/doc ingest | `writeToLane('docs', ...)` — idempotent via `content_hash` |
| Media upload registered | `indexMediaAssetForSearch()` — Vectorize + Supabase + D1 |

### Observability gaps (today)

- `agentsam_compaction_events`: **0 rows** — wire Anthropic compaction logging to dashboard
- Media pgvector table: **0 rows** — backfill on next MovieMode index
- Legacy docs (`docs/memory/RAG_OVERVIEW_AND_NEXT_TASKS.md`) reference retired 1024/bge paths — treat this doc as current

---

## 7) Scale & efficiency options (decision menu)

| Option | Latency | Cost | Recall | Autonomy | When to choose |
|--------|---------|------|--------|----------|----------------|
| Vectorize-only query | Lowest | Low | Good @1536 | High | Default hot path — edge filter by `workspace_id` |
| pgvector fallback (Hyperdrive) | Medium | DB read | Exact cosine | High | Vectorize miss / MCP `supabase_vector` |
| Deep archive @3072 | Higher | Highest embed | Best for golden docs | Medium | Platform law, ADRs, eval goldens only |
| Anthropic in-flight compact | Provider-side | Per-token | N/A (context shrink) | High | Long Claude threads |
| R2 snippet compact (no LLM) | Batch | Cheapest | Weak | High | High-volume chat archival |
| R2 + LLM summarize | Batch | +1 LLM call/run | Strong | Medium | **Recommended upgrade** for compacted chats |
| Memory atom extraction | Per event | Small embed | Durable | High | Cross-session autonomous agents |

**Industry-grade target architecture:**

```
Live thread ──► Anthropic compact (if Claude + long)
       │
       ├──► Extract memory atoms ──► MEMORY lane (Vectorize + pgvector)
       │
       └──► Session end ──► Summarize ──► docs OR deep_archive tier
                                    └──► R2 audit trail (optional)
```

---

## 8) Next protocol decisions (for planning session)

1. **Compaction output schema** — standard JSON for extracted atoms: `{ memory_key, lane, archive_tier?, content, source_ref }`
2. **Summarize-before-index** — enable on `compact-chats` cron (Workers AI or catalog-routed model)
3. **Route-aware compaction** — map `route_key` → lane subset (reuse `ROUTE_LANE_MAP` in `rag-lanes.js`)
4. **Autonomous threshold** — token count / turn count triggers before provider hard limit
5. **Backfill jobs** — media assets, codebase chunks (registry notes 0-row lanes until ingest runs)
6. **Retire legacy paths** — migrate any remaining `AGENTSAMVECTORIZE` / 1024 callers to five-lane + media

---

## Code index

| Concern | Primary files |
|---------|---------------|
| Embed policy | `src/core/embedding-routes.js` |
| Lane writes | `src/core/rag-lanes.js` (`writeMemoryLane`, `writeToLane`, `queryRouteRagLanes`) |
| Semantic dispatch | `src/core/semantic-retrieval-dispatch.js` |
| Media index | `src/core/moviemode-media-vectorize.js` |
| Anthropic compact | `src/integrations/anthropic.js`, `src/core/agent-costs.js` |
| Chat compact API | `src/api/rag.js` |
| Run archive cron | `src/cron/jobs/compact-agent-chats.js` |
| Supabase insert contract | `docs/supabase/AGENTSAM_RAG_LANE_SCHEMA_REFERENCE.md` |
| Schema naming law | `.cursor/rules/iam-supabase-agentsam-schema.mdc` |

---

*Last verified against production D1 + Supabase: 2026-06-05. Worker bindings: six `AGENTSAM_VECTORIZE_*` indexes active.*
