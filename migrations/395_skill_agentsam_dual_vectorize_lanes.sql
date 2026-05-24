-- 395: Situation-aware skill — choose VECTORIZE 1024 vs AGENTSAMVECTORIZE 1536 (never mix).
-- Companion: agentsam_memory.schema_agentsam_vectorize_embed_pipeline, wf_agentsam_codebase_embed.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/395_skill_agentsam_dual_vectorize_lanes.sql

-- ─── Registry rows (canonical product bindings — verify live describe()) ───────

INSERT OR IGNORE INTO vectorize_index_registry (
  id, tenant_id, binding_name, index_name, display_name, source_type,
  dimensions, metric, is_preferred, is_active, stored_vectors, queries_30d, avg_latency_ms,
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
  0,
  0,
  0,
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
  0,
  0,
  0,
  'Agent Sam lane: agent_memory, codebase_chunks, curated recall, codebase embed workflow. Describe() before embed. Same model at index + query.',
  '["agent_memory","codebase_chunks","codebase_search","semantic_recall","chat_memory"]',
  datetime('now'),
  datetime('now')
);

UPDATE vectorize_index_registry
SET binding_name = 'VECTORIZE', index_name = 'ai-search-inneranimalmedia-autorag', dimensions = 1024,
    description = 'Legacy RAG lane (1024). Tools: knowledge_search, rag_ingest, unifiedRagSearch. Tables: public.documents @1024.',
    use_cases = '["documents","knowledge","autorag","unified_rag"]', is_active = 1, updated_at = datetime('now')
WHERE id = 'vidx_autorag_1024';

UPDATE vectorize_index_registry
SET binding_name = 'AGENTSAMVECTORIZE', index_name = 'inneranimalmedia-vectors', dimensions = 1536,
    description = 'Agent Sam lane (1536). Tools: agentsam_vectorize_*, searchCuratedAgentMemory, searchCodebase. Memory key: schema_agentsam_vectorize_embed_pipeline.',
    use_cases = '["agent_memory","codebase_chunks","codebase_search"]', is_active = 1, is_preferred = 1, updated_at = datetime('now')
WHERE id = 'vidx_agentsam_vectors';

-- ─── D1 memory pointer (compact router index) ────────────────────────────────

INSERT INTO agentsam_memory (
  id, tenant_id, user_id, workspace_id, memory_type, key, value, session_id, source, confidence
) VALUES (
  'mem_schema_agentsam_dual_vectorize_lanes',
  'tenant_sam_primeaux',
  'au_871d920d1233cbd1',
  'ws_inneranimalmedia',
  'project',
  'schema_agentsam_dual_vectorize_lanes',
  '{"skill_id":"skill_agentsam_dual_vectorize_lanes","law":"One index, one dimension, one model — never mix lanes in the same index.","lanes":{"1024":{"binding":"VECTORIZE","index":"ai-search-inneranimalmedia-autorag","registry_id":"vidx_autorag_1024","env":"RAG_EMBEDDING_DIMENSIONS","tools":["knowledge_search","rag_ingest","rag_status"],"tables":["public.documents"],"code":["src/api/rag.js createEmbedding","unifiedRagSearch"]},"1536":{"binding":"AGENTSAMVECTORIZE","index":"inneranimalmedia-vectors","registry_id":"vidx_agentsam_vectors","env":"AGENTSAM_EMBEDDING_DIMENSIONS","tools":["agentsam_vectorize_describe","vectorize_query","vectorize_upsert","workspace_search_semantic"],"tables":["public.agent_memory","public.codebase_chunks"],"code":["src/core/agentsam-vectorize-index.js","src/core/codebase-search.js"],"workflow":"agentsam_codebase_embed","memory_key":"schema_agentsam_vectorize_embed_pipeline"}},"verify":["env.AGENTSAMVECTORIZE.describe()","env binding wrangler.production.toml","SELECT * FROM vectorize_index_registry WHERE is_active=1","python3 scripts/embed-codebase.py --describe-only"]}',
  'session_registry',
  'migration_395',
  1.0
)
ON CONFLICT(tenant_id, user_id, key) DO UPDATE SET
  value = excluded.value,
  updated_at = unixepoch();

-- ─── Skill (situation-aware, task-triggered) ─────────────────────────────────

INSERT OR IGNORE INTO agentsam_skill (
  id, tenant_id, user_id, person_uuid, workspace_id, name, description,
  content_markdown, file_path, scope, slash_trigger, globs, always_apply,
  task_types_json, route_keys_json, default_model_key, model_constraints_json,
  access_mode, icon, tags_json, metadata_json, token_estimate, version,
  is_active, sort_order, created_at, updated_at
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
- `embed-codebase-describe` → smoke only (**1536**)',
  'skills/agentsam-dual-vectorize-lanes/SKILL.md',
  'workspace',
  'vector-lane',
  '[]',
  0,
  '["research","rag","embed","memory","codebase","knowledge","vectorize","semantic","auto","inference","documents"]',
  '["agent_research","agent_general","agent_database","general","chat"]',
  NULL,
  '{}',
  'read',
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
SET
  description = 'Situation-aware guide: when to use VECTORIZE (documents/RAG) vs AGENTSAMVECTORIZE (memory/code). Always verify dimensions via describe() before embed or query.',
  task_types_json = '["research","rag","embed","memory","codebase","knowledge","vectorize","semantic","auto","inference","documents"]',
  route_keys_json = '["agent_research","agent_general","agent_database","general","chat"]',
  tags_json = '["vectorize","rag","embed","memory","codebase","1024","1536","agentsam"]',
  metadata_json = '{"memory_key":"schema_agentsam_dual_vectorize_lanes","companion_memory":"schema_agentsam_vectorize_embed_pipeline","registry_ids":{"1024":"vidx_autorag_1024","1536":"vidx_agentsam_vectors"},"workflows":{"codebase_embed":"agentsam_codebase_embed"}}',
  sort_order = 3,
  is_active = 1,
  updated_at = datetime('now')
WHERE id = 'skill_agentsam_dual_vectorize_lanes';

-- ─── Keyword rule (inject when user asks which index/lane) ───────────────────

INSERT OR IGNORE INTO agentsam_rules_document (
  id, user_id, workspace_id, title, body_markdown, version, is_active,
  created_at_epoch, updated_at_epoch, person_uuid, apply_mode, globs, os_platform,
  trigger_type, trigger_condition_json, sort_order, input_prompt_json,
  execution_template, rule_type, notes, source_stored, source_url
) VALUES (
  'rule_agentsam_dual_vectorize_lanes',
  '',
  'ws_inneranimalmedia',
  'Dual Vectorize lane router (1024 vs 1536)',
  'When choosing Vectorize or embeddings: read D1 skill **skill_agentsam_dual_vectorize_lanes** and memory **schema_agentsam_dual_vectorize_lanes**. Documents/RAG/lesson ingest → VECTORIZE @1024. Agent memory/codebase → AGENTSAMVECTORIZE @1536. Call describe() before any embed; never mix dimensions.',
  1,
  1,
  unixepoch(),
  unixepoch(),
  '',
  'always',
  '',
  'any',
  'keyword',
  '{"keywords":["which vectorize","1024","1536","VECTORIZE","AGENTSAMVECTORIZE","documents lane","memory lane","autorag","inneranimalmedia-vectors","knowledge base","codebase embed","dual vector","vector lane","RAG index"],"match":"any","min_matches":1}',
  7,
  '{}',
  '',
  'instruction',
  'Companion to skill_agentsam_dual_vectorize_lanes; injects lane choice into system prompt.',
  'd1:agentsam_rules_document:rule_agentsam_dual_vectorize_lanes',
  ''
);

-- ─── Capability + command discovery ────────────────────────────────────────────

INSERT INTO agentsam_capability_aliases (
  abstract_capability, match_kind, match_value, capability_lane,
  priority, requires_approval, is_mutation, rationale
) VALUES
  ('skill.vectorize_lane_router', 'memory_key', 'schema_agentsam_dual_vectorize_lanes', 'research', 3, 0, 0, 'Dual Vectorize lane router + skill_agentsam_dual_vectorize_lanes.'),
  ('rag.lane.documents', 'memory_key', 'schema_agentsam_dual_vectorize_lanes', 'research', 8, 0, 0, '1024 documents/AutoRAG lane playbook.'),
  ('embed.lane.agentsam', 'memory_key', 'schema_agentsam_vectorize_embed_pipeline', 'research', 8, 0, 0, '1536 Agent Sam embed playbook.')
ON CONFLICT (abstract_capability, match_kind, match_value) DO UPDATE SET
  capability_lane = excluded.capability_lane,
  priority = excluded.priority,
  rationale = excluded.rationale,
  is_active = 1,
  updated_at = datetime('now');

INSERT OR IGNORE INTO agentsam_commands (
  id, workspace_id, tenant_id, slug, display_name, description, pattern, pattern_type,
  mapped_command, category, risk_level, show_in_slash, workflow_key, router_type, is_active, sort_order, internal_seo
) VALUES (
  'cmd_vector_lane_router',
  'ws_inneranimalmedia',
  'tenant_sam_primeaux',
  'vector-lane',
  'Vectorize lane router (1024 vs 1536)',
  'Loads dual-vectorize skill: documents vs agent_memory/codebase lane choice.',
  'vector lane',
  'contains',
  'd1_query: SELECT id,name FROM agentsam_skill WHERE id=''skill_agentsam_dual_vectorize_lanes''',
  'research',
  'low',
  1,
  NULL,
  'tool',
  1,
  39,
  'VECTORIZE 1024 AGENTSAMVECTORIZE 1536 router'
);
