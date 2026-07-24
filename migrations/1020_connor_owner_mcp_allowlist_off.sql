-- 1020: Connor (workspace owner) — do not force platform-curated MCP personal allowlist.
-- Isolation is his BYOK D1/GitHub/CF account. He owns tool surface for ws_connor_mcneely.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/1020_connor_owner_mcp_allowlist_off.sql

UPDATE agentsam_user_policy
SET
  require_allowlist_for_mcp = 0,
  auto_run_mode = CASE
    WHEN COALESCE(TRIM(auto_run_mode), '') IN ('', 'allowlist') THEN 'ask'
    ELSE auto_run_mode
  END,
  updated_at = unixepoch()
WHERE user_id = 'au_5d17673408aaebc7'
  AND workspace_id = 'ws_connor_mcneely';
