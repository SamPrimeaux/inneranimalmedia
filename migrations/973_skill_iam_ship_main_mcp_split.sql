-- 973: Split IAM ship into /iam-ship-main + /iam-ship-mcp; skill_deploy becomes umbrella router.
-- Upload:
--   skills/deploy/SKILL.md
--   skills/iam-ship-main/SKILL.md
--   skills/iam-ship-mcp/SKILL.md

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
  'IAM ship (pick main or MCP)',
  'Umbrella only — does not deploy. Route to /iam-ship-main or /iam-ship-mcp so repo roots are never mixed.',
  '',
  'skills/deploy/SKILL.md',
  'workspace',
  'iam-ship',
  '["skills/iam-ship-main/SKILL.md","skills/iam-ship-mcp/SKILL.md","docs/platform/mac-free-ship-lanes-2026-07.md"]',
  0,
  '["deploy","ship"]',
  '["deploy","terminal_execution","agent_general"]',
  NULL,
  '{}',
  'read_only',
  'git-branch',
  '["iam-ship","router","ws_inneranimalmedia"]',
  '{"r2_bucket":"inneranimalmedia-autorag","r2_skill_key":"skills/deploy/SKILL.md","routes_to":["skill_iam_ship_main","skill_iam_ship_mcp"],"workspace_id":"ws_inneranimalmedia"}',
  250,
  5,
  'r2',
  1,
  1,
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
  'skill_iam_ship_main',
  'tenant_sam_primeaux',
  'au_871d920d1233cbd1',
  '',
  'ws_inneranimalmedia',
  'IAM ship — main (inneranimalmedia)',
  'Deploy ONLY SamPrimeaux/inneranimalmedia Worker+dashboard/PWA. Mac deploy:full/fast or GCP ship:remote. Never MCP.',
  '',
  'skills/iam-ship-main/SKILL.md',
  'workspace',
  'iam-ship-main',
  '["scripts/deploy-frontend.sh","scripts/deploy-fast.sh","scripts/ship-remote.sh","scripts/post-deploy-record.sh","scripts/upload-auth-pages.sh","docs/platform/mac-free-ship-lanes-2026-07.md"]',
  0,
  '["deploy","ship","pwa","wrangler"]',
  '["deploy","terminal_execution","agent_general"]',
  NULL,
  '{}',
  'read_write',
  'rocket',
  '["iam-ship-main","inneranimalmedia","deploy","ws_inneranimalmedia"]',
  '{"r2_bucket":"inneranimalmedia-autorag","r2_skill_key":"skills/iam-ship-main/SKILL.md","repo":"SamPrimeaux/inneranimalmedia","root_mac":"/Users/samprimeaux/inneranimalmedia","url":"https://inneranimalmedia.com","workspace_id":"ws_inneranimalmedia","tenant_id":"tenant_sam_primeaux","sibling":"skill_iam_ship_mcp"}',
  900,
  1,
  'r2',
  1,
  1,
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
  'skill_iam_ship_mcp',
  'tenant_sam_primeaux',
  'au_871d920d1233cbd1',
  '',
  'ws_inneranimalmedia',
  'IAM ship — MCP (inneranimalmedia-mcp-server)',
  'Deploy ONLY SamPrimeaux/inneranimalmedia-mcp-server to mcp.inneranimalmedia.com. Never main app Vite/PWA.',
  '',
  'skills/iam-ship-mcp/SKILL.md',
  'workspace',
  'iam-ship-mcp',
  '["/Users/samprimeaux/inneranimalmedia-mcp-server/package.json","docs/platform/mac-free-ship-lanes-2026-07.md"]',
  0,
  '["deploy","ship","mcp","wrangler"]',
  '["deploy","terminal_execution","agent_general"]',
  NULL,
  '{}',
  'read_write',
  'server',
  '["iam-ship-mcp","mcp","deploy","ws_inneranimalmedia"]',
  '{"r2_bucket":"inneranimalmedia-autorag","r2_skill_key":"skills/iam-ship-mcp/SKILL.md","repo":"SamPrimeaux/inneranimalmedia-mcp-server","root_mac":"/Users/samprimeaux/inneranimalmedia-mcp-server","url":"https://mcp.inneranimalmedia.com","workspace_id":"ws_inneranimalmedia","tenant_id":"tenant_sam_primeaux","sibling":"skill_iam_ship_main"}',
  500,
  1,
  'r2',
  1,
  1,
  datetime('now'),
  datetime('now')
);

INSERT INTO agentsam_skill_revision (skill_id, content_markdown, version, change_note)
SELECT 'skill_deploy', '', 5, '2026-07-21: umbrella router; real deploy bodies split to skill_iam_ship_main / skill_iam_ship_mcp'
WHERE NOT EXISTS (SELECT 1 FROM agentsam_skill_revision WHERE skill_id = 'skill_deploy' AND version = 5);
