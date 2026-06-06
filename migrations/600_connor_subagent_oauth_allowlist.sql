-- 600: Enable subagent list/get on OAuth connector; subagent profiles live on platform D1.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/600_connor_subagent_oauth_allowlist.sql

UPDATE agentsam_mcp_oauth_tool_allowlist
SET is_active = 1, updated_at = unixepoch()
WHERE client_id = 'iam_mcp_inneranimalmedia'
  AND tool_key IN ('agentsam_list_agents', 'agentsam_get_agent');

UPDATE agentsam_tools
SET description = COALESCE(description, '') || ' Prefer over raw D1 for subagent rows (table agentsam_subagent_profile singular).',
    updated_at = unixepoch()
WHERE tool_key = 'agentsam_create_subagent'
  AND COALESCE(description, '') NOT LIKE '%agentsam_subagent_profile%';
