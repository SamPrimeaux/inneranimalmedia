-- 647: Connor MCP — fuel collab scope only (not full OAuth catalog / superadmin lane).
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/647_connor_mcp_fuel_scope.sql

PRAGMA foreign_keys = OFF;

-- Re-enable personal allowlist gate (645 disabled it for OAuth onboarding).
UPDATE agentsam_user_policy
SET require_allowlist_for_mcp = 1, updated_at = unixepoch()
WHERE user_id = 'au_5d17673408aaebc7';

-- Replace broad personal allowlist with fuel + connor workspace tools only.
DELETE FROM agentsam_mcp_allowlist
WHERE user_id = 'au_5d17673408aaebc7';

INSERT OR IGNORE INTO agentsam_mcp_allowlist
  (id, user_id, workspace_id, tool_key, tenant_id, is_allowed, notes, created_at)
VALUES
  ('amal_connor_fuel_d1q', 'au_5d17673408aaebc7', 'ws_fuelnfreetime', 'agentsam_d1_query', 'tenant_connor_mcneely', 1, 'Fuel D1 read', datetime('now')),
  ('amal_connor_fuel_d1w', 'au_5d17673408aaebc7', 'ws_fuelnfreetime', 'agentsam_d1_write', 'tenant_connor_mcneely', 1, 'Fuel D1 write', datetime('now')),
  ('amal_connor_fuel_ghr', 'au_5d17673408aaebc7', 'ws_fuelnfreetime', 'agentsam_github_read', 'tenant_connor_mcneely', 1, 'Fuel repo read', datetime('now')),
  ('amal_connor_fuel_ghl', 'au_5d17673408aaebc7', 'ws_fuelnfreetime', 'agentsam_github_repo_list', 'tenant_connor_mcneely', 1, 'Fuel repo list', datetime('now')),
  ('amal_connor_fuel_ghw', 'au_5d17673408aaebc7', 'ws_fuelnfreetime', 'agentsam_github_write', 'tenant_connor_mcneely', 1, 'Fuel repo write', datetime('now')),
  ('amal_connor_fuel_ghp', 'au_5d17673408aaebc7', 'ws_fuelnfreetime', 'agentsam_github_pr', 'tenant_connor_mcneely', 1, 'Fuel PRs', datetime('now')),
  ('amal_connor_fuel_r2l', 'au_5d17673408aaebc7', 'ws_fuelnfreetime', 'agentsam_r2_list', 'tenant_connor_mcneely', 1, 'Fuel R2 list', datetime('now')),
  ('amal_connor_fuel_r2g', 'au_5d17673408aaebc7', 'ws_fuelnfreetime', 'agentsam_r2_get', 'tenant_connor_mcneely', 1, 'Fuel R2 get', datetime('now')),
  ('amal_connor_fuel_r2p', 'au_5d17673408aaebc7', 'ws_fuelnfreetime', 'agentsam_r2_put', 'tenant_connor_mcneely', 1, 'Fuel R2 put', datetime('now')),
  ('amal_connor_fuel_ctx', 'au_5d17673408aaebc7', 'ws_fuelnfreetime', 'agentsam_workspace_context', 'tenant_connor_mcneely', 1, 'Workspace context', datetime('now')),
  ('amal_connor_fuel_hc', 'au_5d17673408aaebc7', 'ws_fuelnfreetime', 'agentsam_health_check', 'tenant_connor_mcneely', 1, 'Health check', datetime('now')),
  ('amal_connor_self_d1q', 'au_5d17673408aaebc7', 'ws_connor_mcneely', 'agentsam_d1_query', 'tenant_connor_mcneely', 1, 'Connor workspace D1', datetime('now')),
  ('amal_connor_self_r2l', 'au_5d17673408aaebc7', 'ws_connor_mcneely', 'agentsam_r2_list', 'tenant_connor_mcneely', 1, 'Connor R2', datetime('now')),
  ('amal_connor_self_ghr', 'au_5d17673408aaebc7', 'ws_connor_mcneely', 'agentsam_github_read', 'tenant_connor_mcneely', 1, 'Connor GitHub read', datetime('now')),
  ('amal_connor_self_ghl', 'au_5d17673408aaebc7', 'ws_connor_mcneely', 'agentsam_github_repo_list', 'tenant_connor_mcneely', 1, 'Connor repo list', datetime('now'));

-- Shrink active OAuth token tool snapshot (Connor must re-auth to pick up if empty).
UPDATE mcp_workspace_tokens
SET allowed_tools = '["agentsam_health_check","agentsam_workspace_context","agentsam_d1_query","agentsam_d1_write","agentsam_github_read","agentsam_github_repo_list","agentsam_github_write","agentsam_github_pr","agentsam_r2_list","agentsam_r2_get","agentsam_r2_put"]'
WHERE user_id = 'au_5d17673408aaebc7'
  AND COALESCE(token_type, 'oauth') = 'oauth'
  AND COALESCE(is_active, 1) = 1;

PRAGMA foreign_keys = ON;
