-- 971: Specialize skill_deploy → IAM platform ship (main+MCP); restore accurate post-deploy / static / webhook notes.
-- Upload: ./scripts/with-cloudflare-env.sh npx wrangler r2 object put inneranimalmedia-autorag/skills/deploy/SKILL.md \
--   --file=skills/deploy/SKILL.md --content-type="text/markdown; charset=utf-8" --remote -c wrangler.production.toml
-- Apply: wrangler d1 execute … --file=./migrations/971_skill_deploy_iam_platform_ship.sql

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
  'IAM platform ship (main + MCP)',
  'Ship SamPrimeaux/inneranimalmedia (Worker+dashboard/PWA) and inneranimalmedia-mcp-server. Mac deploy:full/fast, GCP ship:remote, static HTML R2 uploads, post-deploy deployments/dashboard_versions/agentsam_memory, CF webhook. Not generic customer deploys.',
  '',
  'skills/deploy/SKILL.md',
  'workspace',
  'iam-ship',
  '["docs/platform/mac-free-ship-lanes-2026-07.md",".cursor/rules/iam-ship-lanes.mdc","scripts/deploy-frontend.sh","scripts/deploy-fast.sh","scripts/ship-remote.sh","scripts/post-deploy-record.sh","scripts/post-deploy-memory-sync.sh","scripts/upload-auth-pages.sh","scripts/upload-dashboard-app-r2-prod.sh","src/api/webhooks/cloudflare.js"]',
  0,
  '["deploy","ship","wrangler","pwa","mcp"]',
  '["deploy","terminal_execution","agent_general"]',
  NULL,
  '{}',
  'read_write',
  'rocket',
  '["iam-ship","deploy","inneranimalmedia","mcp","pwa","ws_inneranimalmedia"]',
  '{"r2_bucket":"inneranimalmedia-autorag","r2_skill_key":"skills/deploy/SKILL.md","skill_key":"iam-platform-ship","slash_aliases":["deploy","iam-ship"],"main_repo":"SamPrimeaux/inneranimalmedia","mcp_repo":"SamPrimeaux/inneranimalmedia-mcp-server","workspace_id":"ws_inneranimalmedia","tenant_id":"tenant_sam_primeaux","dashboard_r2_prefix":"static/dashboard/app/","assets_bucket":"inneranimalmedia","post_deploy":["deployments","dashboard_versions","agentsam_memory","agentsam_deploy_events","/api/internal/post-deploy"],"webhook":"/api/webhooks/cloudflare","webhook_auth":"X-Cf-Webhook-Secret|Bearer INTERNAL_WEBHOOK_SECRET"}',
  1400,
  4,
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
  4,
  '2026-07-21: rename focus to IAM platform ship; restore post-deploy ledgers, static HTML scripts, security scan, CF webhook (corrected auth); drop dead upload-public-pages paths'
WHERE NOT EXISTS (
  SELECT 1 FROM agentsam_skill_revision WHERE skill_id = 'skill_deploy' AND version = 4
);
