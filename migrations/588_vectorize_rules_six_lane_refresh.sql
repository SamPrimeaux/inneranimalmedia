-- 588: Refresh Vectorize rules for six-lane + deep archive + Gemini media architecture.
-- Supersedes AGENTSAMVECTORIZE / dual-lane (1024 vs 1536) guidance in D1 rules.
-- Skill: skills/agentsam-vectorize-lanes/SKILL.md
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/588_vectorize_rules_six_lane_refresh.sql

-- ─── 1) Retire dual-lane rule body (keep inactive) ───────────────────────────
UPDATE agentsam_rules_document
SET
  title = 'RETIRED — Dual Vectorize lane router (1024 vs 1536)',
  body_markdown = '## RETIRED (2026-06-06)

This rule and skill `skill_agentsam_dual_vectorize_lanes` are **inactive**. Do not cite `VECTORIZE` @1024 vs `AGENTSAMVECTORIZE`.

**Use instead:**
- Skill: `skills/agentsam-vectorize-lanes/SKILL.md` (R2 + repo)
- Rule: `rule_iam_bindings_vectorize_api_map` (always-on system)
- Rule: `rule_vectorize_router` + `vectorize_dimension_integrity_rule`
- Rule: `rule_agentsam_vectorize_embed_pipeline` (ingest playbook)

Agent Sam chat uses **six** `AGENTSAM_VECTORIZE_*` bindings @1536 (OpenAI text + Gemini media) plus **deep archive** @3072 (Supabase only).',
  is_active = 0,
  updated_at_epoch = unixepoch(),
  notes = 'Retired by 588; replaced by agentsam-vectorize-lanes skill + six-lane rules.',
  source_stored = 'd1:agentsam_rules_document:rule_agentsam_dual_vectorize_lanes'
WHERE id = 'rule_agentsam_dual_vectorize_lanes';

-- ─── 2) Embed pipeline playbook (replace AGENTSAMVECTORIZE-centric text) ─────
UPDATE agentsam_rules_document
SET
  title = 'Agent Sam six-lane embed pipeline (1536 + archive + media)',
  body_markdown = '## Agent Sam embed pipeline (2026-06)

**Law:** One index · one dimension · one embedding model per lane. Never mix vector spaces in the same index.

**Canonical skill:** `skills/agentsam-vectorize-lanes/SKILL.md` · **Code:** `src/core/rag-lanes.js` · `src/core/semantic-retrieval-dispatch.js`

### RETIRED — do not use for new work
- `AGENTSAMVECTORIZE` → `inneranimalmedia-vectors`
- Legacy `VECTORIZE` / Managed AI Search @ **1024**
- `public.documents` / `public.agent_memory`

### Before any embed or upsert
1. Pick **lane** (`rule_vectorize_router`).
2. Confirm **binding → index → Supabase table** (`rule_iam_bindings_vectorize_api_map`).
3. Run embed with lane model: OpenAI `text-embedding-3-large` @ **1536** (text lanes) · Gemini `gemini-embedding-2` @ **1536** (media only) · OpenAI @ **3072** full dims (deep archive, no Vectorize).
4. Write **Supabase first** (full text + embedding), then **Vectorize upsert** with Supabase row UUID as vector `id`.
5. Optional D1 receipt: `vectorize_sync_log` (`run:*`, `r2:*` — coarse, not per-chunk UUIDs).

### Ingest scripts (operator)
| Content | Script | Lane |
|---------|--------|------|
| Dashboard/agent code (171 files) | `scripts/reindex_codebase_dashboard_agent.mjs` | CODE |
| R2 knowledge/recipes/skills refs | `scripts/ingest_r2_to_rag.mjs` | DOCUMENTS |
| Repo `skills/*/SKILL.md` | `scripts/ingest_repo_skills_rag.mjs` | DOCUMENTS |
| Golden platform docs | `scripts/rag_ingest.mjs --lane deep_archive` | archive 3072 |
| Full Vectorize resync | `scripts/rag_ingest.mjs --lane all --update-registry` | all bound |

### Runtime query
`dispatchSemanticRetrieval` → Vectorize.query (filter `workspace_id: ws_*`) → Hyperdrive hydrate → pgvector fallback.

### D1 memory key
`agentsam_memory.key = schema_agentsam_vectorize_embed_pipeline` (updated by migration 588).',
  trigger_type = 'keyword',
  trigger_condition_json = '{"keywords":["embed","embedding","vectorize","chunk","reindex","ingest_r2","rag_ingest","AGENTSAM_VECTORIZE","code_semantic_search","docs_knowledge_search","semantic retrieval","upsert vector","re-embed","agentsam-vectorize-lanes"],"match":"any","min_matches":1}',
  apply_mode = 'always',
  is_active = 1,
  sort_order = 7,
  updated_at_epoch = unixepoch(),
  notes = 'Six-lane playbook; supersedes AGENTSAMVECTORIZE-only guidance from 393.',
  source_stored = 'd1:agentsam_rules_document:rule_agentsam_vectorize_embed_pipeline'
WHERE id = 'rule_agentsam_vectorize_embed_pipeline';

-- ─── 3) Dimension integrity (three vector spaces, six CF bindings) ───────────
UPDATE agentsam_rules_document
SET
  title = 'Vectorize dimension integrity — one index, one model, one dimension',
  body_markdown = '# Vectorize Dimension Integrity Rule

## THE RULE
One index. One dimension. One model. **Never mix.** Wrong-dimension vectors corrupt ANN silently — no error, garbage results.

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

## Text lanes @1536 (OpenAI — same model at index and query)

| Binding | CF index | Supabase table (canonical) |
|---------|----------|----------------------------|
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

## Dual-write architecture
**Vectorize** = fast edge ANN search. **Supabase pgvector** = canonical full text + embedding + analytics + fallback.
Vector id **must** equal Supabase row UUID when both are used.
Tables with `vectorize_binding`, `vectorize_index`, `vectorize_id` columns are designed for this mirror pattern.

## Hard stops
- describe()/schema probe fails → STOP
- model dims ≠ index dims → STOP
- OpenAI embed into media index → STOP
- 1536 vector into 3072 table or index → STOP',
  apply_mode = 'always',
  is_active = 1,
  updated_at_epoch = unixepoch(),
  notes = 'Refreshed 588 for six-lane + Gemini media + 3072 archive.',
  source_stored = 'd1:agentsam_rules_document:vectorize_dimension_integrity_rule'
WHERE id = 'vectorize_dimension_integrity_rule';

-- ─── 4) Lane router ─────────────────────────────────────────────────────────
UPDATE agentsam_rules_document
SET
  title = 'Vectorize lane router (content type → binding → table)',
  body_markdown = '## Vectorize Lane Router

Before embedding or querying, select lane by **content type** — not by convenience.

### Architecture (2026-06)
```
R2 / git source  →  ingest script or writeToLane  →  Supabase pgvector (canonical text)
                                                   →  Cloudflare Vectorize (ANN mirror)
Runtime query: Vectorize first → Hyperdrive hydrate → pgvector fallback
Layer 0 (D1): agentsam_project_context / agentsam_context_digest — prompt inject, NOT vector search
```

### Production semantic lanes

| Content | Binding | Index | Supabase table | Dims | Tool |
|---------|---------|-------|----------------|------|------|
| Code / repo chunks | AGENTSAM_VECTORIZE_CODE | agentsam-codebase-oai3large-1536 | agentsam_codebase_chunks_oai3large_1536 | 1536 | code_semantic_search |
| DB/D1/KV/R2 schema atoms | AGENTSAM_VECTORIZE_SCHEMA | agentsam-schema-oai3large-1536 | agentsam_database_schema_oai3large_1536 | 1536 | schema_semantic_search |
| Stable memory facts | AGENTSAM_VECTORIZE_MEMORY | agentsam-memory-oai3large-1536 | agentsam_memory_oai3large_1536 | 1536 | memory_semantic_search |
| Docs / skills / knowledge / compaction_digest | AGENTSAM_VECTORIZE_DOCUMENTS | agentsam-documents-oai3large-1536 | agentsam_documents_oai3large_1536 | 1536 | docs_knowledge_search |
| LMS courses | AGENTSAM_VECTORIZE_COURSES | agentsam-courses-oai3large-1536 | (course catalog) | 1536 | — |
| Image / video / audio / PDF (MovieMode) | AGENTSAM_VECTORIZE_MEDIA | agentsam-moviemode-gemini2-1536 | agentsam_media_gemini2_1536 | 1536 Gemini | media_semantic_search |
| Golden platform law / long ADRs | *(none)* | *(none)* | agentsam_deep_archive_oai3large_3072 | **3072** | deep_archive_search |

### Not current Agent Sam hot-path lanes (do not extend without migration)
| Table | Notes |
|-------|--------|
| agentsam_schema_oai3large_1536 | Legacy 9 rows — superseded by agentsam_database_schema_oai3large_1536 |
| agentsam_memory | Older table with embedding column — use agentsam_memory_oai3large_1536 |
| agentsam_plans / agentsam_plans_embedded | Plan similarity experiments — not in `rag-lanes.js` dispatch |

### Rules
- Never mix 1536 OpenAI, 1536 Gemini, and 3072 OpenAI in one index
- Schema lane: **agentsam_database_schema_oai3large_1536** only for new writes
- Deep archive: Hyperdrive RPC only @ 3072 — no Vectorize upsert
- See per-lane rules: `rule_vectorize_lane_*`',
  apply_mode = 'always',
  trigger_type = 'keyword',
  trigger_condition_json = '{"keywords":["which vectorize","which lane","where to embed","vectorize router","semantic lane","RAG lane","code vs docs","schema lane","media lane","moviemode embed"],"match":"any","min_matches":1}',
  is_active = 1,
  sort_order = 6,
  updated_at_epoch = unixepoch(),
  notes = 'Router refreshed 588; includes media + dual-write model.',
  source_stored = 'd1:agentsam_rules_document:rule_vectorize_router'
WHERE id = 'rule_vectorize_router';

-- ─── 5) Fix schema lane rule (canonical table) ───────────────────────────────
UPDATE agentsam_rules_document
SET
  body_markdown = '## Lane: agentsam_database_schema_oai3large_1536

**Platform:** Cloudflare Vectorize + Supabase pgvector | **Dims:** 1536 OpenAI | **Binding:** AGENTSAM_VECTORIZE_SCHEMA

**Canonical table:** `agentsam.agentsam_database_schema_oai3large_1536` (HNSW cosine index).

**Legacy (read-only, do not insert):** `agentsam_schema_oai3large_1536` (~9 rows).

**Write when:** D1/Supabase/KV/R2 schema objects, migrations, binding maps, table purpose atoms.

**Query when:** Agent needs table/column/index awareness, migration safety, handler↔binding wiring.

**Do not use for:** codebase implementation, long prose docs, or media assets.',
  updated_at_epoch = unixepoch()
WHERE id = 'rule_vectorize_lane_schema';

-- ─── 6) NEW — MovieMode / media lane ─────────────────────────────────────────
INSERT OR IGNORE INTO agentsam_rules_document (
  id, user_id, workspace_id, title, body_markdown, version, is_active,
  created_at_epoch, updated_at_epoch, person_uuid, apply_mode, globs, os_platform,
  trigger_type, trigger_condition_json, sort_order, input_prompt_json,
  execution_template, rule_type, notes, source_stored, source_url
) VALUES (
  'rule_vectorize_lane_moviemode',
  '',
  'ws_inneranimalmedia',
  'Vectorize Lane: Media / MovieMode (1536 Gemini)',
  '## Lane: agentsam_media_gemini2_1536

**Platform:** Cloudflare Vectorize + Supabase pgvector | **Dims:** 1536 | **Binding:** AGENTSAM_VECTORIZE_MEDIA
**Index:** `agentsam-moviemode-gemini2-1536`
**Embedding model:** Google `gemini-embedding-2` @ 1536 — **NEVER** OpenAI `text-embedding-3-large` in this lane

**SSOT for asset metadata:** D1 `media_assets` (workspace-scoped). Supabase row mirrors caption + embedding for search.

**Write when:** MovieMode / Design Studio uploads image, video, audio, or PDF; R2 asset stored; caption or transcript available for embed.

**Query when:** Agent or UI needs “find similar media”, asset recall by semantic description, timeline/media library search.

**Code paths:**
- `src/core/moviemode-media-vectorize.js`
- `src/core/embedding-routes.js` → `resolveMultimodalEmbeddingRoute()`
- `src/api/rag.js` → multimodal `createEmbedding`
- Semantic tool: `media_semantic_search` via `dispatchSemanticRetrieval`

**Chunk / input strategy:** Embed from caption + optional transcript/summary — not raw video bytes in the vector payload. Bytes live on R2; vector carries searchable text metadata.

**Do not use for:** codebase, schema SQL, markdown docs, or session memory — those are OpenAI 1536 lanes.

**Verify empty lane:** Supabase table may have 0 rows until first MovieMode ingest — index is bound and ready.',
  1,
  1,
  unixepoch(),
  unixepoch(),
  '',
  'on_request',
  '',
  'any',
  'keyword',
  '{"keywords":["moviemode","movie mode","media embed","gemini-embedding","video search","image search","AGENTSAM_VECTORIZE_MEDIA","media_semantic_search","media_assets"],"match":"any","min_matches":1}',
  15,
  '{}',
  '',
  'instruction',
  'Gemini-only media lane; separate from OpenAI text RAG @1536.',
  'd1:agentsam_rules_document:rule_vectorize_lane_moviemode',
  ''
);

UPDATE agentsam_rules_document
SET
  title = 'Vectorize Lane: Media / MovieMode (1536 Gemini)',
  is_active = 1,
  apply_mode = 'on_request',
  trigger_type = 'keyword',
  trigger_condition_json = '{"keywords":["moviemode","movie mode","media embed","gemini-embedding","video search","image search","AGENTSAM_VECTORIZE_MEDIA","media_semantic_search","media_assets"],"match":"any","min_matches":1}',
  updated_at_epoch = unixepoch(),
  source_stored = 'd1:agentsam_rules_document:rule_vectorize_lane_moviemode'
WHERE id = 'rule_vectorize_lane_moviemode';

-- ─── 7) Refresh always-on bindings map (six bindings + media + documents) ──
UPDATE agentsam_rules_document
SET
  body_markdown = '## IAM OS — bindings, Vectorize, and APIs (always on)

Full doc: `docs/platform/bindings-vectorize-api-map-2026-06.md` · Skill: `skills/agentsam-vectorize-lanes/SKILL.md`

**When answering Vectorize / binding / RAG questions:** prefer retrieved lane context blocks in this prompt over parametric memory. Never cite retired bindings below.

### RETIRED (do not mention as current)
- `AGENTSAMVECTORIZE` → `inneranimalmedia-vectors`
- Legacy `VECTORIZE` → `ai-search-inneranimalmedia-autorag` @1024 (AutoRAG `/api/search` only)
- `AI_SEARCH_ENDPOINT` for Agent chat semantic lanes
- Dual-lane skill `skill_agentsam_dual_vectorize_lanes`

### Six Vectorize bindings (2026-06)

| Binding | Index | Supabase table | Semantic lane | Embed model |
|---------|-------|----------------|---------------|-------------|
| AGENTSAM_VECTORIZE_CODE | agentsam-codebase-oai3large-1536 | agentsam_codebase_chunks_oai3large_1536 | code_semantic_search | OpenAI 1536 |
| AGENTSAM_VECTORIZE_SCHEMA | agentsam-schema-oai3large-1536 | agentsam_database_schema_oai3large_1536 | schema_semantic_search | OpenAI 1536 |
| AGENTSAM_VECTORIZE_MEMORY | agentsam-memory-oai3large-1536 | agentsam_memory_oai3large_1536 | memory_semantic_search | OpenAI 1536 |
| AGENTSAM_VECTORIZE_DOCUMENTS | agentsam-documents-oai3large-1536 | agentsam_documents_oai3large_1536 | docs_knowledge_search | OpenAI 1536 |
| AGENTSAM_VECTORIZE_COURSES | agentsam-courses-oai3large-1536 | *(LMS catalog)* | — | OpenAI 1536 |
| AGENTSAM_VECTORIZE_MEDIA | agentsam-moviemode-gemini2-1536 | agentsam_media_gemini2_1536 | media_semantic_search | **Gemini 1536** |

### Deep archive @ 3072 (Hyperdrive only — no Vectorize)
- Table: `agentsam_deep_archive_oai3large_3072`
- Lane/tool: `deep_archive_search`

### Query path
`dispatchSemanticRetrieval`: Vectorize first → Hyperdrive pgvector fallback → hydrate Postgres.
Deep archive: Hyperdrive RPC @ 3072d only.

### Dual-write
Supabase stores canonical chunk text + embedding; Vectorize mirrors ANN with same UUID id.

### Re-sync Vectorize from Supabase
`./scripts/with-cloudflare-env.sh node scripts/rag_ingest.mjs --lane all --update-registry`',
  updated_at_epoch = unixepoch()
WHERE id = 'rule_iam_bindings_vectorize_api_map';

-- ─── 8) Compact D1 memory playbook JSON ─────────────────────────────────────
UPDATE agentsam_memory
SET
  value = '{"skill":"skills/agentsam-vectorize-lanes/SKILL.md","law":"One index, one dimension, one model per lane. Never mix OpenAI 1536, Gemini 1536, and OpenAI 3072 in the same index.","retired":["AGENTSAMVECTORIZE","VECTORIZE@1024","skill_agentsam_dual_vectorize_lanes"],"text_lanes":{"binding_prefix":"AGENTSAM_VECTORIZE_","model":"text-embedding-3-large","dims":1536,"dispatch":"src/core/semantic-retrieval-dispatch.js"},"media_lane":{"binding":"AGENTSAM_VECTORIZE_MEDIA","index":"agentsam-moviemode-gemini2-1536","table":"agentsam_media_gemini2_1536","model":"gemini-embedding-2","dims":1536},"deep_archive":{"table":"agentsam_deep_archive_oai3large_3072","dims":3072,"vectorize":null},"ingest_scripts":["scripts/reindex_codebase_dashboard_agent.mjs","scripts/ingest_r2_to_rag.mjs","scripts/ingest_repo_skills_rag.mjs","scripts/rag_ingest.mjs"],"describe":"GET /api/internal/agentsam-vectorize/describe"}',
  source = 'migration_588',
  updated_at = unixepoch()
WHERE key = 'schema_agentsam_vectorize_embed_pipeline';
