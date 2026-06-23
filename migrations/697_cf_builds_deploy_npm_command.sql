-- 697: CF Builds deploy via npm (Node image has no bash — bash scripts/cf-builds-deploy.sh fails).
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/697_cf_builds_deploy_npm_command.sql
--   ./scripts/cf-builds-sync.sh

PRAGMA foreign_keys = OFF;

UPDATE agentsam_workspace
SET
  metadata_json = json_set(
    json_set(
      COALESCE(metadata_json, '{}'),
      '$.cf_builds.deploy_command', 'npm run deploy:cf-builds'
    ),
    '$.cf_builds.version_command', 'npm run deploy:cf-builds'
  ),
  updated_at = unixepoch()
WHERE id IN ('ws_inneranimalmedia', 'ws_fuelnfreetime', 'ws_iam_pwa_services');

UPDATE workspace_settings
SET settings_json = json_set(
  json_set(
    json_set(
      json_set(
        COALESCE(settings_json, '{}'),
        '$.cf_builds_deploy_command', 'npm run deploy:cf-builds'
      ),
      '$.cf_builds_version_command', 'npm run deploy:cf-builds'
    ),
    '$.deploy_worker_command', 'npm run deploy:cf-builds'
  ),
  '$.deploy_command', COALESCE(json_extract(settings_json, '$.deploy_command'), 'npm run deploy:full')
),
updated_at = unixepoch()
WHERE workspace_id IN ('ws_inneranimalmedia', 'ws_fuelnfreetime', 'ws_iam_pwa_services');

PRAGMA foreign_keys = ON;
