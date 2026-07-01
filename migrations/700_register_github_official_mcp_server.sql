-- 700: Register GitHub's official remote MCP server for Agent Sam.
--
-- Server: https://api.githubcopilot.com/mcp/ (GitHub-hosted, no container).
-- Auth: user_oauth_github — resolved per-call from user_oauth_tokens (provider='github')
-- by the executeMcpCatalogRow() patch in src/core/catalog-tool-executor.js.
-- Requires that patch to be applied BEFORE this migration is used in production,
-- otherwise auth_type='user_oauth_github' falls through to the bridge-key path
-- and every call will 401.
--
-- Tool rows are NOT included here — they're generated from the server's live
-- tools/list response by scripts/generate-github-mcp-tools-migration.js, since
-- hand-transcribing ~75 input schemas risks drift from the real contract.
-- Run that script to produce migrations/701_register_github_official_mcp_tools.sql.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/700_register_github_official_mcp_server.sql

INSERT OR IGNORE INTO agentsam_mcp_servers (
  server_key, display_name, url, auth_type, is_active, workspace_id, tenant_id, updated_at
) VALUES (
  'github-official',
  'GitHub (official)',
  'https://api.githubcopilot.com/mcp/',
  'user_oauth_github',
  1,
  NULL,
  NULL,
  unixepoch()
);

-- If the row already existed from an earlier partial attempt, make sure the
-- auth_type and URL are correct.
UPDATE agentsam_mcp_servers
SET url = 'https://api.githubcopilot.com/mcp/',
    auth_type = 'user_oauth_github',
    is_active = 1,
    display_name = 'GitHub (official)',
    updated_at = unixepoch()
WHERE server_key = 'github-official';
