-- 715: Meauxbility — full IAM workspace spine for CMS BYO runtime experiment.
-- Control plane: inneranimalmedia-business (this file).
-- Runtime plane: meauxbilityorg D1 — apply migrations/client-runtime/meauxbilityorg_001_cms_runtime.sql
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/715_meauxbility_cms_workspace_scaffold.sql

PRAGMA foreign_keys = OFF;

UPDATE workspaces
SET
  name = 'Meauxbility Foundation',
  display_name = 'Meauxbility Foundation',
  slug = 'meauxbility',
  status = 'active',
  tenant_id = 'tenant_nonprofit_organization',
  github_repo = 'SamPrimeaux/meauxbility',
  r2_prefix = 'meauxbility',
  category = 'entity',
  updated_at = unixepoch()
WHERE id = 'ws_meauxbility';

INSERT OR IGNORE INTO workspaces (id, name, display_name, slug, status, tenant_id, github_repo, r2_prefix, created_at, updated_at)
VALUES (
  'ws_meauxbility',
  'Meauxbility Foundation',
  'Meauxbility Foundation',
  'meauxbility',
  'active',
  'tenant_nonprofit_organization',
  'SamPrimeaux/meauxbility',
  'meauxbility',
  unixepoch(),
  unixepoch()
);

UPDATE agentsam_workspace
SET
  workspace_slug = 'meauxbility',
  tenant_id = 'tenant_nonprofit_organization',
  name = 'Meauxbility Foundation',
  display_name = 'Meauxbility Foundation',
  status = 'active',
  worker_name = 'meauxbility',
  d1_database_id = '011d1629-b5c8-49e7-8f6d-ca311ba936fe',
  d1_binding = 'DB',
  r2_bucket = 'meauxbilityv2',
  byok_r2_bucket = 'meauxbilityv2',
  r2_prefix = 'meauxbility',
  github_repo = 'SamPrimeaux/meauxbility',
  root_path = '/Users/samprimeaux/meauxbility',
  cloudflare_account_id = 'ede6590ac0d2fb7daf155b35653457b2',
  deploy_url = 'https://meauxbility.org',
  workspace_ref_id = 'ws_meauxbility',
  metadata_json = json_set(
    json_set(
      json_set(
        json_set(
          json_set(
            json_set(
              json_set(
                json_set(
                  json_set(
                    json_set(
                      json_set(
                        COALESCE(NULLIF(metadata_json, ''), '{}'),
                        '$.workspace_kind', 'operator_nonprofit_cms'
                      ),
                      '$.cf_account_id', 'ede6590ac0d2fb7daf155b35653457b2'
                    ),
                    '$.worker', 'meauxbility'
                  ),
                  '$.worker_base_url', 'https://meauxbility.meauxbility.workers.dev'
                ),
                '$.public_domain', 'meauxbility.org'
              ),
              '$.admin_domain', 'admin.meauxbility.org'
            ),
            '$.d1_databases',
            json('[{"binding":"DB","database_name":"meauxbilityorg","database_id":"011d1629-b5c8-49e7-8f6d-ca311ba936fe"}]')
          ),
          '$.r2_bindings',
          json('[{"binding":"ASSETS_BUCKET","bucket":"meauxbilityv2","s3_api":"https://ede6590ac0d2fb7daf155b35653457b2.r2.cloudflarestorage.com/meauxbilityv2","location":"WNAM"},{"binding":"INFRASTRUCTURE_BUCKET","bucket":"allinfrastructure"}]')
        ),
        '$.cms',
        json('{
          "mode":"byo_runtime",
          "default_project_slug":"meauxbility",
          "package_registry":"platform",
          "proceed_defaults":{
            "db_target":"workspace",
            "r2_target":"workspace",
            "worker_target":"workspace",
            "r2_bucket":"meauxbilityv2"
          },
          "r2_layout":{
            "published_prefix":"cms/ws_meauxbility/meauxbility/{page_slug}",
            "assets_bucket":"meauxbilityv2"
          }
        }')
      ),
      '$.repo.local_path', '/Users/samprimeaux/meauxbility'
    ),
    '$.repo.remote', 'https://github.com/SamPrimeaux/meauxbility'
  ),
  updated_at = unixepoch()
WHERE id = 'ws_meauxbility';

INSERT OR IGNORE INTO agentsam_workspace (
  id, workspace_slug, tenant_id, name, display_name, status,
  worker_name, d1_database_id, d1_binding, r2_bucket, byok_r2_bucket,
  r2_prefix, github_repo, root_path, cloudflare_account_id, deploy_url,
  workspace_ref_id, metadata_json, created_at, updated_at
)
VALUES (
  'ws_meauxbility',
  'meauxbility',
  'tenant_nonprofit_organization',
  'Meauxbility Foundation',
  'Meauxbility Foundation',
  'active',
  'meauxbility',
  '011d1629-b5c8-49e7-8f6d-ca311ba936fe',
  'DB',
  'meauxbilityv2',
  'meauxbilityv2',
  'meauxbility',
  'SamPrimeaux/meauxbility',
  '/Users/samprimeaux/meauxbility',
  'ede6590ac0d2fb7daf155b35653457b2',
  'https://meauxbility.org',
  'ws_meauxbility',
  json('{
    "workspace_kind":"operator_nonprofit_cms",
    "d1_databases":[{"binding":"DB","database_name":"meauxbilityorg","database_id":"011d1629-b5c8-49e7-8f6d-ca311ba936fe"}],
    "cms":{"mode":"byo_runtime","default_project_slug":"meauxbility","package_registry":"platform"}
  }'),
  unixepoch(),
  unixepoch()
);

UPDATE workspace_settings
SET settings_json = json_set(
  json_set(
    json_set(
      COALESCE(settings_json, '{}'),
      '$.workspace_root', '/Users/samprimeaux/meauxbility'
    ),
    '$.github_repo', 'SamPrimeaux/meauxbility'
  ),
  '$.cms_default_project', 'meauxbility'
),
updated_at = unixepoch()
WHERE workspace_id = 'ws_meauxbility';

INSERT OR IGNORE INTO workspace_settings (workspace_id, settings_json, updated_at)
VALUES (
  'ws_meauxbility',
  '{"workspace_root":"/Users/samprimeaux/meauxbility","github_repo":"SamPrimeaux/meauxbility","cms_default_project":"meauxbility"}',
  unixepoch()
);

UPDATE agentsam_project_context
SET
  project_type = 'cms_site',
  project_name = 'Meauxbility Foundation',
  description = '501(c)(3) nonprofit CMS experiment — BYO runtime on meauxbilityorg D1 + meauxbilityorgfinal R2. Package registry on IAM platform. Proceed defaults: workspace D1/R2/worker.',
  primary_tables = '["cms_pages","cms_page_sections","cms_assets"]',
  related_routes = '["/dashboard/cms/*","/api/cms/site-packages/*","meauxbility.org"]',
  workers_involved = 'meauxbility,inneranimalmedia',
  r2_buckets_involved = 'meauxbilityv2,allinfrastructure,cms',
  domains_involved = 'meauxbility.org,www.meauxbility.org,admin.meauxbility.org,meauxbility.meauxbility.workers.dev',
  notes = 'Migration 715 — CMS BYO spine. Runtime schema: migrations/client-runtime/meauxbilityorg_001_cms_runtime.sql',
  updated_at = unixepoch()
WHERE id = 'ctx_meauxbility';

PRAGMA foreign_keys = ON;
