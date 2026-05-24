-- 396: Fix dual-vectorize lane skill + registry rows.
-- Reason: migration 395 used invalid agentsam_skill.access_mode value ('read'),
-- which violates CHECK(access_mode IN ('read_only','read_write')) and prevented insert.
--
-- Apply:
--   cd /Users/samprimeaux/inneranimalmedia
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/396_fix_skill_agentsam_dual_vectorize_lanes.sql

-- ─── Vectorize registry rows (canonical bindings) ────────────────────────────

INSERT OR IGNORE INTO vectorize_index_registry (
  id, tenant_id, binding_name, index_name, display_name, source_type,
  dimensions, metric, is_preferred, is_active,
  description, use_cases, created_at, updated_at
) VALUES
(
  'vidx_autorag_1024',
  'tenant_sam_primeaux',
  'VECTORIZE',
  'ai-search-inneranimalmedia-autorag',
  'AutoRAG / documents (1024)',
  'vectorize',
  1024,
  'cosine',
  0,
  1,
  'Legacy RAG lane: public.documents, knowledge ingest, unifiedRagSearch. Env RAG_EMBEDDING_DIMENSIONS=1024. Do not write 1536-d vectors here.',
  '["documents","knowledge","autorag","unified_rag","session_summaries_1024"]',
  datetime('now'),
  datetime('now')
),
(
  'vidx_agentsam_vectors',
  'tenant_sam_primeaux',
  'AGENTSAMVECTORIZE',
  'inneranimalmedia-vectors',
  'Agent Sam memory + code (1536)',
  'vectorize',
  1536,
  'cosine',
  1,
  1,
  'Agent Sam lane: agent_memory, codebase_chunks, curated recall, codebase embed workflow. Describe() before embed. Same model at index + query.',
  '["agent_memory","codebase_chunks","codebase_search","semantic_recall","chat_memory"]',
  datetime('now'),
  datetime('now')
);

UPDATE vectorize_index_registry
SET binding_name = 'VECTORIZE',
    index_name = 'ai-search-inneranimalmedia-autorag',
    display_name = 'AutoRAG / documents (1024)',
    source_type = 'vectorize',
    dimensions = 1024,
    metric = 'cosine',
    is_preferred = 0,
    is_active = 1,
    description = 'Legacy RAG lane (1024). Tools: knowledge_search, rag_ingest, unifiedRagSearch. Tables: public.documents @1024.',
    use_cases = '["documents","knowledge","autorag","unified_rag"]',
    updated_at = datetime('now')
WHERE id = 'vidx_autorag_1024';

UPDATE vectorize_index_registry
SET binding_name = 'AGENTSAMVECTORIZE',
    index_name = 'inneranimalmedia-vectors',
    display_name = 'Agent Sam memory + code (1536)',
    source_type = 'vectorize',
    dimensions = 1536,
    metric = 'cosine',
    is_preferred = 1,
    is_active = 1,
    description = 'Agent Sam lane (1536). Tools: agentsam_vectorize_*, searchCuratedAgentMemory, searchCodebase. Memory key: schema_agentsam_vectorize_embed_pipeline.',
    use_cases = '["agent_memory","codebase_chunks","codebase_search"]',
    updated_at = datetime('now')
WHERE id = 'vidx_agentsam_vectors';

-- ─── Skill (situation-aware, task-triggered) ─────────────────────────────────

INSERT OR IGNORE INTO agentsam_skill (
  id, tenant_id, user_id, person_uuid, workspace_id,
  name, description, content_markdown,
  file_path, scope, slash_trigger, globs, always_apply,
  task_types_json, route_keys_json,
  default_model_key, model_constraints_json,
  access_mode, icon,
  tags_json, metadata_json,
  token_estimate, version, is_active, sort_order,
  created_at, updated_at
) VALUES (
  'skill_agentsam_dual_vectorize_lanes',
  'tenant_sam_primeaux',
  'au_871d920d1233cbd1',
  '',
  'ws_inneranimalmedia',
  'Dual Vectorize lane router (1024 vs 1536)',
  'Situation-aware guide: when to use VECTORIZE (documents/RAG) vs AGENTSAMVECTORIZE (memory/code). Always verify dimensions via describe() before embed or query.',
  '# Dual Vectorize lanes — situation router

**Law:** One Cloudflare Vectorize index = one dimension = one embedding model. **Never** upsert or query with the wrong dimension. **Never** assume 1536 or 1024 without checking.

## Step 0 — Verify (every time)

1. **1536 lane:** `env.AGENTSAMVECTORIZE.describe()` or `GET /api/internal/agentsam-vectorize/describe` or `python3 scripts/embed-codebase.py --describe-only`
2. **1024 lane:** `wrangler.production.toml` binding `VECTORIZE` → index `ai-search-inneranimalmedia-autorag`, `RAG_EMBEDDING_DIMENSIONS=1024`
3. **D1:** `SELECT id, binding_name, index_name, dimensions, metric FROM vectorize_index_registry WHERE is_active=1`
4. **Memory keys:** `schema_agentsam_dual_vectorize_lanes` (this router), `schema_agentsam_vectorize_embed_pipeline` (1536 embed ops)

---

## Lane A — **1024** (`VECTORIZE` / AutoRAG / documents)

| | |
|---|---|
| **Binding** | `env.VECTORIZE` |
| **Index** | `ai-search-inneranimalmedia-autorag` |
| **Typical dims** | **1024** (confirm live) |
| **Embed model** | `text-embedding-3-large` truncated to 1024 (`RAG_OPENAI_EMBEDDING_MODEL` + `RAG_EMBEDDING_DIMENSIONS`) |
| **Code** | `src/api/rag.js` → `createEmbedding()`, `unifiedRagSearch()` |

**Use when the user or task involves:**
- Ingesting **documents**, PDFs, markdown knowledge, AutoRAG bucket paths (`knowledge/`, `docs/`)
- **`public.documents`** semantic search
- Legacy **unified RAG** / knowledge_search / rag_ingest
- **Lesson plans & long-form curriculum** meant as **browsable knowledge** (tomorrow''s docs → ingest here unless they must appear in **code search**)

**Tools:** `knowledge_search`, `rag_ingest`, `rag_status`, `rag.embed` capability aliases

**Do not use for:** `agent_memory`, codebase chunks, `wf_agentsam_codebase_embed`, curated chat recall @1536

---

## Lane B — **1536** (`AGENTSAMVECTORIZE` / Agent Sam)

| | |
|---|---|
| **Binding** | `env.AGENTSAMVECTORIZE` |
| **Index** | `inneranimalmedia-vectors` |
| **Typical dims** | **1536** (confirm via describe()) |
| **Embed model** | `text-embedding-3-large` @1536 (`AGENTSAM_EMBEDDING_DIMENSIONS`) — same at **index and query** |
| **Code** | `src/core/agentsam-vectorize-index.js`, `src/core/codebase-search.js`, `createAgentsamEmbedding()` |

**Use when the user or task involves:**
- **`public.agent_memory`** curated recall, chat memory, hybrid search
- **Codebase** semantic search (`codebase_chunks`, `embed-codebase.py`, `index-codebase-live.py`)
- Workflow **`agentsam_codebase_embed`** (`embed_scope`: priority | full | describe_only)
- Upsert/query with `vectorize_*` tools bound to **AGENTSAMVECTORIZE**

**Tools:** `agentsam_vectorize_describe`, `vectorize_query`, `vectorize_upsert`, `workspace_search_semantic`

**Scripts:** `scripts/embed-codebase.py`, `scripts/index-codebase-live.py`

**Do not use for:** raw `documents` table @1024, AutoRAG-only ingest

---

## Quick decision (user intent → lane)

| User says / task | Lane |
|------------------|------|
| "Search the knowledge base / documents / ingest PDF" | **1024** |
| "Remember this for later / agent memory / session recall" | **1536** |
| "Search the codebase / which file / embed repo" | **1536** |
| "Reindex codebase / vectorize src" | **1536** + workflow `agentsam_codebase_embed` |
| "Lesson plan / curriculum markdown for RAG" | **1024** (default) — use **1536** only if also indexing `learn/` for code search |
| "Parity audit / both indexes" | Read both registries; **separate** embed jobs per lane |

---

## Both lanes in one session

Allowed: run **1024 ingest** then **1536 codebase embed** as **two jobs** with **two models** and **two indexes**.

Forbidden: one embedding array written to both indexes; reusing query vectors across lanes; hardcoding dimensions in new code.

---

## Slash / commands

- `/vector-lane` — re-read this skill
- `embed-codebase-priority` → workflow `agentsam_codebase_embed` (**1536**)
- `embed-codebase-describe` → smoke only (**1536**)
',
  'skills/agentsam-dual-vectorize-lanes/SKILL.md',
  'workspace',
  'vector-lane',
  '[]',
  0,
  '["research","rag","embed","memory","codebase","knowledge","vectorize","semantic","auto","inference","documents"]',
  '["agent_research","agent_general","agent_database","general","chat"]',
  NULL,
  '{}',
  'read_only',
  'layers',
  '["vectorize","rag","embed","memory","codebase","1024","1536","agentsam"]',
  '{"memory_key":"schema_agentsam_dual_vectorize_lanes","companion_memory":"schema_agentsam_vectorize_embed_pipeline","registry_ids":{"1024":"vidx_autorag_1024","1536":"vidx_agentsam_vectors"},"workflows":{"codebase_embed":"agentsam_codebase_embed"}}',
  2200,
  1,
  1,
  3,
  datetime('now'),
  datetime('now')
);

UPDATE agentsam_skill
SET access_mode = 'read_only',
    is_active = 1,
    updated_at = datetime('now')
WHERE id = 'skill_agentsam_dual_vectorize_lanes';

