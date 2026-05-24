-- 393: Registry bundle — AGENTSAMVECTORIZE embed pipeline (dimension-locked, agent-discoverable).
-- One index (inneranimalmedia-vectors), one dimension from describe(), one model at index+query time.
-- Do NOT mix with VECTORIZE / ai-search-inneranimalmedia-autorag @ 1024.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/393_agentsam_vectorize_embed_pipeline_registry.sql

-- ─── 1) Index registry (canonical dimensions / metric) ─────────────────────────
INSERT OR IGNORE INTO vectorize_index_registry (
  id, tenant_id, binding_name, index_name, display_name, source_type,
  dimensions, metric, is_preferred, is_active, stored_vectors, queries_30d, avg_latency_ms,
  description, use_cases, created_at, updated_at
) VALUES (
  'vidx_agentsam_vectors',
  'tenant_sam_primeaux',
  'AGENTSAMVECTORIZE',
  'inneranimalmedia-vectors',
  'Agent Sam — semantic memory & code',
  'vectorize',
  1536,
  'cosine',
  1,
  1,
  0,
  0,
  0,
  'Agent Sam lane: curated memory + codebase chunks. Dimensions from binding.describe() — never assume 1536 in code. Query model must match index model.',
  '["agent_memory","codebase_chunks","codebase_search","semantic_recall"]',
  datetime('now'),
  datetime('now')
);

UPDATE vectorize_index_registry
SET
  binding_name = 'AGENTSAMVECTORIZE',
  index_name = 'inneranimalmedia-vectors',
  display_name = 'Agent Sam — semantic memory & code',
  dimensions = 1536,
  metric = 'cosine',
  is_active = 1,
  description = 'Agent Sam lane: AGENTSAMVECTORIZE.describe() is source of truth for dimensions. Scripts: scripts/embed-codebase.py, scripts/index-codebase-live.py. Worker: src/core/agentsam-vectorize-index.js, src/core/codebase-search.js. Separate from VECTORIZE @1024.',
  use_cases = '["agent_memory","codebase_chunks","codebase_search","semantic_recall"]',
  updated_at = datetime('now')
WHERE id = 'vidx_agentsam_vectors';

-- ─── 2) D1 operational memory (compact playbook for any agent session) ───────
INSERT INTO agentsam_memory (
  id, tenant_id, user_id, workspace_id, memory_type, key, value, session_id, source, confidence
) VALUES (
  'mem_schema_agentsam_vectorize_embed_pipeline',
  'tenant_sam_primeaux',
  'au_871d920d1233cbd1',
  'ws_inneranimalmedia',
  'project',
  'schema_agentsam_vectorize_embed_pipeline',
  '{"binding":"AGENTSAMVECTORIZE","index_name":"inneranimalmedia-vectors","rule":"One index, one dimension, one model. Never mix VECTORIZE/autorag @1024 with this lane.","describe":["env.AGENTSAMVECTORIZE.describe()","GET /api/internal/agentsam-vectorize/describe","python3 scripts/embed-codebase.py --describe-only"],"dimension_model":{"1536":{"provider":"openai","model":"text-embedding-3-large"},"768":{"provider":"workers_ai","model":"@cf/baai/bge-large-en-v1.5"},"1024":{"provider":"workers_ai","model":"@cf/baai/bge-large-en-v1.5"}},"scripts":{"smoke":"scripts/index-codebase-live.py","priority":"scripts/embed-codebase.py --priority-snapshot","full":"scripts/embed-codebase.py --all"},"worker":["src/core/agentsam-vectorize-index.js","src/core/codebase-search.js"],"vector_id_prefix":{"codebase":"codebase:","agent_memory":"agent_memory:"}}',
  'session_registry',
  'migration_393',
  1.0
)
ON CONFLICT(tenant_id, user_id, key) DO UPDATE SET
  value = excluded.value,
  memory_type = excluded.memory_type,
  source = excluded.source,
  updated_at = unixepoch();

-- ─── 3) Rules document (keyword → inject playbook when user talks embed/chunk) ─
INSERT OR IGNORE INTO agentsam_rules_document (
  id, user_id, workspace_id, title, body_markdown, version, is_active,
  created_at_epoch, updated_at_epoch, person_uuid, apply_mode, globs, os_platform,
  trigger_type, trigger_condition_json, sort_order, input_prompt_json,
  execution_template, rule_type, notes, source_stored, source_url
) VALUES (
  'rule_agentsam_vectorize_embed_pipeline',
  '',
  'ws_inneranimalmedia',
  'AGENTSAMVECTORIZE embed pipeline (dimension-locked)',
  '## AGENTSAMVECTORIZE embed pipeline

**Law:** One index (`inneranimalmedia-vectors`), one dimension (from `describe()`), one embedding model at **index and query** time. Never mix with legacy `VECTORIZE` / AutoRAG @ **1024**.

### Before any embed job
1. Resolve dimensions: Worker `env.AGENTSAMVECTORIZE.describe()` OR `python3 scripts/embed-codebase.py --describe-only` OR `GET /api/internal/agentsam-vectorize/describe`.
2. Map dimension → model: **1536** → `text-embedding-3-large` (OpenAI); **768/1024** → `@cf/baai/bge-large-en-v1.5` (Workers AI).
3. Hard-exit if probe embedding length ≠ index dimensions.

### Scripts (repo root `/Users/samprimeaux/inneranimalmedia`)
- `scripts/index-codebase-live.py` — smoke + priority snapshot
- `scripts/embed-codebase.py --priority-snapshot` | `--all` | `--file PATH`

### Worker modules
- `src/core/agentsam-vectorize-index.js` — describe + model resolver
- `src/core/codebase-search.js` — query uses same model as indexing

### D1 memory key
`agentsam_memory.key = schema_agentsam_vectorize_embed_pipeline`

### Vector IDs
- Codebase chunks: `codebase:{path}::{chunk_index}`
- Agent memory: `agent_memory:{uuid}`',
  1,
  1,
  unixepoch(),
  unixepoch(),
  '',
  'always',
  '',
  'any',
  'keyword',
  '{"keywords":["embed","embedding","vectorize","chunk","index codebase","AGENTSAMVECTORIZE","inneranimalmedia-vectors","codebase search","semantic code","upsert vector","re-embed"],"match":"any","min_matches":1}',
  8,
  '{}',
  '',
  'instruction',
  'Playbook for agents running chunk/embed/insert against AGENTSAMVECTORIZE. D1 memory: schema_agentsam_vectorize_embed_pipeline.',
  'd1:agentsam_rules_document:rule_agentsam_vectorize_embed_pipeline',
  ''
);

UPDATE agentsam_rules_document
SET
  trigger_type = 'keyword',
  trigger_condition_json = '{"keywords":["embed","embedding","vectorize","chunk","index codebase","AGENTSAMVECTORIZE","inneranimalmedia-vectors","codebase search","semantic code","upsert vector","re-embed"],"match":"any","min_matches":1}',
  apply_mode = 'always',
  is_active = 1,
  updated_at_epoch = unixepoch()
WHERE id = 'rule_agentsam_vectorize_embed_pipeline';

-- ─── 4) Tool catalog — describe helper + enrich existing vectorize tools ─────
INSERT OR IGNORE INTO agentsam_tools (
  id, tool_name, display_name, tool_category, handler_type,
  description, is_active, tool_key, risk_level, requires_approval, handler_config
) VALUES (
  'ast_agentsam_vectorize_describe',
  'agentsam_vectorize_describe',
  'Describe AGENTSAMVECTORIZE index',
  'ai',
  'http',
  'Returns inneranimalmedia-vectors dimensions, metric, and resolved embedding model. Call before any embed/upsert. Source of truth for the 1536 pipeline.',
  1,
  'agentsam_vectorize_describe',
  'low',
  0,
  '{"auth_source":"platform","binding":"AGENTSAMVECTORIZE","method":"GET","path":"/api/internal/agentsam-vectorize/describe","playbook_memory_key":"schema_agentsam_vectorize_embed_pipeline"}'
);

UPDATE agentsam_tools
SET
  description = 'Query AGENTSAMVECTORIZE (inneranimalmedia-vectors). Embed query with the SAME model as indexing — see agentsam_vectorize_describe / schema_agentsam_vectorize_embed_pipeline.',
  handler_config = json_patch(
    COALESCE(NULLIF(trim(handler_config), ''), '{}'),
    '{"binding":"AGENTSAMVECTORIZE","playbook_memory_key":"schema_agentsam_vectorize_embed_pipeline","index_name":"inneranimalmedia-vectors"}'
  ),
  updated_at = unixepoch()
WHERE tool_name = 'vectorize_query' AND COALESCE(is_active, 1) = 1;

UPDATE agentsam_tools
SET
  description = 'Upsert into AGENTSAMVECTORIZE. Run agentsam_vectorize_describe first; embedding dims must match index. Codebase IDs: codebase:{path}::{chunk_index}.',
  handler_config = json_patch(
    COALESCE(NULLIF(trim(handler_config), ''), '{}'),
    '{"binding":"AGENTSAMVECTORIZE","playbook_memory_key":"schema_agentsam_vectorize_embed_pipeline","index_name":"inneranimalmedia-vectors"}'
  ),
  updated_at = unixepoch()
WHERE tool_name = 'vectorize_upsert' AND COALESCE(is_active, 1) = 1;

UPDATE agentsam_tools
SET
  description = 'Workspace semantic search over AGENTSAMVECTORIZE + pgvector. Query embedding model must match index (describe first).',
  handler_config = json_patch(
    COALESCE(NULLIF(trim(handler_config), ''), '{}'),
    '{"binding":"AGENTSAMVECTORIZE","playbook_memory_key":"schema_agentsam_vectorize_embed_pipeline"}'
  ),
  updated_at = unixepoch()
WHERE tool_name = 'workspace_search_semantic' AND COALESCE(is_active, 1) = 1;

-- ─── 5) Capability aliases (route/tool discovery) ─────────────────────────────
INSERT INTO agentsam_capability_aliases (
  abstract_capability, match_kind, match_value, capability_lane,
  priority, requires_approval, is_mutation, rationale
) VALUES
  ('embed.agentsam.describe', 'tool_key', 'agentsam_vectorize_describe', 'research', 5, 0, 0, 'Resolve AGENTSAMVECTORIZE dimensions before embed.'),
  ('embed.codebase.priority', 'memory_key', 'schema_agentsam_vectorize_embed_pipeline', 'research', 10, 0, 0, 'Playbook: priority codebase snapshot embed scripts.'),
  ('embed.agentsam.upsert', 'tool_key', 'vectorize_upsert', 'research', 10, 0, 1, 'Upsert vectors to inneranimalmedia-vectors (dimension-locked).'),
  ('embed.agentsam.query', 'tool_key', 'vectorize_query', 'research', 10, 0, 0, 'ANN query on AGENTSAMVECTORIZE (same model as index).')
ON CONFLICT (abstract_capability, match_kind, match_value) DO UPDATE SET
  capability_lane = excluded.capability_lane,
  priority = excluded.priority,
  requires_approval = excluded.requires_approval,
  is_mutation = excluded.is_mutation,
  rationale = excluded.rationale,
  is_active = 1,
  updated_at = datetime('now');
