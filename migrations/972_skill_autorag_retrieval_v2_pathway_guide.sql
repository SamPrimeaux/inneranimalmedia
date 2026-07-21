-- 972: Rewrite skill_autorag_retrieval_v2 as thin RAG pathway guide; keep v1 as R2-manifest helper.
-- Upload SKILL.md to R2; apply this file to D1.

UPDATE agentsam_skill
SET
  description = 'R2/D1 autorag manifest file lookup (object_key, type, tags, file_url). Not the semantic lane picker — use skill_autorag_retrieval_v2 (/rag) for pathway choice.',
  updated_at = datetime('now')
WHERE id = 'skill_autorag_retrieval';

INSERT OR REPLACE INTO agentsam_skill (
  id, tenant_id, user_id, person_uuid, workspace_id, name, description,
  content_markdown, file_path, scope, slash_trigger, globs, always_apply,
  task_types_json, route_keys_json, default_model_key, model_constraints_json,
  access_mode, icon, tags_json, metadata_json, token_estimate, version,
  retrieval_strategy, is_active, sort_order, created_at, updated_at
) VALUES (
  'skill_autorag_retrieval_v2',
  'tenant_sam_primeaux',
  'au_871d920d1233cbd1',
  '',
  'ws_inneranimalmedia',
  'RAG pathway guide',
  'Thin decision guide: Layer 0 vs Vectorize/pgvector lanes vs AST-RAG vs R2 AutoRAG vs legacy AI Search. Points to vectorize-lanes and ast-rag-index for depth. Use for /rag.',
  '',
  'skills/autorag_retrieval_v2/SKILL.md',
  'workspace',
  'rag',
  '["src/core/semantic-retrieval-dispatch.js","src/core/rag-lanes.js","src/core/codebase-ast-retrieve.js","skills/agentsam-vectorize-lanes/SKILL.md","skills/ast-rag-codebase-index/SKILL.md"]',
  0,
  '["rag","retrieval","vectorize","ast","memory","schema"]',
  '["agent_general","plan","research","debug"]',
  NULL,
  '{}',
  'read_only',
  'search',
  '["rag","pathway","autorag","vectorize","ast-rag","ws_inneranimalmedia"]',
  '{"r2_bucket":"inneranimalmedia-autorag","r2_skill_key":"skills/autorag_retrieval_v2/SKILL.md","skill_key":"rag-pathway-guide","related":["skill_agentsam_vectorize_lanes","skill_ast_rag_codebase_index","skill_autorag_retrieval"],"workspace_id":"ws_inneranimalmedia","tenant_id":"tenant_sam_primeaux"}',
  700,
  2,
  'r2',
  1,
  2,
  datetime('now'),
  datetime('now')
);

INSERT INTO agentsam_skill_revision (skill_id, content_markdown, version, change_note)
SELECT
  'skill_autorag_retrieval_v2',
  '',
  2,
  '2026-07-21: rewrite as pathway picker; R2 body; drop stale /api/rag/search + agent_memory_index guidance'
WHERE NOT EXISTS (
  SELECT 1 FROM agentsam_skill_revision WHERE skill_id = 'skill_autorag_retrieval_v2' AND version = 2
);
