-- 520: ws_inneranimalmedia — canonical parent SaaS repo on workspaces + agentsam_workspace (MCP /health + resolver).
-- Parent repo: SamPrimeaux/inneranimalmedia (HTTPS + SSH remotes in metadata already from 512/514/515).
-- Tenant scope: tenant_sam_primeaux (operator emails share this tenant via auth_users).
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/520_ws_inneranimalmedia_github_repo_ssot.sql

UPDATE workspaces
SET
  github_repo = 'SamPrimeaux/inneranimalmedia',
  tenant_id = COALESCE(NULLIF(trim(tenant_id), ''), 'tenant_sam_primeaux'),
  updated_at = unixepoch()
WHERE id = 'ws_inneranimalmedia';

UPDATE agentsam_workspace
SET
  github_repo = 'SamPrimeaux/inneranimalmedia',
  tenant_id = COALESCE(NULLIF(trim(tenant_id), ''), 'tenant_sam_primeaux'),
  workspace_ref_id = COALESCE(NULLIF(trim(workspace_ref_id), ''), 'ws_inneranimalmedia'),
  root_path = COALESCE(NULLIF(trim(root_path), ''), '/Users/samprimeaux/inneranimalmedia'),
  metadata_json = json_set(
    COALESCE(metadata_json, '{}'),
    '$.repo.remote', 'https://github.com/SamPrimeaux/inneranimalmedia',
    '$.repo.local_path', COALESCE(json_extract(COALESCE(metadata_json, '{}'), '$.repo.local_path'), '/Users/samprimeaux/inneranimalmedia'),
    '$.github.remotes."SamPrimeaux/inneranimalmedia"', 'git@github.com:SamPrimeaux/inneranimalmedia.git'
  ),
  updated_at = unixepoch()
WHERE id = 'ws_inneranimalmedia';

UPDATE workspace_settings
SET settings_json = json_set(
  COALESCE(settings_json, '{}'),
  '$.workspace_root', COALESCE(json_extract(COALESCE(settings_json, '{}'), '$.workspace_root'), '/Users/samprimeaux/inneranimalmedia'),
  '$.github_repo', 'SamPrimeaux/inneranimalmedia'
),
updated_at = unixepoch()
WHERE workspace_id = 'ws_inneranimalmedia';
