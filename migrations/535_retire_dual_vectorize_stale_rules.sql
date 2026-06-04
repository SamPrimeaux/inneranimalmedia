-- 535: Retire stale dual-lane Vectorize rules/skills; refresh platform OS bindings map rule.
-- Fixes Agent Sam citing retired AGENTSAMVECTORIZE on "Vectorize binding" questions.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/535_retire_dual_vectorize_stale_rules.sql

UPDATE agentsam_rules_document
SET is_active = 0, updated_at_epoch = unixepoch()
WHERE id = 'rule_agentsam_dual_vectorize_lanes';

UPDATE agentsam_skill
SET is_active = 0, updated_at = datetime('now')
WHERE id = 'skill_agentsam_dual_vectorize_lanes';

UPDATE agentsam_rules_document
SET
  sort_order = 1,
  updated_at_epoch = unixepoch(),
  body_markdown = '## IAM OS — bindings, Vectorize, and APIs (always on)

Full doc: `docs/platform/bindings-vectorize-api-map-2026-06.md`

**When answering Vectorize / binding / RAG questions:** prefer retrieved lane context blocks (`## Docs knowledge context`, `## Deep archive context`) in this prompt over parametric memory. Never cite retired bindings below.

### RETIRED (do not mention as current — removed 2026-06-02)
- `AGENTSAMVECTORIZE` → `inneranimalmedia-vectors` (orphan)
- Legacy `VECTORIZE` → `ai-search-inneranimalmedia-autorag` @1024 (AutoRAG `/api/search` only)
- `AI_SEARCH_ENDPOINT` for Agent chat semantic lanes

### Five Vectorize bindings @ 1536 (OpenAI text-embedding-3-large)
| Binding | Index | Supabase table | Semantic lane | Tool |
|---------|-------|----------------|---------------|------|
| AGENTSAM_VECTORIZE_CODE | agentsam-codebase-oai3large-1536 | agentsam_codebase_chunks_oai3large_1536 | code_semantic_search | code_semantic_search |
| AGENTSAM_VECTORIZE_SCHEMA | agentsam-schema-oai3large-1536 | agentsam_database_schema_oai3large_1536 | schema_semantic_search | schema_semantic_search |
| AGENTSAM_VECTORIZE_MEMORY | agentsam-memory-oai3large-1536 | agentsam_memory_oai3large_1536 | memory_semantic_search | memory_semantic_search |
| AGENTSAM_VECTORIZE_DOCUMENTS | agentsam-documents-oai3large-1536 | agentsam_documents_oai3large_1536 | docs_knowledge_search | docs_knowledge_search |
| AGENTSAM_VECTORIZE_COURSES | agentsam-courses-oai3large-1536 | *(course catalog only)* | — | — |

### Deep archive @ 3072 (Hyperdrive only — no Vectorize binding)
- Table: `agentsam_deep_archive_oai3large_3072`
- Lane/tool: `deep_archive_search`
- RPC: `agentsam_match_deep_archive_oai3large_3072_ann`
- Auto-inject: platform questions also fetch deep archive in parallel with primary lane

### Query path
`dispatchSemanticRetrieval` in `src/core/semantic-retrieval-dispatch.js`:
Vectorize first (1536 lanes) → Hyperdrive pgvector fallback → hydrate from Postgres.
Deep archive: Hyperdrive RPC only @ 3072d.

### Two repos / two surfaces
- Main worker `inneranimalmedia.com` — in-app Agent Sam (`dispatchByToolCode`, not MCP worker)
- MCP worker `mcp.inneranimalmedia.com` — external OAuth only

### Re-sync Vectorize from Supabase
`./scripts/with-cloudflare-env.sh node scripts/rag_ingest.mjs --lane all --update-registry`'
WHERE id = 'rule_iam_bindings_vectorize_api_map';

UPDATE vectorize_index_registry SET
  is_active = 0,
  description = 'RETIRED — use AGENTSAM_VECTORIZE_* five-lane bindings (2026-06-02).',
  updated_at = datetime('now')
WHERE binding_name IN ('AGENTSAMVECTORIZE', 'VECTORIZE')
  AND is_active = 1;
