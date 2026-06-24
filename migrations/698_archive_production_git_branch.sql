-- 698: Archive obsolete git branch `production` — CF Builds and deploy hooks use `main` only.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/698_archive_production_git_branch.sql

PRAGMA foreign_keys = OFF;

UPDATE agentsam_workspace
SET
  metadata_json = json_set(
    json_set(
      json_set(
        COALESCE(metadata_json, '{}'),
        '$.repo.branch', 'main'
      ),
      '$.repo.archived_branches.production',
      json_object(
        'tag', 'archive/production-pre-main-sync-f2b12bbb',
        'tip_sha', 'f2b12bbb09694b19929335b814cff5edf20e038a',
        'archived_at', datetime('now'),
        'reason', 'Obsolete lineage; main is sole deploy branch'
      )
    ),
    '$.cf_builds.non_main_branch_excludes', json_array('main', 'production')
  ),
  updated_at = unixepoch()
WHERE id = 'ws_inneranimalmedia';

UPDATE workspace_settings
SET settings_json = json_set(
  json_set(
    COALESCE(settings_json, '{}'),
    '$.repo.branch', 'main'
  ),
  '$.cf_builds_non_main_branch_excludes', json_array('main', 'production')
),
updated_at = unixepoch()
WHERE workspace_id = 'ws_inneranimalmedia';

UPDATE agentsam_hook
SET
  handler_config = json_set(COALESCE(handler_config, '{}'), '$.git_branch', 'main'),
  updated_at = datetime('now')
WHERE id IN (
  'hook_cf_deploy_main',
  'hook_cf_prod_promote',
  'hook_cf_sandbox_validate',
  'hook_cf_mcp_server_deploy'
);

PRAGMA foreign_keys = ON;
