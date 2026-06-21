-- 673: Normalize curl deploy hooks → handler_type=workers_deploy + handler_config.url.
-- Fix orphan workspace_ids (prod/pr aliases → ws_inneranimalmedia).
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/673_normalize_deploy_hooks.sql

PRAGMA foreign_keys = OFF;

-- Fix orphan hook workspace_ids
UPDATE agentsam_hook SET workspace_id = 'ws_inneranimalmedia'
WHERE id IN ('hook_cf_prod_promote', 'hook_cf_deploy_main')
  AND workspace_id IN ('ws_inneranimalmedia_prod', 'ws_inneranimalmedia_pr');

UPDATE agentsam_hook
SET
  handler_type = 'workers_deploy',
  event_type = COALESCE(event_type, trigger, 'post_deploy'),
  handler_config = json_object(
    'url', trim(replace(replace(command, 'curl -s -X POST ', ''), 'curl -X POST ', '')),
    'worker_name', CASE id
      WHEN 'hook_cf_sandbox_validate' THEN 'inneranimalmedia'
      WHEN 'hook_cf_mcp_server_deploy' THEN 'inneranimalmedia-mcp-server'
      WHEN 'hook_cf_prod_promote' THEN 'inneranimalmedia'
      WHEN 'hook_cf_deploy_main' THEN 'inneranimalmedia'
      ELSE NULL
    END
  )
WHERE id IN (
  'hook_cf_sandbox_validate',
  'hook_cf_mcp_server_deploy',
  'hook_cf_prod_promote',
  'hook_cf_deploy_main'
)
AND command LIKE 'curl%deploy_hooks/%';

UPDATE agentsam_hook
SET is_active = 0
WHERE id IN ('hook_cf_mobiledashboard', 'hook_cf_meauxcad')
  AND command LIKE '%PENDING_%';

PRAGMA foreign_keys = ON;
