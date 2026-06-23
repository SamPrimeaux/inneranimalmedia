-- 692: Align CF Builds deploy commands across platform workers (SSOT in workspace_settings).
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/692_workers_builds_deploy_alignment.sql

PRAGMA foreign_keys = OFF;

-- Platform IAM (canonical CF Builds pattern; local deploy:full unchanged)
UPDATE agentsam_workspace
SET
  metadata_json = json_set(
    json_set(
      json_set(
        COALESCE(metadata_json, '{}'),
        '$.cf_builds.build_command', 'node scripts/smart-build.mjs'
      ),
      '$.cf_builds.deploy_command', 'bash scripts/cf-builds-deploy.sh'
    ),
    '$.cf_builds.version_command', 'bash scripts/cf-builds-deploy.sh'
  ),
  updated_at = unixepoch()
WHERE id = 'ws_inneranimalmedia';

UPDATE workspace_settings
SET settings_json = json_set(
  json_set(
    json_set(
      COALESCE(settings_json, '{}'),
      '$.cf_builds_build_command', 'node scripts/smart-build.mjs'
    ),
    '$.cf_builds_deploy_command', 'bash scripts/cf-builds-deploy.sh'
  ),
  '$.cf_builds_version_command', 'bash scripts/cf-builds-deploy.sh'
),
updated_at = unixepoch()
WHERE workspace_id = 'ws_inneranimalmedia';

-- Fuel N Free Time client workspace
UPDATE agentsam_workspace
SET
  root_path = '/Users/samprimeaux/fuelnfreetime',
  worker_name = 'fuelnfreetime',
  metadata_json = json_set(
    json_set(
      json_set(
        json_set(
          COALESCE(metadata_json, '{}'),
          '$.repo.local_path', '/Users/samprimeaux/fuelnfreetime'
        ),
        '$.repo.remote', 'https://github.com/SamPrimeaux/fuelnfreetime'
      ),
      '$.cf_builds.build_command', 'npm run build'
    ),
    '$.cf_builds.deploy_command', 'bash scripts/cf-builds-deploy.sh'
  ),
  updated_at = unixepoch()
WHERE id = 'ws_fuelnfreetime';

UPDATE workspace_settings
SET settings_json = json_set(
  json_set(
    json_set(
      json_set(
        json_set(
          COALESCE(settings_json, '{}'),
          '$.cf_builds_build_command', 'npm run build'
        ),
        '$.cf_builds_deploy_command', 'bash scripts/cf-builds-deploy.sh'
      ),
      '$.cf_builds_version_command', 'bash scripts/cf-builds-deploy.sh'
    ),
    '$.deploy_worker_command', 'bash scripts/cf-builds-deploy.sh'
  ),
  '$.build_command', 'npm run build'
),
updated_at = unixepoch()
WHERE workspace_id = 'ws_fuelnfreetime';

-- PWA companion worker (services.inneranimalmedia.com)
INSERT OR IGNORE INTO workspaces (id, name, status, tenant_id, github_repo, created_at, updated_at)
VALUES (
  'ws_iam_pwa_services',
  'IAM PWA Services',
  'active',
  'tenant_sam_primeaux',
  'SamPrimeaux/iam-pwa-services',
  datetime('now'),
  datetime('now')
);

UPDATE workspaces
SET
  name = 'IAM PWA Services',
  status = 'active',
  tenant_id = 'tenant_sam_primeaux',
  github_repo = 'SamPrimeaux/iam-pwa-services',
  updated_at = unixepoch()
WHERE id = 'ws_iam_pwa_services';

INSERT OR IGNORE INTO agentsam_workspace (
  id, workspace_slug, tenant_id, name, display_name, status
) VALUES (
  'ws_iam_pwa_services',
  'iam-pwa-services',
  'tenant_sam_primeaux',
  'inneranimalmedia-pwa-services',
  'IAM PWA Services',
  'active'
);

UPDATE agentsam_workspace
SET
  workspace_slug = 'iam-pwa-services',
  tenant_id = 'tenant_sam_primeaux',
  name = 'inneranimalmedia-pwa-services',
  display_name = 'IAM PWA Services',
  status = 'active',
  root_path = '/Users/samprimeaux/iam-pwa-services',
  github_repo = 'SamPrimeaux/iam-pwa-services',
  worker_name = 'inneranimalmedia-pwa-services',
  metadata_json = json_set(
    json_set(
      json_set(
        json_set(
          COALESCE(metadata_json, '{}'),
          '$.workspace_kind', 'companion'
        ),
        '$.repo.local_path', '/Users/samprimeaux/iam-pwa-services'
      ),
      '$.repo.remote', 'https://github.com/SamPrimeaux/iam-pwa-services'
    ),
    '$.cf_builds.build_command', 'npm run build'
  ),
  updated_at = unixepoch()
WHERE id = 'ws_iam_pwa_services';

UPDATE agentsam_workspace
SET
  metadata_json = json_set(
    json_set(
      COALESCE(metadata_json, '{}'),
      '$.cf_builds.deploy_command', 'bash scripts/cf-builds-deploy.sh'
    ),
    '$.cf_builds.version_command', 'bash scripts/cf-builds-deploy.sh'
  ),
  updated_at = unixepoch()
WHERE id = 'ws_iam_pwa_services';

INSERT OR REPLACE INTO workspace_settings (
  workspace_id, theme_id, timezone, locale, settings_json, updated_at
) VALUES (
  'ws_iam_pwa_services',
  'theme-solarized-dark',
  'America/Chicago',
  'en-US',
  json_object(
    'workspace_root', '/Users/samprimeaux/iam-pwa-services',
    'github_repo', 'SamPrimeaux/iam-pwa-services',
    'worker_name', 'inneranimalmedia-pwa-services',
    'cf_builds_build_command', 'npm run build',
    'cf_builds_deploy_command', 'bash scripts/cf-builds-deploy.sh',
    'cf_builds_version_command', 'bash scripts/cf-builds-deploy.sh',
    'deploy_worker_command', 'bash scripts/cf-builds-deploy.sh',
    'build_command', 'npm run build'
  ),
  unixepoch()
);

PRAGMA foreign_keys = ON;
