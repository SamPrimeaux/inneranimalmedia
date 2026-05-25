-- 411: Bind MCP OAuth tokens to RFC 8707 resource / audience (https://mcp.inneranimalmedia.com/mcp)
-- Idempotent: ALTER may no-op on re-run if column exists.

ALTER TABLE mcp_workspace_tokens ADD COLUMN audience TEXT;

UPDATE mcp_workspace_tokens
SET audience = 'https://mcp.inneranimalmedia.com/mcp'
WHERE token_type = 'oauth'
  AND (audience IS NULL OR trim(audience) = '');
