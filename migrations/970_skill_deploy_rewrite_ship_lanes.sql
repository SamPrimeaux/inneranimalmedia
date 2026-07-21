-- 970: Rewrite skill_deploy for current Mac/GCP/MCP ship lanes (retire stale sandbox/promote copy).
-- Upload:
--   ./scripts/upload-iam-skills-autorag.sh
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/970_skill_deploy_rewrite_ship_lanes.sql

-- Point older overlapping deploy skills at the rewritten SSOT (keep readable, demote slash noise).
UPDATE agentsam_skill
SET
  description = 'SUPERSEDED by skill_deploy (ship lanes 2026-07). Kept for history — use /deploy.',
  is_active = 0,
  updated_at = datetime('now')
WHERE id IN ('skill_iam_deploy_rules', 'skill_deploy_runbook');

INSERT OR REPLACE INTO agentsam_skill (
  id, tenant_id, user_id, person_uuid, workspace_id, name, description,
  content_markdown, file_path, scope, slash_trigger, globs, always_apply,
  task_types_json, route_keys_json, default_model_key, model_constraints_json,
  access_mode, icon, tags_json, metadata_json, token_estimate, version,
  retrieval_strategy, is_active, sort_order, created_at, updated_at
) VALUES (
  'skill_deploy',
  'tenant_sam_primeaux',
  'au_871d920d1233cbd1',
  '',
  'ws_inneranimalmedia',
  'Deploy (IAM ship lanes)',
  'Deploy inneranimalmedia (Mac deploy:full/fast or GCP ship:remote) and inneranimalmedia-mcp-server (separate root, deploy:full). Host matrix, workspace scope, proof via pwa-build-meta. Replaces sandbox/promote-to-prod skill body.',
  '',
  'skills/deploy/SKILL.md',
  'workspace',
  'deploy',
  '["docs/platform/mac-free-ship-lanes-2026-07.md",".cursor/rules/iam-ship-lanes.mdc",".cursor/rules/iam-ship-gate.mdc","scripts/ship-remote.sh","scripts/deploy-fast.sh","scripts/deploy-frontend.sh","package.json"]',
  0,
  '["deploy","ship","wrangler","pwa"]',
  '["deploy","terminal_execution","agent_general"]',
  NULL,
  '{}',
  'read_write',
  'rocket',
  '["deploy","ship-lanes","wrangler","cloudflare","mcp","pwa","ws_inneranimalmedia"]',
  '{"r2_bucket":"inneranimalmedia-autorag","r2_skill_key":"skills/deploy/SKILL.md","main_repo":"SamPrimeaux/inneranimalmedia","mcp_repo":"SamPrimeaux/inneranimalmedia-mcp-server","main_root_mac":"/Users/samprimeaux/inneranimalmedia","mcp_root_mac":"/Users/samprimeaux/inneranimalmedia-mcp-server","workspace_id":"ws_inneranimalmedia","tenant_id":"tenant_sam_primeaux","d1":"inneranimalmedia-business","ssot":"docs/platform/mac-free-ship-lanes-2026-07.md","supersedes":["skill_iam_deploy_rules","skill_deploy_runbook","legacy_sandbox_promote"]}',
  1100,
  3,
  'r2',
  1,
  1,
  datetime('now'),
  datetime('now')
);

INSERT INTO agentsam_skill_revision (skill_id, content_markdown, version, change_note)
SELECT
  'skill_deploy',
  '',
  3,
  '2026-07-21: rewrite for mac-free ship lanes; dual-repo (main+MCP); workspace ws_inneranimalmedia; R2 body; supersede skill_iam_deploy_rules + skill_deploy_runbook'
WHERE NOT EXISTS (
  SELECT 1 FROM agentsam_skill_revision WHERE skill_id = 'skill_deploy' AND version = 3
);
