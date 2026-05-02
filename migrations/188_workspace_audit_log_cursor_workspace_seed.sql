-- 188: workspace_audit_log — agent session record for ws_agentsandbox + wp_inneranimalmedia seeds (migrations 186–187).
--
-- Apply prod:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/188_workspace_audit_log_cursor_workspace_seed.sql

INSERT OR IGNORE INTO workspace_audit_log (
  id,
  workspace_id,
  actor_type,
  actor_id,
  actor_email,
  action,
  entity_type,
  entity_id,
  before_json,
  after_json,
  severity,
  created_at
) VALUES (
  'wal_cursor_wp_seed_20260331',
  'ws_inneranimalmedia',
  'agent',
  'cursor_agent',
  NULL,
  'SEED_WORKSPACE_ROWS',
  'migration',
  '186+187',
  NULL,
  '{"migrations":["186_ws_agentsandbox_workspace.sql","187_workspace_projects_wp_inneranimalmedia.sql"],"workspaces":["ws_agentsandbox"],"workspace_settings":["ws_agentsandbox"],"workspace_projects":["wp_agentsandbox_iam_shell","wp_inneranimalmedia"],"notes":"TOOLS shell origin https://tools.inneranimalmedia.com"}',
  'info',
  unixepoch()
);
