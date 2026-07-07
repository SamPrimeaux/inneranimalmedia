-- 788: Register Google's official remote Gmail MCP server for Agent Sam.
--
-- Server: https://gmailmcp.googleapis.com/mcp/v1 (Google Workspace MCP)
-- Auth: user_oauth_gmail — resolved per-call from user_oauth_tokens (provider=google_gmail)
-- by executeMcpCatalogRow() in src/core/catalog-tool-executor.js.
--
-- NOT platform GMAIL_DELEGATED_USER / service-account JWT — each user connects
-- their own Gmail via /api/integrations/gmail/connect.
--
-- Tool rows: migrations/789_agentsam_gmail_official_mcp_surface.sql (generated).
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/788_register_gmail_official_mcp_server.sql

INSERT OR IGNORE INTO agentsam_mcp_servers (
  server_key, display_name, url, auth_type, is_active, workspace_id, tenant_id, updated_at
) VALUES (
  'gmail-official',
  'Gmail (official Google MCP)',
  'https://gmailmcp.googleapis.com/mcp/v1',
  'user_oauth_gmail',
  1,
  NULL,
  NULL,
  unixepoch()
);

UPDATE agentsam_mcp_servers
SET url = 'https://gmailmcp.googleapis.com/mcp/v1',
    auth_type = 'user_oauth_gmail',
    is_active = 1,
    display_name = 'Gmail (official Google MCP)',
    updated_at = unixepoch()
WHERE server_key = 'gmail-official';
