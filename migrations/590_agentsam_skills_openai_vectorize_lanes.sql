-- 590: Register skills/openai + skills/agentsam-vectorize-lanes on R2/D1.
-- Upload:
--   ./scripts/upload-iam-skills-autorag.sh
--   ./scripts/with-cloudflare-env.sh npx wrangler r2 object put inneranimalmedia-autorag/skills/openai/openai-agent-building-current-docs.md \
--     --file=skills/openai/openai-agent-building-current-docs.md --content-type="text/markdown; charset=utf-8" --remote -c wrangler.production.toml
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/590_agentsam_skills_openai_vectorize_lanes.sql

-- Retire superseded dual-lane skill row (content lives in agentsam-vectorize-lanes)
UPDATE agentsam_skill
SET
  is_active = 0,
  description = 'RETIRED — use skill_agentsam_vectorize_lanes (agentsam-vectorize-lanes).',
  updated_at = datetime('now')
WHERE id = 'skill_agentsam_dual_vectorize_lanes';

INSERT OR REPLACE INTO agentsam_skill (
  id, tenant_id, user_id, person_uuid, workspace_id, name, description,
  content_markdown, file_path, scope, slash_trigger, globs, always_apply,
  task_types_json, route_keys_json, default_model_key, model_constraints_json,
  access_mode, icon, tags_json, metadata_json, token_estimate, version,
  retrieval_strategy, is_active, sort_order, created_at, updated_at
) VALUES (
  'skill_agentsam_vectorize_lanes',
  'tenant_sam_primeaux',
  'au_871d920d1233cbd1',
  '',
  'ws_inneranimalmedia',
  'Agent Sam Vectorize lanes',
  'Six AGENTSAM_VECTORIZE_* lanes, Supabase pgvector dual-write, Layer 0 D1 context, ingest scripts, and maintenance law.',
  '',
  'skills/agentsam-vectorize-lanes/SKILL.md',
  'workspace',
  'vectorize-lanes',
  '["scripts/reindex_codebase_dashboard_agent.mjs","scripts/ingest_r2_to_rag.mjs","scripts/rag_ingest.mjs","docs/platform/bindings-vectorize-api-map-2026-06.md","src/core/rag-lanes.js","src/core/semantic-retrieval-dispatch.js"]',
  0,
  '["rag","vectorize","ingest","embed"]',
  '["agent_general","plan","research"]',
  NULL,
  '{}',
  'read_only',
  'layers',
  '["vectorize","rag","embeddings","supabase","cloudflare"]',
  '{"r2_bucket":"inneranimalmedia-autorag","r2_skill_key":"skills/agentsam-vectorize-lanes/SKILL.md"}',
  1400,
  1,
  'r2',
  1,
  12,
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
  'skill_openai_agent_building',
  'tenant_sam_primeaux',
  'au_871d920d1233cbd1',
  '',
  'ws_inneranimalmedia',
  'OpenAI agent building (provider research)',
  'Source-grounded OpenAI research — Responses API, Agents SDK, MCP, Secure MCP Tunnel, structured outputs, pricing. Not an IAM implementation plan.',
  '',
  'skills/openai/SKILL.md',
  'workspace',
  'openai-research',
  '["skills/openai/**","docs/platform/**"]',
  0,
  '["research","provider","openai"]',
  '["research","plan","agent_general"]',
  NULL,
  '{}',
  'read_only',
  'book-open',
  '["openai","responses-api","agents-sdk","mcp","research"]',
  '{"r2_bucket":"inneranimalmedia-autorag","r2_skill_key":"skills/openai/SKILL.md","r2_reference_key":"skills/openai/openai-agent-building-current-docs.md","doc_type":"provider-research","status":"research-not-implementation"}',
  350,
  1,
  'r2',
  1,
  14,
  datetime('now'),
  datetime('now')
);
