-- 498: OAuth MCP discovery SSOT — agentsam_tools.oauth_visible; drop agentsam_mcp_tools mirror.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/498_agentsam_tools_oauth_visible_ssot.sql

-- ── 1. oauth_visible on canonical catalog (ignore duplicate column on re-run) ─
ALTER TABLE agentsam_tools ADD COLUMN oauth_visible INTEGER NOT NULL DEFAULT 0;

-- ── 2. Migrate visibility from deprecating mirror ───────────────────────────────
UPDATE agentsam_tools
SET oauth_visible = 1,
    updated_at = unixepoch()
WHERE tool_key IN (
  SELECT tool_key
    FROM agentsam_mcp_tools
   WHERE COALESCE(oauth_visible, 0) = 1
     AND COALESCE(is_active, 1) = 1
);

-- ── 3. Drop legacy mirror table and dependent views (no compat shim) ───────────
DROP VIEW IF EXISTS v_agentsam_mcp_tools_branded;
DROP VIEW IF EXISTS v_mcp_tools;
DROP VIEW IF EXISTS v_mcp_tool_drift;
DROP TABLE IF EXISTS agentsam_mcp_tools_legacy;
DROP TABLE IF EXISTS agentsam_mcp_tools;
