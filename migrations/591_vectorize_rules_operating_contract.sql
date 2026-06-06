-- 591: Vectorize rules — operating contract (source canonicality, receipts, lane routing, media storage).
-- Builds on 588/589. Skill: skills/agentsam-vectorize-lanes/SKILL.md
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/591_vectorize_rules_operating_contract.sql

-- ─── 1) Embed pipeline — source law, hash skip, retry, receipts, prune ───────
UPDATE agentsam_rules_document
SET
  body_markdown = '## Agent Sam embed pipeline (2026-06)

**Law:** One index · one dimension · one embedding model per lane. Never mix vector spaces in the same index.

**Canonical skill:** `skills/agentsam-vectorize-lanes/SKILL.md` · **Code:** `src/core/rag-lanes.js` · `src/core/semantic-retrieval-dispatch.js`

### Source canonicality (read first)
**Canonical sources:** Git, R2, D1 Layer 0 (`agentsam_project_context`, `agentsam_context_digest`), live provider/binding config.
**Derived mirrors (not canonical):** Supabase pgvector tables, Cloudflare Vectorize indexes.
Never treat Supabase or Vectorize as SSOT. Rebuild vectors from Git/R2/D1 when in doubt.

### RETIRED — do not use for new work
- `AGENTSAMVECTORIZE` → `inneranimalmedia-vectors`
- Legacy `VECTORIZE` / Managed AI Search @ **1024**
- `public.documents` / `public.agent_memory`

### Before any embed or upsert
1. Pick **lane** (`rule_vectorize_router`) — one lane per job; do not blind multi-lane query.
2. Confirm **binding → index → Supabase table → R2/git path → workspace_id** (`rule_iam_bindings_vectorize_api_map`).
3. Index **production-aligned source only:** `main` or explicit approved branch. Skip WIP noise, build output, logs, reports, cache, screenshots, `node_modules`, stale artifacts.
4. Run embed with lane model: OpenAI `text-embedding-3-large` @ **1536** (text lanes) · Gemini `gemini-embedding-2` @ **1536** (media only) · OpenAI @ **3072** full dims (deep archive, no Vectorize).
5. **Content hash skip:** resumable scripts must skip unchanged files by hash; rewrite chunks for changed files.
6. **Retry/backoff:** transient provider failures (e.g. OpenAI 503) must retry with backoff — do not abort the entire run on first transient error.
7. Write **Supabase first** (metadata + embedding + searchable text), then **Vectorize upsert** with Supabase row UUID as vector `id`.
8. **Run receipts (mandatory):** every ingest/reindex writes D1 proof — `run_id`, git commit SHA, `workspace_id`, `vectorize_index`, files indexed, files skipped, chunks embedded, missing/deleted files, timestamp, status (`vectorize_sync_log` and/or run-scoped receipt row).
9. **Prune after successful full run:** on a completed full reindex, delete/rewrite stale chunks for changed paths and prune chunks for files no longer in the approved source set.

### Ingest scripts (operator)
| Content | Script | Lane |
|---------|--------|------|
| Dashboard/agent code (171 files) | `scripts/reindex_codebase_dashboard_agent.mjs` | CODE |
| R2 knowledge/recipes/skills refs | `scripts/ingest_r2_to_rag.mjs` | DOCUMENTS |
| Repo `skills/*/SKILL.md` | `scripts/ingest_repo_skills_rag.mjs` | DOCUMENTS |
| Golden platform docs | `scripts/rag_ingest.mjs --lane deep_archive` | archive 3072 |
| Full Vectorize resync | `scripts/rag_ingest.mjs --lane all --update-registry` | all bound |

### Runtime query
`dispatchSemanticRetrieval` → **single lane** Vectorize.query (filter `workspace_id: ws_*`) → Hyperdrive hydrate → pgvector fallback.

### D1 memory key
`agentsam_memory.key = schema_agentsam_vectorize_embed_pipeline` (updated by migration 588).',
  updated_at_epoch = unixepoch(),
  notes = '591: source canonicality, hash skip, retry, receipts, prune-after-full-run.',
  source_stored = 'd1:agentsam_rules_document:rule_agentsam_vectorize_embed_pipeline'
WHERE id = 'rule_agentsam_vectorize_embed_pipeline';

-- ─── 2) Dual-lane rule (retired) — clarify mirror vs source ────────────────
UPDATE agentsam_rules_document
SET
  body_markdown = '## RETIRED (2026-06-06)

This rule and skill `skill_agentsam_dual_vectorize_lanes` are **inactive**. Do not cite `VECTORIZE` @1024 vs `AGENTSAMVECTORIZE`.

### Architecture (canonical source law)
| Layer | Role |
|-------|------|
| **Git / R2 / D1 Layer 0** | **Canonical source** — truth for code, docs, skills, project context |
| **Supabase pgvector** | **Derived mirror** — metadata cache, full text, embeddings, analytics, pgvector fallback |
| **Cloudflare Vectorize** | **Runtime semantic index** — fast edge ANN search at query time |

Never invert this stack: do not treat Supabase tables as authoritative over Git/R2/D1.

**Use instead:**
- Skill: `skills/agentsam-vectorize-lanes/SKILL.md` (R2 + repo)
- Rule: `rule_iam_bindings_vectorize_api_map` (always-on system)
- Rule: `rule_vectorize_router` + `vectorize_dimension_integrity_rule`
- Rule: `rule_agentsam_vectorize_embed_pipeline` (ingest playbook)

Agent Sam chat uses **six** `AGENTSAM_VECTORIZE_*` bindings @1536 (OpenAI text + Gemini media) plus **deep archive** @3072 (Supabase only).',
  updated_at_epoch = unixepoch(),
  notes = '591: retired body clarifies Git/R2/D1 source vs Supabase mirror vs Vectorize runtime.',
  source_stored = 'd1:agentsam_rules_document:rule_agentsam_dual_vectorize_lanes'
WHERE id = 'rule_agentsam_dual_vectorize_lanes';

-- ─── 3) Dimension integrity — hard fail, no cross-model comparison ─────────
UPDATE agentsam_rules_document
SET
  body_markdown = '# Vectorize Dimension Integrity Rule

## THE RULE
One index. One dimension. One model. **Never mix.** Wrong-dimension vectors corrupt ANN silently — no error, garbage results.

**Hard fail:** model/dimension mismatch → STOP immediately. Never upsert, query, or compare embeddings across different models or dimensions.

**Never compare embeddings across models/dims:** cosine similarity, rerank, or merge is invalid unless model, dimension, and lane binding are identical.

## Three production vector spaces (2026-06)

| Space | Model | Dims | Where |
|-------|-------|------|--------|
| **Text RAG** | OpenAI `text-embedding-3-large` | **1536** | Six CF Vectorize indexes + matching Supabase `agentsam.*` tables |
| **Media / MovieMode** | Google `gemini-embedding-2` | **1536** | `AGENTSAM_VECTORIZE_MEDIA` only — **never** OpenAI vectors in this index |
| **Deep archive** | OpenAI `text-embedding-3-large` (full) | **3072** | Supabase `agentsam_deep_archive_oai3large_3072` only — **no Vectorize mirror** |

**Legacy @1024** (Managed AI Search, old AutoRAG): do **not** write new Agent Sam atoms.

## MANDATORY before embed/query
- Worker: `GET /api/internal/agentsam-vectorize/describe` or binding-specific index config
- Scripts: confirm `embedding_dims` column matches model output before insert
- **Hard stop** if probe embedding length ≠ target index/table dimensions
- **Hard stop** if query embedding model/dims ≠ index model/dims

## Text lanes @1536 (OpenAI — same model at index and query)

| Binding | CF index | Supabase table (mirror) |
|---------|----------|-------------------------|
| AGENTSAM_VECTORIZE_CODE | agentsam-codebase-oai3large-1536 | agentsam_codebase_chunks_oai3large_1536 (+ files catalog) |
| AGENTSAM_VECTORIZE_SCHEMA | agentsam-schema-oai3large-1536 | agentsam_database_schema_oai3large_1536 |
| AGENTSAM_VECTORIZE_MEMORY | agentsam-memory-oai3large-1536 | agentsam_memory_oai3large_1536 |
| AGENTSAM_VECTORIZE_DOCUMENTS | agentsam-documents-oai3large-1536 | agentsam_documents_oai3large_1536 |
| AGENTSAM_VECTORIZE_COURSES | agentsam-courses-oai3large-1536 | LMS course catalog (CF-primary) |

**Legacy read-only:** `agentsam_schema_oai3large_1536` (9 rows) — do not insert; use `agentsam_database_schema_oai3large_1536`.

## Media lane @1536 (Gemini only)

| Binding | CF index | Supabase table |
|---------|----------|----------------|
| AGENTSAM_VECTORIZE_MEDIA | agentsam-moviemode-gemini2-1536 | agentsam_media_gemini2_1536 |

Rule: `rule_vectorize_lane_moviemode` · Code: `src/core/moviemode-media-vectorize.js` · `resolveMultimodalEmbeddingRoute()`.

## Mirror architecture
**Vectorize** = runtime edge ANN search. **Supabase pgvector** = derived metadata/text/embedding mirror + analytics + fallback.
**Git/R2/D1** = canonical source. Vector id **must** equal Supabase row UUID when both mirrors are used.

## Hard stops
- describe()/schema probe fails → STOP
- model dims ≠ index dims → STOP (hard fail)
- OpenAI embed into media index → STOP
- 1536 vector into 3072 table or index → STOP
- cross-model or cross-dimension similarity/compare → STOP',
  updated_at_epoch = unixepoch(),
  notes = '591: hard fail on mismatch; forbid cross-model/dim embedding comparison.',
  source_stored = 'd1:agentsam_rules_document:vectorize_dimension_integrity_rule'
WHERE id = 'vectorize_dimension_integrity_rule';

-- ─── 4) Lane router — explicit per-lane routing, no blind multi-lane ────────
UPDATE agentsam_rules_document
SET
  body_markdown = '## Vectorize Lane Router

Before embedding or querying, select **exactly one lane** by **content type** — not by convenience.

**Do not query all lanes blindly.** Route codebase → CODE, docs/skills → DOCUMENTS, schema atoms → SCHEMA, stable facts → MEMORY, media → MEDIA. Multi-lane fan-out only when the user task explicitly requires it and each lane is named in the plan.

### Architecture (2026-06)
```
Git / R2 / D1 Layer 0  →  canonical source
       ↓ ingest
Supabase pgvector      →  derived mirror (metadata, text, embeddings)
Cloudflare Vectorize   →  runtime semantic ANN index
Layer 0 (D1): agentsam_project_context / agentsam_context_digest — prompt inject, NOT vector search
```

### Route by content type

| If the content is… | Lane | Binding | Tool |
|--------------------|------|---------|------|
| Code / repo implementation | **CODE** | AGENTSAM_VECTORIZE_CODE | code_semantic_search |
| Markdown docs / skills / knowledge / compaction_digest | **DOCUMENTS** | AGENTSAM_VECTORIZE_DOCUMENTS | docs_knowledge_search |
| D1/Supabase/KV/R2 schema / migrations / bindings | **SCHEMA** | AGENTSAM_VECTORIZE_SCHEMA | schema_semantic_search |
| Stable session/workspace memory facts | **MEMORY** | AGENTSAM_VECTORIZE_MEMORY | memory_semantic_search |
| Image / video / audio / PDF (MovieMode) | **MEDIA** | AGENTSAM_VECTORIZE_MEDIA | media_semantic_search |
| LMS course catalog | **COURSES** | AGENTSAM_VECTORIZE_COURSES | — |
| Golden platform law / long ADRs @3072 | **DEEP ARCHIVE** | *(none)* | deep_archive_search |

### Production table map

| Content | Binding | Index | Supabase table | Dims |
|---------|---------|-------|----------------|------|
| Code / repo chunks | AGENTSAM_VECTORIZE_CODE | agentsam-codebase-oai3large-1536 | agentsam_codebase_chunks_oai3large_1536 | 1536 |
| DB/D1/KV/R2 schema atoms | AGENTSAM_VECTORIZE_SCHEMA | agentsam-schema-oai3large-1536 | agentsam_database_schema_oai3large_1536 | 1536 |
| Stable memory facts | AGENTSAM_VECTORIZE_MEMORY | agentsam-memory-oai3large-1536 | agentsam_memory_oai3large_1536 | 1536 |
| Docs / skills / knowledge | AGENTSAM_VECTORIZE_DOCUMENTS | agentsam-documents-oai3large-1536 | agentsam_documents_oai3large_1536 | 1536 |
| LMS courses | AGENTSAM_VECTORIZE_COURSES | agentsam-courses-oai3large-1536 | (course catalog) | 1536 |
| Image / video / audio / PDF | AGENTSAM_VECTORIZE_MEDIA | agentsam-moviemode-gemini2-1536 | agentsam_media_gemini2_1536 | 1536 Gemini |
| Golden platform law / ADRs | *(none)* | *(none)* | agentsam_deep_archive_oai3large_3072 | **3072** |

### Not current Agent Sam hot-path lanes (do not extend without migration)
| Table | Notes |
|-------|--------|
| agentsam_schema_oai3large_1536 | Legacy 9 rows — superseded by agentsam_database_schema_oai3large_1536 |
| agentsam_memory | Older table — use agentsam_memory_oai3large_1536 |
| agentsam_plans / agentsam_plans_embedded | Plan experiments — not in `rag-lanes.js` dispatch |

### Rules
- One lane per embed job; one primary lane per semantic query unless explicitly multi-lane
- Never mix 1536 OpenAI, 1536 Gemini, and 3072 OpenAI in one index
- Schema lane: **agentsam_database_schema_oai3large_1536** only for new writes
- Deep archive: Hyperdrive RPC only @ 3072 — no Vectorize upsert
- See per-lane rules: `rule_vectorize_lane_*`',
  updated_at_epoch = unixepoch(),
  notes = '591: explicit lane routing; forbid blind all-lane query.',
  source_stored = 'd1:agentsam_rules_document:rule_vectorize_router'
WHERE id = 'rule_vectorize_router';

-- ─── 5) MovieMode / media lane — R2 bytes, Supabase metadata only ───────────
UPDATE agentsam_rules_document
SET
  body_markdown = '## Lane: agentsam_media_gemini2_1536

**Platform:** Cloudflare Vectorize + Supabase pgvector | **Dims:** 1536 | **Binding:** AGENTSAM_VECTORIZE_MEDIA
**Index:** `agentsam-moviemode-gemini2-1536`
**Embedding model:** Google `gemini-embedding-2` @ 1536 — **NEVER** OpenAI `text-embedding-3-large` in this lane

### Storage law (canonical vs mirror)
| Store | Holds |
|-------|--------|
| **R2** | **Canonical media bytes** — image, video, audio, PDF files |
| **D1 `media_assets`** | Workspace-scoped asset registry (ids, R2 keys, mime, duration, workspace_id) |
| **Supabase `agentsam_media_gemini2_1536`** | **Derived search mirror only** — captions, tags, shot metadata, transcript snippets, Gemini embedding |
| **Cloudflare Vectorize** | Runtime ANN over the Supabase row UUID + embedding |

**No raw video blobs in Supabase.** Never store binary media in pgvector rows. Bytes live on R2; Supabase carries searchable text metadata + embedding vector only.

**Write when:** MovieMode / Design Studio uploads image, video, audio, or PDF; R2 asset stored; caption, tags, or transcript available for embed.

**Query when:** Agent or UI needs “find similar media”, asset recall by semantic description, timeline/media library search.

**Code paths:**
- `src/core/moviemode-media-vectorize.js`
- `src/core/embedding-routes.js` → `resolveMultimodalEmbeddingRoute()`
- `src/api/rag.js` → multimodal `createEmbedding`
- Semantic tool: `media_semantic_search` via `dispatchSemanticRetrieval`

**Chunk / input strategy:** Embed from caption + tags + optional transcript/summary/shot metadata — not raw video bytes in the vector payload.

**Do not use for:** codebase, schema SQL, markdown docs, or session memory — those are OpenAI 1536 lanes.

**Verify empty lane:** Supabase table may have 0 rows until first MovieMode ingest — index is bound and ready.',
  updated_at_epoch = unixepoch(),
  notes = '591: R2 canonical bytes; Supabase captions/tags/metadata/embeddings only; no raw video in Supabase.',
  source_stored = 'd1:agentsam_rules_document:rule_vectorize_lane_moviemode'
WHERE id = 'rule_vectorize_lane_moviemode';

-- ─── 6) Compact D1 memory playbook JSON ─────────────────────────────────────
UPDATE agentsam_memory
SET
  value = '{"skill":"skills/agentsam-vectorize-lanes/SKILL.md","law":"One index, one dimension, one model per lane. Never mix OpenAI 1536, Gemini 1536, and OpenAI 3072. Git/R2/D1 = source; Supabase/Vectorize = mirrors.","source_canonicality":["git","r2","d1_layer0"],"ingest_contract":["content_hash_skip","retry_backoff","run_receipts","prune_after_full_run"],"retired":["AGENTSAMVECTORIZE","VECTORIZE@1024","skill_agentsam_dual_vectorize_lanes"],"text_lanes":{"binding_prefix":"AGENTSAM_VECTORIZE_","model":"text-embedding-3-large","dims":1536,"dispatch":"src/core/semantic-retrieval-dispatch.js","route":"one_lane_per_query"},"media_lane":{"binding":"AGENTSAM_VECTORIZE_MEDIA","index":"agentsam-moviemode-gemini2-1536","table":"agentsam_media_gemini2_1536","model":"gemini-embedding-2","dims":1536,"bytes_on":"r2","supabase":"captions_tags_metadata_embeddings_only"},"deep_archive":{"table":"agentsam_deep_archive_oai3large_3072","dims":3072,"vectorize":null},"ingest_scripts":["scripts/reindex_codebase_dashboard_agent.mjs","scripts/ingest_r2_to_rag.mjs","scripts/ingest_repo_skills_rag.mjs","scripts/rag_ingest.mjs"],"describe":"GET /api/internal/agentsam-vectorize/describe"}',
  source = 'migration_591',
  updated_at = unixepoch()
WHERE key = 'schema_agentsam_vectorize_embed_pipeline';
