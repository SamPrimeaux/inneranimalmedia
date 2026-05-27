-- 424: agentsam_search_tools — fix workspace_scope wildcard + search display_name.
-- Pair with MCP executor fix: repeated :query / :workspace_id binds (mcp-d1-sql-executor.js).
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/424_fix_agentsam_search_tools_bindings.sql

UPDATE agentsam_tools
SET handler_config = json_object(
  'sql',
  'SELECT tool_key, display_name, tool_category, handler_type, description, risk_level ' ||
  'FROM agentsam_tools ' ||
  'WHERE ( ' ||
  '  lower(tool_key) LIKE lower(''%''||:query||''%'') ' ||
  '  OR lower(description) LIKE lower(''%''||:query||''%'') ' ||
  '  OR lower(display_name) LIKE lower(''%''||:query||''%'') ' ||
  ') ' ||
  'AND is_active = 1 ' ||
  'AND ( ' ||
  '  is_global = 1 ' ||
  '  OR workspace_scope LIKE ''%"*"%'' ' ||
  '  OR workspace_scope LIKE ''%'' || :workspace_id || ''%'' ' ||
  ') ' ||
  'AND (:tenant_id = :tenant_id OR :workspace_id = :workspace_id) ' ||
  'LIMIT 30',
  'bind_workspace',
  1
),
updated_at = unixepoch()
WHERE tool_key = 'agentsam_search_tools';
