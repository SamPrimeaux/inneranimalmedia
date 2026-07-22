-- 395: Situation-aware skill — choose VECTORIZE 1024 vs AGENTSAMVECTORIZE 1536 (never mix).
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/395_skill_agentsam_dual_vectorize_lanes.sql

INSERT OR IGNORE INTO vectorize_index_registry (
  id, tenant_id, binding_name, index_name, display_name, source_type,
  dimensions, metric, is_preferred, is_active, stored_vectors, queries_30d, avg_latency_ms,
  description, use_cases, created_at, updated_at
) VALUES
('vidx_autorag_1024','tenant_sam_primeaux','VECTORIZE','ai-search-inneranimalmedia-autorag','AutoRAG / documents (1024)','vectorize',1024,'cosine',0,1,0,0,0,'Legacy RAG lane: public.documents, knowledge ingest, unifiedRagSearch.','["documents","knowledge","autorag","unified_rag"]',datetime('now'),datetime('now')),
('vidx_agentsam_vectors','tenant_sam_primeaux','AGENTSAMVECTORIZE','inneranimalmedia-vectors','Agent Sam memory + code (1536)','vectorize',1536,'cosine',1,1,0,0,0,'Agent Sam lane: agent_memory, codebase_chunks, curated recall.','["agent_memory","codebase_chunks","codebase_search","semantic_recall"]',datetime('now'),datetime('now'));

UPDATE vectorize_index_registry SET binding_name='VECTORIZE', index_name='ai-search-inneranimalmedia-autorag', dimensions=1024, is_active=1, updated_at=datetime('now') WHERE id='vidx_autorag_1024';
UPDATE vectorize_index_registry SET binding_name='AGENTSAMVECTORIZE', index_name='inneranimalmedia-vectors', dimensions=1536, is_active=1, is_preferred=1, updated_at=datetime('now') WHERE id='vidx_agentsam_vectors';

INSERT INTO agentsam_memory (
  id, tenant_id, user_id, workspace_id, memory_type, key, value, session_id, source, confidence
) VALUES (
  'mem_schema_agentsam_dual_vectorize_lanes',
  'tenant_sam_primeaux',
  'au_871d920d1233cbd1',
  'ws_inneranimalmedia',
  'project',
  'schema_agentsam_dual_vectorize_lanes',
  '{"skill_id":"skill_agentsam_dual_vectorize_lanes","law":"One index, one dimension, one model — never mix lanes.","lanes":{"1024":{"binding":"VECTORIZE","index":"ai-search-inneranimalmedia-autorag"},"1536":{"binding":"AGENTSAMVECTORIZE","index":"inneranimalmedia-vectors"}}}',
  'session_registry',
  'migration_395',
  1.0
)
ON CONFLICT(id) DO UPDATE SET
  value = excluded.value,
  updated_at = unixepoch();

INSERT OR IGNORE INTO agentsam_skill (
  id, tenant_id, user_id, person_uuid, workspace_id, name, description,
  content_markdown, file_path, scope, slash_trigger, globs, always_apply,
  task_types_json, route_keys_json, default_model_key, model_constraints_json,
  access_mode, icon, tags_json, metadata_json, token_estimate, version,
  is_active, sort_order, created_at, updated_at
) VALUES (
  'skill_agentsam_dual_vectorize_lanes',
  'tenant_sam_primeaux', 'au_871d920d1233cbd1', '', 'ws_inneranimalmedia',
  'Dual Vectorize lane router (1024 vs 1536)',
  'When to use VECTORIZE (documents/RAG) vs AGENTSAMVECTORIZE (memory/code). Always verify dimensions via describe() first.',
  '', 'skills/agentsam-dual-vectorize-lanes/SKILL.md',
  'workspace', 'vector-lane', '[]', 0,
  '["research","rag","embed","memory","codebase"]',
  '["agent_research","agent_general","agent_database","general","chat"]',
  NULL, '{}', 'read', 'layers',
  '["vectorize","rag","embed","memory","codebase","1024","1536"]',
  '{"memory_key":"schema_agentsam_dual_vectorize_lanes"}',
  2200, 1, 1, 3, datetime('now'), datetime('now')
);
