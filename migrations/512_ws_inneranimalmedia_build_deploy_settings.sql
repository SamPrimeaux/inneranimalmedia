-- 512: ws_inneranimalmedia — canonical repo root, deploy/build commands, D1 SSOT for BYOK/memory.
--
-- Enables agentsam_stack_deploy / agentsam_worker_deploy and terminal wrangler/npm paths
-- without hardcoded operator scripts. Aligns agentsam_workspace.root_path with workspace_settings.workspace_root.
--
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml \
--     --file=migrations/512_ws_inneranimalmedia_build_deploy_settings.sql

UPDATE agentsam_workspace
SET
  root_path = '/Users/samprimeaux/inneranimalmedia',
  worker_name = 'inneranimalmedia',
  d1_database_id = 'cf87b717-d4e2-4cf8-bab0-a81268e32d49',
  d1_binding = 'DB',
  metadata_json = json_set(
    COALESCE(metadata_json, '{}'),
    '$.repo.local_path', '/Users/samprimeaux/inneranimalmedia',
    '$.repo.remote', 'https://github.com/SamPrimeaux/inneranimalmedia',
    '$.repo.branch', 'main',
    '$.deploy_patterns.full', 'npm run deploy:full',
    '$.deploy_patterns.stack', 'bash scripts/deploy-stack.sh',
    '$.deploy_patterns.worker_only', './scripts/with-cloudflare-env.sh npx wrangler deploy -c wrangler.production.toml',
    '$.deploy_patterns.build_vite', 'npm run build:vite-only',
    '$.deploy_patterns.validate_worker', 'node --check src/index.js'
  ),
  updated_at = unixepoch()
WHERE id = 'ws_inneranimalmedia';

UPDATE workspace_settings
SET settings_json = json_set(
  COALESCE(settings_json, '{}'),
  '$.workspace_root', '/Users/samprimeaux/inneranimalmedia',
  '$.workspace_cd_command', 'cd /Users/samprimeaux/inneranimalmedia',
  '$.deploy_stack_command', 'bash scripts/deploy-stack.sh',
  '$.deploy_worker_command', 'npm run deploy:full',
  '$.deploy_command', 'npm run deploy:full',
  '$.build_command', 'npm run build:vite-only',
  '$.validate_worker_command', 'node --check src/index.js',
  '$.terminal_hints', json_object(
    'wrangler_tail', 'npx wrangler tail inneranimalmedia -c wrangler.production.toml',
    'wrangler_deployments', 'npx wrangler deployments list -c wrangler.production.toml',
    'dev_deploy_auto', 'bash scripts/dev-deploy.sh',
    'dev_deploy_worker', 'bash scripts/dev-deploy.sh --worker',
    'dev_deploy_front', 'bash scripts/dev-deploy.sh --front'
  )
),
updated_at = unixepoch()
WHERE workspace_id = 'ws_inneranimalmedia';
