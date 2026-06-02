-- 500: Deactivate MCP tool_key remaps in agentsam_capability_aliases (catalog SSOT is agentsam_tools.tool_key).
-- Safe to re-run. Does not touch abstract_capability routing rows (code.search, file.read, …).
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/500_deprecate_mcp_tool_key_capability_aliases.sql

UPDATE agentsam_capability_aliases
SET is_active = 0,
    updated_at = unixepoch(),
    rationale = COALESCE(rationale, '') || ' [500 deprecated: MCP uses agentsam_tools.tool_key SSOT]'
WHERE match_kind = 'tool_key'
  AND COALESCE(is_active, 1) = 1
  AND lower(trim(abstract_capability)) IN (
    SELECT lower(trim(tool_key))
      FROM agentsam_tools
     WHERE COALESCE(is_active, 1) = 1
  );
