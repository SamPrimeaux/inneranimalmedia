-- 533: Platform OS map rule (bindings + Vectorize lanes) + refresh vectorize_index_registry counts.
-- Doc: docs/platform/bindings-vectorize-api-map-2026-06.md
-- Ingest: scripts/rag_ingest.mjs --lane all (2026-06-04)
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/533_bindings_vectorize_api_map_rule.sql

INSERT OR IGNORE INTO agentsam_rules_document (
  id,
  user_id,
  workspace_id,
  title,
  body_markdown,
  version,
  is_active,
  created_at_epoch,
  updated_at_epoch,
  person_uuid,
  apply_mode,
  globs,
  os_platform,
  trigger_type,
  trigger_condition_json,
  sort_order,
  input_prompt_json,
  execution_template,
  rule_type,
  notes,
  source_stored,
  source_url
) VALUES (
  'rule_iam_bindings_vectorize_api_map',
  '',
  'ws_inneranimalmedia',
  'IAM bindings, Vectorize lanes, and API map',
  '## IAM OS — bindings, Vectorize, and APIs (always on)

Full doc: `docs/platform/bindings-vectorize-api-map-2026-06.md`

### Two repos / two surfaces
- **Main worker** `inneranimalmedia.com` — dashboard + in-app Agent Sam. Deploy: `npm run deploy:full`.
- **MCP worker** `mcp.inneranimalmedia.com` — external OAuth clients only.
- **Golden rule:** in-app Agent chat → `dispatchByToolCode` on main worker. Never route dashboard chat through MCP.

### Four Vectorize bindings @ 1536 (OpenAI text-embedding-3-large)
| Binding | Index | Supabase table | Semantic lane | Tool |
|---------|-------|----------------|---------------|------|
| AGENTSAM_VECTORIZE_CODE | agentsam-codebase-oai3large-1536 | agentsam_codebase_chunks_oai3large_1536 | code_semantic_search | code_semantic_search |
| AGENTSAM_VECTORIZE_SCHEMA | agentsam-schema-oai3large-1536 | agentsam_database_schema_oai3large_1536 | schema_semantic_search | schema_semantic_search |
| AGENTSAM_VECTORIZE_MEMORY | agentsam-memory-oai3large-1536 | agentsam_memory_oai3large_1536 | memory_semantic_search | memory_semantic_search |
| AGENTSAM_VECTORIZE_COURSES | agentsam-courses-oai3large-1536 | agentsam_documents_oai3large_1536 | docs_knowledge_search | docs_knowledge_search |

Deep archive (3072d): `agentsam_deep_archive_oai3large_3072` — Hyperdrive only, no Vectorize binding.

**Query path:** `dispatchSemanticRetrieval` (Vectorize first → Hyperdrive pgvector fallback → hydrate from Postgres).

**Docs lane quirk:** documents table + courses index until AGENTSAM_VECTORIZE_DOCUMENTS ships.

**Do not use** AI_SEARCH_ENDPOINT for Agent chat lanes (legacy 1024 `/api/search` only).

### Two DB lanes
- **D1** `env.DB` — control plane `agentsam_*` only (cf handler: d1.query / d1.write / d1.migrate).
- **Postgres** `env.HYPERDRIVE` — Supabase `agentsam` schema pgvector (hyperdrive handler: supabase.query / vector.search).

Never mix lanes. Never hardcode tenant_id or workspace_id strings in application code — resolve from session/D1.

### Key APIs
- POST /api/agent/chat — SSE; auto lane context + tool loop
- dispatchByToolCode → catalog-tool-executor (semantic_retrieval dispatcher for search tools)
- POST /api/search — legacy AI Search only

### Re-sync Vectorize from Supabase
`./scripts/with-cloudflare-env.sh node scripts/rag_ingest.mjs --lane all --update-registry`',
  1,
  1,
  unixepoch(),
  unixepoch(),
  '',
  'always',
  '',
  'any',
  'system',
  '{}',
  2,
  '{}',
  '',
  'instruction',
  'Injected every Agent Sam turn via appendTriggeredRulesToSystemPrompt. Companion: docs/platform/bindings-vectorize-api-map-2026-06.md',
  'd1:agentsam_rules_document:rule_iam_bindings_vectorize_api_map',
  'https://inneranimalmedia.com/dashboard/agent'
);

UPDATE agentsam_rules_document
SET
  title = 'IAM bindings, Vectorize lanes, and API map',
  apply_mode = 'always',
  trigger_type = 'system',
  sort_order = 2,
  is_active = 1,
  updated_at_epoch = unixepoch(),
  notes = 'Injected every Agent Sam turn. Companion: docs/platform/bindings-vectorize-api-map-2026-06.md',
  body_markdown = '## IAM OS — bindings, Vectorize, and APIs (always on)

Full doc: `docs/platform/bindings-vectorize-api-map-2026-06.md`

### Two repos / two surfaces
- **Main worker** `inneranimalmedia.com` — dashboard + in-app Agent Sam. Deploy: `npm run deploy:full`.
- **MCP worker** `mcp.inneranimalmedia.com` — external OAuth clients only.
- **Golden rule:** in-app Agent chat → `dispatchByToolCode` on main worker. Never route dashboard chat through MCP.

### Four Vectorize bindings @ 1536 (OpenAI text-embedding-3-large)
| Binding | Index | Supabase table | Semantic lane | Tool |
|---------|-------|----------------|---------------|------|
| AGENTSAM_VECTORIZE_CODE | agentsam-codebase-oai3large-1536 | agentsam_codebase_chunks_oai3large_1536 | code_semantic_search | code_semantic_search |
| AGENTSAM_VECTORIZE_SCHEMA | agentsam-schema-oai3large-1536 | agentsam_database_schema_oai3large_1536 | schema_semantic_search | schema_semantic_search |
| AGENTSAM_VECTORIZE_MEMORY | agentsam-memory-oai3large-1536 | agentsam_memory_oai3large_1536 | memory_semantic_search | memory_semantic_search |
| AGENTSAM_VECTORIZE_COURSES | agentsam-courses-oai3large-1536 | agentsam_documents_oai3large_1536 | docs_knowledge_search | docs_knowledge_search |

Deep archive (3072d): `agentsam_deep_archive_oai3large_3072` — Hyperdrive only, no Vectorize binding.

**Query path:** `dispatchSemanticRetrieval` (Vectorize first → Hyperdrive pgvector fallback → hydrate from Postgres).

**Docs lane quirk:** documents table + courses index until AGENTSAM_VECTORIZE_DOCUMENTS ships.

**Do not use** AI_SEARCH_ENDPOINT for Agent chat lanes (legacy 1024 `/api/search` only).

### Two DB lanes
- **D1** `env.DB` — control plane `agentsam_*` only (cf handler: d1.query / d1.write / d1.migrate).
- **Postgres** `env.HYPERDRIVE` — Supabase `agentsam` schema pgvector (hyperdrive handler: supabase.query / vector.search).

Never mix lanes. Never hardcode tenant_id or workspace_id strings in application code — resolve from session/D1.

### Key APIs
- POST /api/agent/chat — SSE; auto lane context + tool loop
- dispatchByToolCode → catalog-tool-executor (semantic_retrieval dispatcher for search tools)
- POST /api/search — legacy AI Search only

### Re-sync Vectorize from Supabase
`./scripts/with-cloudflare-env.sh node scripts/rag_ingest.mjs --lane all --update-registry`'
WHERE id = 'rule_iam_bindings_vectorize_api_map';

UPDATE vectorize_index_registry SET
  stored_vectors = 307,
  updated_at = datetime('now')
WHERE binding_name = 'AGENTSAM_VECTORIZE_COURSES';

UPDATE vectorize_index_registry SET
  stored_vectors = 192,
  updated_at = datetime('now')
WHERE binding_name = 'AGENTSAM_VECTORIZE_MEMORY';

UPDATE vectorize_index_registry SET
  stored_vectors = 593,
  updated_at = datetime('now')
WHERE binding_name = 'AGENTSAM_VECTORIZE_SCHEMA';

UPDATE vectorize_index_registry SET
  stored_vectors = 262,
  updated_at = datetime('now')
WHERE binding_name = 'AGENTSAM_VECTORIZE_CODE';
