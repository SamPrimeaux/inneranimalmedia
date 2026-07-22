-- 653: on_brand_genmedia skill + GenMedia sub-agent profiles (Sprint 2B seed).
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/653_on_brand_genmedia_skill.sql

INSERT OR REPLACE INTO agentsam_skill (
  id, tenant_id, user_id, person_uuid, workspace_id, name, description,
  content_markdown, file_path, scope, slash_trigger, globs, always_apply,
  task_types_json, route_keys_json, default_model_key, model_constraints_json,
  access_mode, icon, tags_json, metadata_json, token_estimate, version,
  retrieval_strategy, is_active, sort_order, created_at, updated_at
) VALUES (
  'skill_on_brand_genmedia',
  'tenant_sam_primeaux', 'au_871d920d1233cbd1', '', 'ws_inneranimalmedia',
  'On-Brand GenMedia Agent',
  'Brand-aware image generation loop: enrich prompt → generate → score against policy → iterate until threshold.',
  '', 'skills/on-brand-genmedia/SKILL.md',
  'workspace', 'genmedia',
  '["docs/inneranimalmedia/brand/**","skills/on-brand-genmedia/**"]',
  0, '["agent","plan"]', '["agent_general","plan","image_generation"]',
  NULL, '{}', 'read_write', 'image',
  '["genmedia","brand","image","spawn","policy"]',
  '{"max_iterations":3,"master_agent_slug":"on_brand_genmedia","pipeline":["genmedia_prompt_enrichment","genmedia_image_gen","genmedia_scoring","genmedia_checker"]}',
  1200, 1, 'db', 1, 25, datetime('now'), datetime('now')
);

INSERT INTO agentsam_subagent_profile (
  id, user_id, workspace_id, tenant_id, slug, display_name, description,
  instructions_markdown, allowed_tool_globs, is_active, is_platform_global,
  sort_order, agent_type, run_in_background, model_reasoning_effort,
  can_spawn_subagents, spawnable_agent_slugs, max_spawn_depth, is_parallelizable,
  output_schema_json, spawn_trigger_keywords, access_mode, created_at, updated_at
) VALUES
('asp_genmedia_prompt_enrichment','platform','','','genmedia_prompt_enrichment','Brand Prompt Enricher','Enriches raw user prompts with workspace brand context from Vectorize.','Receives raw user prompt. Queries AGENTSAM_VECTORIZE_DOCUMENTS and AGENTSAM_VECTORIZE_MEMORY for brand context. Returns enriched generation prompt string.','["agentsam_autorag","agentsam_d1_query"]',1,1,20,'custom',0,'medium',0,'[]',1,0,NULL,'["/genmedia","genmedia","brand image"]','read_write',datetime('now'),datetime('now'))
ON CONFLICT(user_id, workspace_id, slug) DO UPDATE SET display_name=excluded.display_name,description=excluded.description,is_active=1,updated_at=datetime('now');

INSERT INTO agentsam_subagent_profile (
  id, user_id, workspace_id, tenant_id, slug, display_name, description,
  instructions_markdown, allowed_tool_globs, is_active, is_platform_global,
  sort_order, agent_type, run_in_background, model_reasoning_effort,
  can_spawn_subagents, spawnable_agent_slugs, max_spawn_depth, is_parallelizable,
  output_schema_json, spawn_trigger_keywords, access_mode, created_at, updated_at
) VALUES
('asp_genmedia_image_gen','platform','','','genmedia_image_gen','Image Generator','Generates brand images from enriched prompts; uploads to R2 and records jobs.','Receives enriched prompt. Calls image generation provider from agentsam_ai catalog. Uploads to R2. Inserts image_generation_jobs row.','["agentsam_cf_images_upload","agentsam_d1_write"]',1,1,21,'custom',1,'low',0,'[]',1,0,NULL,'["/genmedia","genmedia"]','read_write',datetime('now'),datetime('now'))
ON CONFLICT(user_id, workspace_id, slug) DO UPDATE SET display_name=excluded.display_name,description=excluded.description,is_active=1,updated_at=datetime('now');

INSERT INTO agentsam_subagent_profile (
  id, user_id, workspace_id, tenant_id, slug, display_name, description,
  instructions_markdown, allowed_tool_globs, is_active, is_platform_global,
  sort_order, agent_type, run_in_background, model_reasoning_effort,
  can_spawn_subagents, spawnable_agent_slugs, max_spawn_depth, is_parallelizable,
  output_schema_json, spawn_trigger_keywords, access_mode, created_at, updated_at
) VALUES
('asp_genmedia_scoring','platform','','','genmedia_scoring','Brand Compliance Scorer','Scores generated images against policy rubric chunks.','Fetches image via agentsam_r2_get. Queries AGENTSAM_VECTORIZE_DOCUMENTS source_type=policy. LLM scores: score, feedback, passed, r2_key. Writes image_generation_variants row.','["agentsam_autorag","agentsam_r2_get","agentsam_d1_write"]',1,1,22,'custom',0,'medium',0,'[]',1,0,'{"score":"number","feedback":"string","passed":"boolean","r2_key":"string"}','["/genmedia","genmedia"]','read_write',datetime('now'),datetime('now'))
ON CONFLICT(user_id, workspace_id, slug) DO UPDATE SET display_name=excluded.display_name,description=excluded.description,is_active=1,updated_at=datetime('now');

INSERT INTO agentsam_subagent_profile (
  id, user_id, workspace_id, tenant_id, slug, display_name, description,
  instructions_markdown, allowed_tool_globs, is_active, is_platform_global,
  sort_order, agent_type, run_in_background, model_reasoning_effort,
  can_spawn_subagents, spawnable_agent_slugs, max_spawn_depth, is_parallelizable,
  output_schema_json, spawn_trigger_keywords, access_mode, created_at, updated_at
) VALUES
('asp_genmedia_checker','platform','','','genmedia_checker','Iteration Checker','Loop controller — completes job or respawns image_gen + scoring.','Reads score from agentsam_spawn_job.merged_output. Compares against brand_score_threshold (default 75). If passed or max_iterations reached: set status=completed. Else spawn genmedia_image_gen then genmedia_scoring.','["agentsam_d1_query","agentsam_d1_write"]',1,1,23,'custom',0,'medium',1,'["genmedia_image_gen","genmedia_scoring"]',1,0,NULL,'["/genmedia","genmedia"]','read_write',datetime('now'),datetime('now'))
ON CONFLICT(user_id, workspace_id, slug) DO UPDATE SET display_name=excluded.display_name,description=excluded.description,is_active=1,updated_at=datetime('now');

INSERT INTO agentsam_memory (
  id, tenant_id, user_id, workspace_id, memory_type, key, value, title, summary,
  source, tags, confidence, importance, is_pinned, sync_key, updated_at
) VALUES
(
  'mem_brand_score_threshold_ws_iam',
  'tenant_sam_primeaux', 'au_871d920d1233cbd1', 'ws_inneranimalmedia',
  'preference', 'brand_score_threshold', '75',
  'GenMedia pass threshold', 'Minimum brand compliance score (0-100) for on_brand_genmedia loop.',
  'migration_653_on_brand_genmedia', '["genmedia","brand","config"]',
  1.0, 8, 1, 'tenant_sam_primeaux:au_871d920d1233cbd1:brand_score_threshold', unixepoch()
)
ON CONFLICT(id) DO UPDATE SET value=excluded.value, updated_at=unixepoch();

INSERT INTO agentsam_memory (
  id, tenant_id, user_id, workspace_id, memory_type, key, value, title, summary,
  source, tags, confidence, importance, is_pinned, sync_key, updated_at
) VALUES
(
  'mem_brand_r2_prefix_ws_iam',
  'tenant_sam_primeaux', 'au_871d920d1233cbd1', 'ws_inneranimalmedia',
  'preference', 'brand_r2_prefix', 'brand/genmedia/',
  'GenMedia R2 output prefix', 'Default R2 key prefix for accepted GenMedia images.',
  'migration_653_on_brand_genmedia', '["genmedia","brand","r2"]',
  1.0, 7, 0, 'tenant_sam_primeaux:au_871d920d1233cbd1:brand_r2_prefix', unixepoch()
)
ON CONFLICT(id) DO UPDATE SET value=excluded.value, updated_at=unixepoch();

INSERT INTO agentsam_memory (
  id, tenant_id, user_id, workspace_id, memory_type, key, value, title, summary,
  source, tags, confidence, importance, is_pinned, sync_key, updated_at
) VALUES (
  'mem_on_brand_genmedia_router_v1',
  'tenant_sam_primeaux', 'au_871d920d1233cbd1', 'ws_inneranimalmedia',
  'skill', 'on_brand_genmedia_router_v1',
  'START HERE for /genmedia on-brand image loop. Skill: skill_on_brand_genmedia. Sub-agents: genmedia_prompt_enrichment → genmedia_image_gen → genmedia_scoring → genmedia_checker. Threshold: brand_score_threshold (default 75). Max iterations: 3.',
  'On-Brand GenMedia router',
  'Router for brand-aware image generation spawn pipeline.',
  'migration_653_on_brand_genmedia',
  '["genmedia","brand","spawn","skill","router"]',
  1.0, 8, 1,
  'tenant_sam_primeaux:au_871d920d1233cbd1:on_brand_genmedia_router_v1',
  unixepoch()
)
ON CONFLICT(id) DO UPDATE SET
  value=excluded.value, title=excluded.title, summary=excluded.summary,
  importance=excluded.importance, is_pinned=excluded.is_pinned, updated_at=unixepoch();
