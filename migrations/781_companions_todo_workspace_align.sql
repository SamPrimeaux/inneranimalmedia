-- 781: Align Companions todos to IAM workspace (SSOT for client task lists).
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--   --remote -c wrangler.production.toml --file=./migrations/781_companions_todo_workspace_align.sql

UPDATE agentsam_todo
SET workspace_id = 'ws_inneranimalmedia',
    updated_at = datetime('now')
WHERE client_id = 'client_companions_cpas'
  AND project_id = 'proj_companions_cpas_web'
  AND COALESCE(workspace_id, '') != 'ws_inneranimalmedia';
