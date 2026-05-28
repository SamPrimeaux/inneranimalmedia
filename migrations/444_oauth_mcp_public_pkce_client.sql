-- 444: iam_mcp_inneranimalmedia must be a public PKCE client for Claude/ChatGPT/Cursor connectors.
-- Symptom: POST /api/oauth/token → 401 invalid_client when connector sends no client_secret.
--
-- Apply:
--   cd /Users/samprimeaux/inneranimalmedia
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/444_oauth_mcp_public_pkce_client.sql

UPDATE oauth_clients
SET token_endpoint_auth_method = 'none',
    client_type = 'public',
    requires_pkce = 1,
    updated_at = unixepoch()
WHERE client_id = 'iam_mcp_inneranimalmedia';
