-- Allow token_type='oauth' for IAM MCP OAuth provider tokens (D1 CHECK expansion).

PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS mcp_workspace_tokens_oauth_migration (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  label TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  allowed_tools TEXT,
  repo_path TEXT,
  github_repo TEXT,
  rate_limit_per_hour INTEGER DEFAULT 100,
  is_active INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (unixepoch()),
  expires_at INTEGER,
  last_used_at INTEGER,
  rotated_from TEXT,
  user_id TEXT,
  token_type TEXT DEFAULT 'personal'
    CHECK (token_type IN ('personal', 'service', 'agent', 'integration', 'oauth')),
  created_by TEXT,
  scopes_json TEXT,
  allowed_capability_keys_json TEXT,
  allowed_lanes_json TEXT,
  allowed_risk_levels_json TEXT,
  allowed_domains_json TEXT,
  revoked_at INTEGER,
  revoked_by TEXT,
  last_ip_hash TEXT,
  last_user_agent_hash TEXT
);

INSERT OR IGNORE INTO mcp_workspace_tokens_oauth_migration
SELECT * FROM mcp_workspace_tokens;

DROP TABLE mcp_workspace_tokens;

ALTER TABLE mcp_workspace_tokens_oauth_migration RENAME TO mcp_workspace_tokens;

PRAGMA foreign_keys = ON;
