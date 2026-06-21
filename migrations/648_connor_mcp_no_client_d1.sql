-- 648: Connor MCP — no client D1 via MCP; terminal sandbox + GitHub/R2 only.
-- Reverts agentsam_d1_query / agentsam_d1_write from Connor OAuth lane (647).
-- Fuel D1 work: agentsam_terminal_sandbox with zone_slug=fuelnfreetime + wrangler d1 execute.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/648_connor_mcp_no_client_d1.sql

PRAGMA foreign_keys = OFF;

DELETE FROM agentsam_mcp_allowlist
WHERE user_id = 'au_5d17673408aaebc7'
  AND tool_key IN ('agentsam_d1_query', 'agentsam_d1_write');

INSERT OR IGNORE INTO agentsam_mcp_allowlist
  (id, user_id, workspace_id, tool_key, tenant_id, is_allowed, notes, created_at)
VALUES
  (
    'amal_connor_fuel_term',
    'au_5d17673408aaebc7',
    'ws_fuelnfreetime',
    'agentsam_terminal_sandbox',
    'tenant_connor_mcneely',
    1,
    'Fuel D1/schema via wrangler in .mcp-zones/fuelnfreetime',
    datetime('now')
  );

UPDATE mcp_workspace_tokens
SET allowed_tools = '["agentsam_health_check","agentsam_workspace_context","agentsam_github_read","agentsam_github_repo_list","agentsam_github_write","agentsam_github_pr","agentsam_r2_list","agentsam_r2_get","agentsam_r2_put","agentsam_terminal_sandbox"]'
WHERE user_id = 'au_5d17673408aaebc7'
  AND COALESCE(token_type, 'oauth') = 'oauth'
  AND COALESCE(is_active, 1) = 1;

PRAGMA foreign_keys = ON;
