-- 538: plan-and-execute skill — R2 body + D1 registry for Plan mode
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/538_plan_and_execute_skill.sql
-- Upload:
--   ./scripts/upload-plan-and-execute-skill-r2.sh

INSERT OR REPLACE INTO agentsam_skill (
  id, tenant_id, user_id, person_uuid, workspace_id, name, description,
  content_markdown, file_path, scope, slash_trigger, globs, always_apply,
  task_types_json, route_keys_json, default_model_key, model_constraints_json,
  access_mode, icon, tags_json, metadata_json, token_estimate, version,
  retrieval_strategy, is_active, sort_order, created_at, updated_at
) VALUES (
  'skill_plan_and_execute',
  'tenant_sam_primeaux',
  'au_871d920d1233cbd1',
  '',
  'ws_inneranimalmedia',
  'Plan and Execute',
  'Break down multi-step goals into D1 plan tasks, execute sequentially with visible checklist progress. Use in Plan mode to create; Agent/Multitask to run.',
  '',
  'skills/plan-and-execute/SKILL.md',
  'workspace',
  'plan-execute',
  '["docs/plans/**","docs/platform/**","migrations/**","dashboard/components/ChatAssistant/**"]',
  0,
  '["plan","plan_pipeline","workflow"]',
  '["plan","agent_general"]',
  NULL,
  '{}',
  'read_write',
  'list-todo',
  '["plan","execute","tasks","workflow","agentsam"]',
  '{"r2_bucket":"inneranimalmedia-autorag","r2_skill_key":"skills/plan-and-execute/SKILL.md"}',
  900,
  1,
  'r2',
  1,
  12,
  datetime('now'),
  datetime('now')
);
