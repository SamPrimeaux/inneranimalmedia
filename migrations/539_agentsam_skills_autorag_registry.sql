-- 539: Register IAM repo skills on R2 (mcp-oauth, docx, dual-vectorize lanes)
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/539_agentsam_skills_autorag_registry.sql
-- Upload:
--   ./scripts/upload-iam-skills-autorag.sh

INSERT OR REPLACE INTO agentsam_skill (
  id, tenant_id, user_id, person_uuid, workspace_id, name, description,
  content_markdown, file_path, scope, slash_trigger, globs, always_apply,
  task_types_json, route_keys_json, default_model_key, model_constraints_json,
  access_mode, icon, tags_json, metadata_json, token_estimate, version,
  retrieval_strategy, is_active, sort_order, created_at, updated_at
) VALUES (
  'skill_mcp_oauth_field_guide',
  'tenant_sam_primeaux',
  'au_871d920d1233cbd1',
  '',
  'ws_inneranimalmedia',
  'MCP OAuth field guide',
  'IAM MCP OAuth 2.1, workspace isolation, token mint, tools/list scoping, and connector onboarding security.',
  '',
  'skills/mcp-oauth-field-guide/SKILL.md',
  'workspace',
  'mcp-oauth',
  '[".agents/skills/mcp-oauth-field-guide/**","docs/platform/**","inneranimalmedia-mcp-server/**"]',
  0,
  '["mcp","oauth","security"]',
  '["agent_general","debug"]',
  NULL,
  '{}',
  'read_write',
  'shield',
  '["mcp","oauth","security","identity"]',
  '{"r2_bucket":"inneranimalmedia-autorag","r2_skill_key":"skills/mcp-oauth-field-guide/SKILL.md"}',
  1400,
  1,
  'r2',
  1,
  10,
  datetime('now'),
  datetime('now')
);

INSERT OR REPLACE INTO agentsam_skill (
  id, tenant_id, user_id, person_uuid, workspace_id, name, description,
  content_markdown, file_path, scope, slash_trigger, globs, always_apply,
  task_types_json, route_keys_json, default_model_key, model_constraints_json,
  access_mode, icon, tags_json, metadata_json, token_estimate, version,
  retrieval_strategy, is_active, sort_order, created_at, updated_at
) VALUES (
  'skill_docx',
  'tenant_sam_primeaux',
  'au_871d920d1233cbd1',
  '',
  'ws_inneranimalmedia',
  'Word document (docx)',
  'Create and edit professional .docx files with formatting, TOC, and tracked changes.',
  '',
  'skills/docx/SKILL.md',
  'workspace',
  'docx',
  '["**/*.docx",".agents/skills/docx/**"]',
  0,
  '["document","report"]',
  '["agent_general"]',
  NULL,
  '{}',
  'read_write',
  'file-text',
  '["docx","word","document"]',
  '{"r2_bucket":"inneranimalmedia-autorag","r2_skill_key":"skills/docx/SKILL.md"}',
  800,
  1,
  'r2',
  1,
  11,
  datetime('now'),
  datetime('now')
);

INSERT OR REPLACE INTO agentsam_skill (
  id, tenant_id, user_id, person_uuid, workspace_id, name, description,
  content_markdown, file_path, scope, slash_trigger, globs, always_apply,
  task_types_json, route_keys_json, default_model_key, model_constraints_json,
  access_mode, icon, tags_json, metadata_json, token_estimate, version,
  retrieval_strategy, is_active, sort_order, created_at, updated_at
) VALUES (
  'skill_agentsam_dual_vectorize_lanes',
  'tenant_sam_primeaux',
  'au_871d920d1233cbd1',
  '',
  'ws_inneranimalmedia',
  'Dual Vectorize lanes',
  'Five-lane AGENTSAM_VECTORIZE_* @ 1536-d vs deep archive pgvector @ 3072-d; embedding and ingest law.',
  '',
  'skills/agentsam-dual-vectorize-lanes/SKILL.md',
  'workspace',
  'vectorize-lanes',
  '["scripts/rag_ingest.mjs","docs/platform/bindings-vectorize-api-map-2026-06.md","wrangler.production.toml"]',
  0,
  '["rag","vectorize","ingest"]',
  '["agent_general","plan"]',
  NULL,
  '{}',
  'read_only',
  'layers',
  '["vectorize","rag","embeddings"]',
  '{"r2_bucket":"inneranimalmedia-autorag","r2_skill_key":"skills/agentsam-dual-vectorize-lanes/SKILL.md"}',
  400,
  1,
  'r2',
  1,
  13,
  datetime('now'),
  datetime('now')
);

-- plan-and-execute: ensure always_apply on plan route (538 may exist without always_apply)
UPDATE agentsam_skill
SET
  task_types_json = '["plan","plan_pipeline","workflow"]',
  route_keys_json = '["plan","agent_general"]',
  always_apply = 0,
  updated_at = datetime('now')
WHERE id = 'skill_plan_and_execute';
