-- 393: Registry bundle — AGENTSAMVECTORIZE embed pipeline (dimension-locked, agent-discoverable).
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/393_agentsam_vectorize_embed_pipeline_registry.sql

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
  'Agent Sam lane: curated memory + codebase chunks. Dimensions from binding.describe() — never assume 1536 in code.',
  '["agent_memory","codebase_chunks","codebase_search","semantic_recall"]',
  datetime('now'),
  datetime('now')
);

UPDATE vectorize_index_registry
SET
  binding_name = 'AGENTSAMVECTORIZE',
  index_name = 'inneranimalmedia-vectors',
  dimensions = 1536,
  metric = 'cosine',
  is_active = 1,
  updated_at = datetime('now')
WHERE id = 'vidx_agentsam_vectors';

INSERT INTO agentsam_memory (
  id, tenant_id, user_id, workspace_id, memory_type, key, value, session_id, source, confidence
) VALUES (
  'mem_schema_agentsam_vectorize_embed_pipeline',
  'tenant_sam_primeaux',
  'au_871d920d1233cbd1',
  'ws_inneranimalmedia',
  'project',
  'schema_agentsam_vectorize_embed_pipeline',
  '{"binding":"AGENTSAMVECTORIZE","index_name":"inneranimalmedia-vectors","rule":"One index, one dimension, one model. Never mix VECTORIZE/autorag @1024 with this lane."}',
  'session_registry',
  'migration_393',
  1.0
)
ON CONFLICT(id) DO UPDATE SET
  value = excluded.value,
  memory_type = excluded.memory_type,
  source = excluded.source,
  updated_at = unixepoch();

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
  'One index (inneranimalmedia-vectors), one dimension (from describe()), one model at index and query time.',
  1, 1, unixepoch(), unixepoch(), '', 'always', '', 'any', 'keyword',
  '{"keywords":["embed","embedding","vectorize","chunk","index codebase","AGENTSAMVECTORIZE"],"match":"any","min_matches":1}',
  8, '{}', '', 'instruction',
  'Playbook for AGENTSAMVECTORIZE embed pipeline.',
  'd1:agentsam_rules_document:rule_agentsam_vectorize_embed_pipeline', ''
);

INSERT OR IGNORE INTO agentsam_tools (
  id, tool_name, display_name, tool_category, handler_type,
  description, is_active, tool_key, risk_level, requires_approval, handler_config
) VALUES (
  'ast_agentsam_vectorize_describe',
  'agentsam_vectorize_describe',
  'Describe AGENTSAMVECTORIZE index',
  'ai', 'http',
  'Returns inneranimalmedia-vectors dimensions, metric, and resolved embedding model.',
  1, 'agentsam_vectorize_describe', 'low', 0,
  '{"auth_source":"platform","binding":"AGENTSAMVECTORIZE","method":"GET","path":"/api/internal/agentsam-vectorize/describe"}'
);
