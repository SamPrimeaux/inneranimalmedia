-- IAM OAuth provider: consent lifecycle (oauth_authorizations)
-- D1-verified: oauth_clients + oauth_authorization_codes exist; oauth_authorizations missing.
-- Canonical MCP client_id in prod: iam_mcp_inneranimalmedia (oauth_clients row oac_iam_mcp_server).

CREATE TABLE IF NOT EXISTS oauth_authorizations (
  id TEXT PRIMARY KEY DEFAULT ('oaa_' || lower(hex(randomblob(8)))),
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  workspace_id TEXT,
  redirect_uri TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  code_challenge_method TEXT NOT NULL DEFAULT 'S256'
    CHECK (code_challenge_method IN ('S256', 'plain')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'denied', 'expired')),
  expires_at INTEGER NOT NULL,
  approved_at INTEGER,
  denied_at INTEGER,
  authorization_code_hash TEXT,
  metadata_json TEXT DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_oauth_authorizations_client_status
  ON oauth_authorizations (client_id, status);

CREATE INDEX IF NOT EXISTS idx_oauth_authorizations_user_status
  ON oauth_authorizations (user_id, status);

CREATE INDEX IF NOT EXISTS idx_oauth_authorizations_expires
  ON oauth_authorizations (expires_at);

-- Retire orphan codes from pre-registry experiment (inneranimal_builtin_oauth not in oauth_clients).
UPDATE oauth_authorization_codes
SET used = 1
WHERE client_id = 'inneranimal_builtin_oauth'
  AND COALESCE(used, 0) = 0;
