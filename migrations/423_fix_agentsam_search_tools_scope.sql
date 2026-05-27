-- 423: Fix agentsam_search_tools D1 scoping so MCP tenant/workspace guard passes.
-- Applies to the D1 catalog row inserted in 422_agentsam_external_catalog_tools_16.sql.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/423_fix_agentsam_search_tools_scope.sql

UPDATE agentsam_tools
SET handler_config = json_object(
  'sql',
  'SELECT tool_key, display_name, tool_category, handler_type, description, risk_level ' ||
  'FROM agentsam_tools ' ||
  'WHERE (lower(tool_key) LIKE lower(''%''||:query||''%'') OR lower(description) LIKE lower(''%''||:query||''%'')) ' ||
  '  AND is_active = 1 ' ||
  '  AND (is_global = 1 OR workspace_scope LIKE ''%""*""%'' OR workspace_scope LIKE ''%'' || :workspace_id || ''%'') ' ||
  '  AND (:tenant_id = :tenant_id OR :workspace_id = :workspace_id) ' ||
  'LIMIT 30',
  'bind_workspace',
  1
),
updated_at = unixepoch()
WHERE tool_key = 'agentsam_search_tools';

