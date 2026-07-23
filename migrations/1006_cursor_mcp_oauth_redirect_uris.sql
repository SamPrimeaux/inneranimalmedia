-- 1006: Register Cursor's current MCP OAuth callbacks on iam_mcp_inneranimalmedia.
-- Cursor desktop now uses http://localhost:8787/callback (and still may use
-- cursor://anysphere.cursor-mcp/oauth/callback). Static client only had the older
-- cursor://anysphere.cursor-deeplink/mcp/auth_callback — Approve redirected into a
-- URI Cursor was not listening for → "I clicked Approve and nothing happened."
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml \
--     --file=./migrations/1006_cursor_mcp_oauth_redirect_uris.sql

UPDATE oauth_clients
SET
  redirect_uris = json(
    '[
      "https://mcp.inneranimalmedia.com/auth/callback",
      "https://claude.ai/api/mcp/auth_callback",
      "https://claude.com/api/mcp/auth_callback",
      "https://chatgpt.com/connector_platform_oauth_redirect",
      "https://chat.openai.com/connector_platform_oauth_redirect",
      "https://chatgpt.com/connector/oauth/Fp4-o8x6PZh_",
      "cursor://anysphere.cursor-deeplink/mcp/auth_callback",
      "cursor://anysphere.cursor-mcp/oauth/callback",
      "http://localhost:8787/callback"
    ]'
  ),
  updated_at = unixepoch()
WHERE client_id = 'iam_mcp_inneranimalmedia';
