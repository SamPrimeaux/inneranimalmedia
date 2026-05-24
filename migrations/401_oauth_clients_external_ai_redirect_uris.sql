-- Allow IAM MCP OAuth redirects for Cursor, Claude.ai, ChatGPT, and MCP worker callback.
-- Idempotent: replaces redirect_uris JSON for canonical client only.

UPDATE oauth_clients
SET
  redirect_uris = '["https://mcp.inneranimalmedia.com/auth/callback","https://claude.ai/api/mcp/auth_callback","https://claude.com/api/mcp/auth_callback","https://chatgpt.com/connector_platform_oauth_redirect","https://chat.openai.com/connector_platform_oauth_redirect"]',
  updated_at = unixepoch()
WHERE client_id = 'iam_mcp_inneranimalmedia';

-- After Cloudflare AI controls "Authenticate server", if redirect fails, capture redirect_uri
-- from the browser network tab and append:
-- UPDATE oauth_clients SET redirect_uris = <merged json array>, updated_at = unixepoch()
-- WHERE client_id = 'iam_mcp_inneranimalmedia';
