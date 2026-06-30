-- 738: Repair ws_inneranimalmedia SSOT + remove IAM repo bleed on ws_pelicanpeptides.
-- Canonical inneranimalmedia = Worker inneranimalmedia, repo SamPrimeaux/inneranimalmedia,
-- D1 inneranimalmedia-business, domain inneranimalmedia.com, workspace id ws_inneranimalmedia.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/738_ws_inneranimalmedia_identity_repair.sql

UPDATE agentsam_workspace
SET
  github_repo = 'SamPrimeaux/inneranimalmedia',
  worker_name = 'inneranimalmedia',
  deploy_url = 'https://inneranimalmedia.com',
  root_path = '/Users/samprimeaux/inneranimalmedia',
  d1_database_id = 'cf87b717-d4e2-4cf8-bab0-a81268e32d49',
  d1_binding = 'DB',
  cloudflare_account_id = 'ede6590ac0d2fb7daf155b35653457b2',
  workspace_ref_id = COALESCE(NULLIF(trim(workspace_ref_id), ''), 'ws_inneranimalmedia'),
  updated_at = unixepoch()
WHERE id = 'ws_inneranimalmedia';

UPDATE workspaces
SET
  github_repo = 'SamPrimeaux/inneranimalmedia',
  slug = 'inneranimalmedia',
  display_name = 'inneranimalmedia',
  name = 'inneranimalmedia',
  tenant_id = COALESCE(NULLIF(trim(tenant_id), ''), 'tenant_sam_primeaux'),
  updated_at = unixepoch()
WHERE id = 'ws_inneranimalmedia';

UPDATE agentsam_workspace
SET github_repo = NULL, updated_at = unixepoch()
WHERE id = 'ws_pelicanpeptides';

UPDATE workspaces
SET github_repo = NULL, updated_at = unixepoch()
WHERE id = 'ws_pelicanpeptides';

UPDATE auth_users
SET active_workspace_id = 'ws_inneranimalmedia', updated_at = datetime('now')
WHERE id = 'au_871d920d1233cbd1'
  AND trim(COALESCE(active_workspace_id, '')) = 'ws_pelicanpeptides';

UPDATE workspace_settings
SET settings_json = json_set(
      COALESCE(settings_json, '{}'),
      '$.cf_worker_name', 'inneranimalmedia',
      '$.cf_d1_database_name', 'inneranimalmedia-business',
      '$.cf_d1_database_id', 'cf87b717-d4e2-4cf8-bab0-a81268e32d49',
      '$.github_repo', 'SamPrimeaux/inneranimalmedia',
      '$.workspace_root', '/Users/samprimeaux/inneranimalmedia',
      '$.deploy_command', 'npm run deploy:full'
    ),
    updated_at = unixepoch()
WHERE workspace_id = 'ws_inneranimalmedia';
