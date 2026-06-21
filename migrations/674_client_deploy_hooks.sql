-- 674: Per-app deploy hooks for companionscpas + fuelnfreetime; sync metadata deploy_hook_url.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/674_client_deploy_hooks.sql

PRAGMA foreign_keys = OFF;

INSERT OR REPLACE INTO agentsam_hook (
  id, hook_key, tenant_id, workspace_id, user_id, provider, trigger, event_type,
  handler_type, handler_config, command, is_active, created_at
) VALUES
(
  'hook_deploy_companionscpas',
  'hook_deploy_companionscpas',
  'tenant_companionscpas',
  'ws_companionscpas',
  'au_871d920d1233cbd1',
  'system',
  'post_deploy',
  'post_deploy',
  'workers_deploy',
  '{"url":"https://api.cloudflare.com/client/v4/workers/builds/deploy_hooks/73b9a4da-28a1-4f6c-9f82-ffca946f9b6f","worker_name":"companionscpas"}',
  'trigger:workers_deploy_hook',
  1,
  datetime('now')
),
(
  'hook_deploy_fuelnfreetime',
  'hook_deploy_fuelnfreetime',
  'tenant_sam_primeaux',
  'ws_fuelnfreetime',
  'au_871d920d1233cbd1',
  'system',
  'post_deploy',
  'post_deploy',
  'workers_deploy',
  '{"url":"https://api.cloudflare.com/client/v4/workers/builds/deploy_hooks/0cbd475b-93c4-458a-ba72-0499a1caff90","worker_name":"fuelnfreetime"}',
  'trigger:workers_deploy_hook',
  1,
  datetime('now')
);

UPDATE agentsam_workspace
SET metadata_json = json_set(
  COALESCE(metadata_json, '{}'),
  '$.deploy_hook_url', 'https://api.cloudflare.com/client/v4/workers/builds/deploy_hooks/73b9a4da-28a1-4f6c-9f82-ffca946f9b6f'
),
updated_at = unixepoch()
WHERE id = 'ws_companionscpas';

UPDATE agentsam_workspace
SET metadata_json = json_set(
  COALESCE(metadata_json, '{}'),
  '$.deploy_hook_url', 'https://api.cloudflare.com/client/v4/workers/builds/deploy_hooks/0cbd475b-93c4-458a-ba72-0499a1caff90'
),
updated_at = unixepoch()
WHERE id = 'ws_fuelnfreetime';

UPDATE agentsam_workspace
SET metadata_json = json_remove(json_set(COALESCE(metadata_json, '{}'), '$.sprint_probe', NULL), '$.sprint_probe'),
updated_at = unixepoch()
WHERE id = 'ws_inneranimalmedia'
  AND json_extract(metadata_json, '$.sprint_probe') IS NOT NULL;

PRAGMA foreign_keys = ON;
