-- 254: Auth event log, integration normalization, OAuth state audit (D1).
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/254_auth_events_and_integration_normalization.sql

CREATE TABLE IF NOT EXISTS auth_event_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  user_id TEXT,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok',
  provider TEXT,
  metadata_json TEXT DEFAULT '{}',
  ip_hash TEXT,
  user_agent_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_auth_event_log_tenant_created ON auth_event_log(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_auth_event_log_user_created ON auth_event_log(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_auth_event_log_type ON auth_event_log(event_type);

CREATE TABLE IF NOT EXISTS integration_connections (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  connection_type TEXT NOT NULL DEFAULT 'oauth',
  display_name TEXT,
  account_identifier TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'disconnected',
  scopes_json TEXT DEFAULT '[]',
  permissions_json TEXT DEFAULT '{}',
  metadata_json TEXT DEFAULT '{}',
  last_verified_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tenant_id, user_id, provider, account_identifier)
);

CREATE INDEX IF NOT EXISTS idx_integration_connections_user_provider ON integration_connections(user_id, provider);
CREATE INDEX IF NOT EXISTS idx_integration_connections_status ON integration_connections(tenant_id, status);

CREATE TABLE IF NOT EXISTS integration_resources (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  provider_resource_id TEXT,
  name TEXT,
  url TEXT,
  metadata_json TEXT DEFAULT '{}',
  synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_integration_resources_conn ON integration_resources(connection_id, provider);

CREATE TABLE IF NOT EXISTS integration_audit_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  user_id TEXT,
  provider TEXT,
  connection_id TEXT,
  action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok',
  ip_hash TEXT,
  user_agent_hash TEXT,
  metadata_json TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_integration_audit_tenant_created ON integration_audit_log(tenant_id, created_at);

CREATE TABLE IF NOT EXISTS oauth_state_nonces (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  user_id TEXT,
  provider TEXT NOT NULL,
  state_hash TEXT NOT NULL,
  code_verifier_encrypted TEXT,
  redirect_after TEXT,
  metadata_json TEXT DEFAULT '{}',
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_oauth_state_hash_expires ON oauth_state_nonces(state_hash, expires_at);

CREATE INDEX IF NOT EXISTS idx_auth_users_email ON auth_users(email);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_expires ON auth_sessions(user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_user_oauth_tokens_user_provider ON user_oauth_tokens(user_id, provider);
