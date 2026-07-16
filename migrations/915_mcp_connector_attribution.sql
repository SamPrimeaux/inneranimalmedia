-- Persist the connector and consent authorization that minted each MCP OAuth token.
-- Database: inneranimalmedia-business (D1)
-- Apply through the repository migration runner; ALTER failures are handled per statement.

ALTER TABLE mcp_workspace_tokens ADD COLUMN client_id TEXT;
ALTER TABLE mcp_workspace_tokens ADD COLUMN external_client_key TEXT;
ALTER TABLE mcp_workspace_tokens ADD COLUMN authorization_id TEXT;

CREATE INDEX IF NOT EXISTS idx_mcp_workspace_tokens_client_active
  ON mcp_workspace_tokens (client_id, is_active, revoked_at);

CREATE INDEX IF NOT EXISTS idx_mcp_workspace_tokens_external_client
  ON mcp_workspace_tokens (external_client_key, is_active, revoked_at);

CREATE INDEX IF NOT EXISTS idx_mcp_workspace_tokens_authorization
  ON mcp_workspace_tokens (authorization_id);
