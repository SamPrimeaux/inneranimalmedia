-- 665: meshy_3d_designstudio skill + Meshy CAD sub-agent profiles (Design Studio sprint).
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/665_meshy_3d_designstudio_skill.sql
--
-- Playbook ingest (R2 + Vectorize):
--   npm run run:ingest_skill_playbooks

INSERT OR REPLACE INTO agentsam_skill (
  id, tenant_id, user_id, person_uuid, workspace_id, name, description,
  content_markdown, file_path, scope, slash_trigger, globs, always_apply,
  task_types_json, route_keys_json, default_model_key, model_constraints_json,
  access_mode, icon, tags_json, metadata_json, token_estimate, version,
  retrieval_strategy, is_active, sort_order, created_at, updated_at
) VALUES (
  'skill_meshy_3d_designstudio',
  'tenant_sam_primeaux',
  'au_871d920d1233cbd1',
  '',
  'ws_inneranimalmedia',
  'Meshy 3D Design Studio',
  'Production Meshy lane: text/image to 3D via Worker /api/cad/meshy, webhooks, R2 GLB, Design Studio scene deploy.',
  '# Meshy 3D Design Studio',
  'skills/meshy_3d_designstudio/SKILL.md',
  'workspace',
  'meshy',
  '["docs/skills-playbooks/meshy_3d_designstudio/**","skills/meshy-3d-designstudio/**","src/api/cad.js","src/core/meshy-cad-sync.js","tools/blender/**"]',
  0,
  '["agent","plan","cad_generation"]',
  '["agent_general","plan","design_studio","cad_generation"]',
  NULL,
  '{}',
  'read_write',
  'box',
  '["meshy","cad","3d","designstudio","glb"]',
  '{"min_credits_text_full":15,"min_credits_image_textured":30,"poll_interval_sec":8,"auto_refine":true,"auto_scene_deploy":true,"master_agent_slug":"meshy_3d_designstudio","pipeline":["meshy_balance_preflight","meshy_cad_generate","meshy_cad_wait","meshy_scene_deploy","meshy_postprocess_router"]}',
  1400,
  1,
  'r2',
  1,
  32,
  datetime('now'),
  datetime('now')
);

INSERT INTO agentsam_subagent_profile (
  id, user_id, workspace_id, tenant_id, slug, display_name, description,
  instructions_markdown, allowed_tool_globs, is_active, is_platform_global,
  sort_order, agent_type, run_in_background, model_reasoning_effort,
  can_spawn_subagents, spawnable_agent_slugs, max_spawn_depth, is_parallelizable,
  output_schema_json, spawn_trigger_keywords, access_mode, created_at, updated_at
) VALUES (
  'asp_meshy_balance_preflight',
  'platform', '', '',
  'meshy_balance_preflight',
  'Meshy Credit Preflight',
  'Checks Meshy balance before starting preview/refine or image-to-3D jobs.',
  'Call Meshy balance (Worker proxy or meshyai_get_task balance path). Compare credits_available to skill metadata min_credits_text_full (15) or min_credits_image_textured (30). Patch agentsam_spawn_job.merged_output with preflight_ok and credits_available. Fail fast with user-facing billing message if insufficient.',
  '["meshyai_*","agentsam_d1_query"]',
  1, 1,
  40,
  'custom',
  0,
  'low',
  0,
  '[]',
  1,
  0,
  NULL,
  '["/meshy","meshy","3d","cad","design studio"]',
  'read_write',
  datetime('now'),
  datetime('now')
)
ON CONFLICT(user_id, workspace_id, slug) DO UPDATE SET
  display_name = excluded.display_name,
  description = excluded.description,
  instructions_markdown = excluded.instructions_markdown,
  allowed_tool_globs = excluded.allowed_tool_globs,
  is_active = 1,
  is_platform_global = 1,
  updated_at = datetime('now');

INSERT INTO agentsam_subagent_profile (
  id, user_id, workspace_id, tenant_id, slug, display_name, description,
  instructions_markdown, allowed_tool_globs, is_active, is_platform_global,
  sort_order, agent_type, run_in_background, model_reasoning_effort,
  can_spawn_subagents, spawnable_agent_slugs, max_spawn_depth, is_parallelizable,
  output_schema_json, spawn_trigger_keywords, access_mode, created_at, updated_at
) VALUES (
  'asp_meshy_cad_generate',
  'platform', '', '',
  'meshy_cad_generate',
  'Meshy CAD Generate',
  'Starts text or image Meshy job via Worker /api/cad/meshy/generate.',
  'Read merged_output.prompt, mode (text|image), image_url. Use meshyai_text_to_3d or meshyai_image_to_3d (in-process Worker tools — never bare HTTP to IAM_ORIGIN). Store cad_job_id and meshy_preview_task_id in merged_output. Text path must request preview first; Worker chains refine when auto_refine is true.',
  '["meshyai_*","agentsam_d1_query"]',
  1, 1,
  41,
  'custom',
  0,
  'medium',
  0,
  '[]',
  1,
  0,
  NULL,
  '["/meshy","generate 3d","text to 3d","image to 3d"]',
  'read_write',
  datetime('now'),
  datetime('now')
)
ON CONFLICT(user_id, workspace_id, slug) DO UPDATE SET
  display_name = excluded.display_name,
  description = excluded.description,
  instructions_markdown = excluded.instructions_markdown,
  allowed_tool_globs = excluded.allowed_tool_globs,
  is_active = 1,
  is_platform_global = 1,
  updated_at = datetime('now');

INSERT INTO agentsam_subagent_profile (
  id, user_id, workspace_id, tenant_id, slug, display_name, description,
  instructions_markdown, allowed_tool_globs, is_active, is_platform_global,
  sort_order, agent_type, run_in_background, model_reasoning_effort,
  can_spawn_subagents, spawnable_agent_slugs, max_spawn_depth, is_parallelizable,
  output_schema_json, spawn_trigger_keywords, access_mode, created_at, updated_at
) VALUES (
  'asp_meshy_cad_wait',
  'platform', '', '',
  'meshy_cad_wait',
  'Meshy CAD Wait & Ingest',
  'Waits for webhook or polls status until GLB is on R2.',
  'Prefer webhook completion on agentsam_cad_jobs. Fallback: meshyai_get_task with cad_job_id every poll_interval_sec (default 8). On SUCCEEDED patch merged_output with r2_key and public_url. Surface progress_pct to parent run.',
  '["meshyai_*","agentsam_r2_get","agentsam_d1_query"]',
  1, 1,
  42,
  'custom',
  1,
  'low',
  0,
  '[]',
  1,
  0,
  NULL,
  '["meshy poll","cad status","glb ready"]',
  'read_write',
  datetime('now'),
  datetime('now')
)
ON CONFLICT(user_id, workspace_id, slug) DO UPDATE SET
  display_name = excluded.display_name,
  description = excluded.description,
  instructions_markdown = excluded.instructions_markdown,
  allowed_tool_globs = excluded.allowed_tool_globs,
  is_active = 1,
  is_platform_global = 1,
  run_in_background = excluded.run_in_background,
  updated_at = datetime('now');

INSERT INTO agentsam_subagent_profile (
  id, user_id, workspace_id, tenant_id, slug, display_name, description,
  instructions_markdown, allowed_tool_globs, is_active, is_platform_global,
  sort_order, agent_type, run_in_background, model_reasoning_effort,
  can_spawn_subagents, spawnable_agent_slugs, max_spawn_depth, is_parallelizable,
  output_schema_json, spawn_trigger_keywords, access_mode, created_at, updated_at
) VALUES (
  'asp_meshy_scene_deploy',
  'platform', '', '',
  'meshy_scene_deploy',
  'Meshy Scene Deploy',
  'Links completed GLB to Design Studio scene when scene_id is present.',
  'If merged_output.scene_id set and auto_scene_deploy true, attach public_url to design studio scene snapshot. Record spend_ledger when webhook provides consumed_credits. Return spawn URL for viewport.',
  '["agentsam_d1_query","agentsam_r2_get"]',
  1, 1,
  43,
  'custom',
  0,
  'medium',
  0,
  '[]',
  1,
  0,
  NULL,
  '["design studio","spawn glb","scene"]',
  'read_write',
  datetime('now'),
  datetime('now')
)
ON CONFLICT(user_id, workspace_id, slug) DO UPDATE SET
  display_name = excluded.display_name,
  description = excluded.description,
  instructions_markdown = excluded.instructions_markdown,
  allowed_tool_globs = excluded.allowed_tool_globs,
  is_active = 1,
  is_platform_global = 1,
  updated_at = datetime('now');

INSERT INTO agentsam_subagent_profile (
  id, user_id, workspace_id, tenant_id, slug, display_name, description,
  instructions_markdown, allowed_tool_globs, is_active, is_platform_global,
  sort_order, agent_type, run_in_background, model_reasoning_effort,
  can_spawn_subagents, spawnable_agent_slugs, max_spawn_depth, is_parallelizable,
  output_schema_json, spawn_trigger_keywords, access_mode, created_at, updated_at
) VALUES (
  'asp_meshy_postprocess_router',
  'platform', '', '',
  'meshy_postprocess_router',
  'Meshy Post-Process Router',
  'Optional remesh, convert, rig, animate child jobs.',
  'When user requests post-process, spawn child agentsam_cad_jobs with parent_job_id. Route to Meshy remesh/convert/rigging/animation APIs (Phase 2+). Only run after base GLB is done.',
  '["meshyai_*","agentsam_d1_query"]',
  1, 1,
  44,
  'custom',
  0,
  'medium',
  1,
  '[]',
  2,
  0,
  NULL,
  '["remesh","rig","animate","convert glb"]',
  'read_write',
  datetime('now'),
  datetime('now')
)
ON CONFLICT(user_id, workspace_id, slug) DO UPDATE SET
  display_name = excluded.display_name,
  description = excluded.description,
  instructions_markdown = excluded.instructions_markdown,
  allowed_tool_globs = excluded.allowed_tool_globs,
  is_active = 1,
  is_platform_global = 1,
  can_spawn_subagents = excluded.can_spawn_subagents,
  updated_at = datetime('now');
