-- 670: Companions CPAS — platform D1 registry rows only (no client worker changes).
-- Mirror 645 fuel pattern: workspace anchor, agentsam_workspace bindings, cms_site context.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/670_companionscpas_cms_workspace.sql

PRAGMA foreign_keys = OFF;

INSERT OR IGNORE INTO workspaces (id, name, status, tenant_id, github_repo, created_at, updated_at)
VALUES (
  'ws_companionscpas',
  'Companions of CPAS',
  'active',
  'tenant_companionscpas',
  'SamPrimeaux/companionscpas',
  datetime('now'),
  datetime('now')
);

UPDATE workspaces
SET
  name = 'Companions of CPAS',
  status = 'active',
  tenant_id = 'tenant_companionscpas',
  github_repo = 'SamPrimeaux/companionscpas',
  updated_at = unixepoch()
WHERE id = 'ws_companionscpas';

INSERT OR IGNORE INTO agentsam_workspace (
  id, workspace_slug, tenant_id, name, display_name, status
) VALUES (
  'ws_companionscpas',
  'companionscpas',
  'tenant_companionscpas',
  'Companions of CPAS',
  'Companions of CPAS',
  'active'
);

UPDATE agentsam_workspace
SET
  workspace_slug = 'companionscpas',
  tenant_id = 'tenant_companionscpas',
  name = 'Companions of CPAS',
  display_name = 'Companions of CPAS',
  status = 'active',
  root_path = '/Users/samprimeaux/companionscpas',
  github_repo = 'SamPrimeaux/companionscpas',
  d1_database_id = 'fd6dd6fb-156b-4b6a-8ff0-505422652391',
  d1_binding = 'DB',
  cloudflare_account_id = 'ede6590ac0d2fb7daf155b35653457b2',
  worker_name = 'companionscpas',
  r2_bucket = 'companionscpas',
  r2_prefix = 'companionscpas',
  workspace_ref_id = 'ws_companionscpas',
  metadata_json = json_set(
    COALESCE(metadata_json, '{}'),
    '$.workspace_kind', 'client_saas',
    '$.cms_mode', 'client_worker',
    '$.api_profile', 'cpas_fragment',
    '$.worker_base_url', 'https://companionscpas.meauxbility.workers.dev',
    '$.public_domain', 'companionsofcaddo.org',
    '$.studio_path', '/dashboard/cms/website',
    '$.d1_database_id', 'fd6dd6fb-156b-4b6a-8ff0-505422652391',
    '$.r2_bucket', 'companionscpas',
    '$.deploy_hook_url', 'https://api.cloudflare.com/client/v4/workers/builds/deploy_hooks/73b9a4da-28a1-4f6c-9f82-ffca946f9b6f',
    '$.deploy_hook_scope', 'code_deploy_only',
    '$.bridge_key_secret', 'AGENTSAM_BRIDGE_KEY'
  ),
  updated_at = unixepoch()
WHERE id = 'ws_companionscpas';

INSERT OR REPLACE INTO workspace_settings (
  workspace_id, theme_id, timezone, locale, settings_json, updated_at
) VALUES (
  'ws_companionscpas',
  'theme-solarized-dark',
  'America/Chicago',
  'en-US',
  json_object(
    'workspace_root', '/Users/samprimeaux/companionscpas',
    'github_repo', 'SamPrimeaux/companionscpas',
    'd1_database_id', 'fd6dd6fb-156b-4b6a-8ff0-505422652391',
    'cloudflare_account_id', 'ede6590ac0d2fb7daf155b35653457b2',
    'r2_bucket', 'companionscpas',
    'worker_name', 'companionscpas',
    'cms_mode', 'client_worker'
  ),
  unixepoch()
);

INSERT OR IGNORE INTO workspace_members
  (user_id, workspace_id, role, tenant_id, is_active, created_at, updated_at)
VALUES
  ('au_871d920d1233cbd1', 'ws_companionscpas', 'owner', 'tenant_sam_primeaux', 1, unixepoch(), unixepoch());

PRAGMA foreign_keys = ON;
