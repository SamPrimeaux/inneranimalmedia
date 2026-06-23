-- 695: Repair ws_inneranimalmedia github_repo / r2_prefix drift (fuelnfreetime bleed).
-- Root cause: workspaces.github_repo + agentsam_workspace.github_repo pointed at
-- SamPrimeaux/fuelnfreetime while metadata_json.repo already had inneranimalmedia.
-- UI list uses COALESCE(workspaces.github_repo, agentsam_workspace.github_repo).
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/695_ws_inneranimalmedia_repo_drift_repair.sql

PRAGMA foreign_keys = OFF;

-- Platform IAM — canonical parent SaaS repo + bindings
UPDATE agentsam_workspace
SET
  name = 'inneranimalmedia',
  display_name = 'inneranimalmedia',
  workspace_slug = 'inneranimalmedia',
  tenant_id = COALESCE(NULLIF(TRIM(tenant_id), ''), 'tenant_sam_primeaux'),
  root_path = '/Users/samprimeaux/inneranimalmedia',
  github_repo = 'SamPrimeaux/inneranimalmedia',
  worker_name = 'inneranimalmedia',
  r2_bucket = 'inneranimalmedia',
  r2_prefix = 'inneranimalmedia',
  d1_database_id = 'cf87b717-d4e2-4cf8-bab0-a81268e32d49',
  d1_binding = 'DB',
  cloudflare_account_id = 'ede6590ac0d2fb7daf155b35653457b2',
  workspace_ref_id = COALESCE(NULLIF(TRIM(workspace_ref_id), ''), 'ws_inneranimalmedia'),
  deploy_url = COALESCE(NULLIF(TRIM(deploy_url), ''), 'https://inneranimalmedia.com'),
  metadata_json = json_set(
    json_set(
      json_set(
        json_set(
          json_set(
            json_set(
              json_set(
                json_set(
                  COALESCE(metadata_json, '{}'),
                  '$.workspace_kind', 'platform'
                ),
                '$.label', 'SamPrimeaux/inneranimalmedia'
              ),
              '$.repo.local_path', '/Users/samprimeaux/inneranimalmedia'
            ),
            '$.repo.remote', 'https://github.com/SamPrimeaux/inneranimalmedia'
          ),
          '$.repo.branch', 'main'
        ),
        '$.github.remotes."SamPrimeaux/inneranimalmedia"', 'git@github.com:SamPrimeaux/inneranimalmedia.git'
      ),
      '$.d1_databases',
      json('[{"binding":"DB","database_name":"inneranimalmedia-business","database_id":"cf87b717-d4e2-4cf8-bab0-a81268e32d49"}]')
    ),
    '$.cloudflare_account_id', 'ede6590ac0d2fb7daf155b35653457b2'
  ),
  updated_at = unixepoch()
WHERE id = 'ws_inneranimalmedia';

UPDATE workspaces
SET
  name = 'inneranimalmedia',
  display_name = 'inneranimalmedia',
  slug = 'inneranimalmedia',
  github_repo = 'SamPrimeaux/inneranimalmedia',
  r2_prefix = 'inneranimalmedia',
  category = 'entity',
  status = 'active',
  tenant_id = COALESCE(NULLIF(TRIM(tenant_id), ''), 'tenant_sam_primeaux'),
  updated_at = unixepoch()
WHERE id = 'ws_inneranimalmedia';

UPDATE workspace_settings
SET settings_json = json_set(
  json_set(
    COALESCE(settings_json, '{}'),
    '$.workspace_root', '/Users/samprimeaux/inneranimalmedia'
  ),
  '$.github_repo', 'SamPrimeaux/inneranimalmedia'
),
updated_at = unixepoch()
WHERE workspace_id = 'ws_inneranimalmedia';

-- Tenant default = platform only (idempotent guard)
UPDATE tenant_workspaces
SET is_default = 0, updated_at = unixepoch()
WHERE tenant_id = 'tenant_sam_primeaux'
  AND workspace_id = 'ws_fuelnfreetime';

UPDATE tenant_workspaces
SET is_default = 1, is_active = 1, updated_at = unixepoch()
WHERE tenant_id = 'tenant_sam_primeaux'
  AND workspace_id = 'ws_inneranimalmedia';

-- Fuel client lane — explicit anchor (prevent cross-drift)
UPDATE agentsam_workspace
SET
  github_repo = 'SamPrimeaux/fuelnfreetime',
  worker_name = 'fuelnfreetime',
  root_path = '/Users/samprimeaux/fuelnfreetime',
  r2_bucket = 'fuelnfreetime',
  r2_prefix = 'fuelnfreetime',
  updated_at = unixepoch()
WHERE id = 'ws_fuelnfreetime';

UPDATE workspaces
SET github_repo = 'SamPrimeaux/fuelnfreetime', updated_at = unixepoch()
WHERE id = 'ws_fuelnfreetime';

PRAGMA foreign_keys = ON;
