-- 464: Workspace-selected external data bindings (no secrets — tokens stay in user_oauth_tokens).
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/464_agentsam_workspace_data_bindings.sql

CREATE TABLE IF NOT EXISTS agentsam_workspace_data_bindings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  connection_id TEXT,
  external_account_id TEXT,
  external_project_id TEXT,
  external_project_ref TEXT,
  external_database_id TEXT,
  display_name TEXT,
  selected_as_default INTEGER NOT NULL DEFAULT 0,
  capabilities_json TEXT,
  scopes_json TEXT,
  health_status TEXT NOT NULL DEFAULT 'unknown',
  last_verified_at INTEGER,
  metadata_json TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_agentsam_ws_data_bindings_workspace
  ON agentsam_workspace_data_bindings (workspace_id, provider);

CREATE INDEX IF NOT EXISTS idx_agentsam_ws_data_bindings_user
  ON agentsam_workspace_data_bindings (user_id, workspace_id);
