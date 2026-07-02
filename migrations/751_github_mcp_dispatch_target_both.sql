-- 751: Unlock GitHub official MCP surface tools for Agent Sam in-app dispatch.
--
-- Migration 699 registered 41 agentsam_github_mcp_* rows (handler_type=mcp,
-- oauth_visible=1) but left dispatch_target at default 'internal'. OAuth clients
-- already see them via oauth_visible; setting dispatch_target='both' marks them
-- as dual-surface per migration 502 intent and enables in-app catalog parity.
--
-- Excludes agentsam_spawn_tree (telemetry/orchestration — internal by design).
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=migrations/751_github_mcp_dispatch_target_both.sql

UPDATE agentsam_tools
SET dispatch_target = 'both',
    updated_at = unixepoch()
WHERE handler_type = 'mcp'
  AND COALESCE(oauth_visible, 0) = 1
  AND dispatch_target = 'internal'
  AND tool_category LIKE 'github.%';
