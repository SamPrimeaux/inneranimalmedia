-- 435: agentsam_send_email — workspace scope, search discovery, legacy alias.

UPDATE agentsam_tools
SET
  workspace_scope = '["*"]',
  description = 'Send email immediately via Resend (MCP). Resolves recipient from to, notification_email, or account email.',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_send_email';

INSERT OR IGNORE INTO agentsam_capability_aliases (
  id, abstract_capability, match_kind, match_value, priority, rationale, is_active, created_at, updated_at
) VALUES (
  'cap_alias_email_send_v2',
  'agentsam_email_send',
  'tool_key',
  'agentsam_send_email',
  5,
  '435: legacy OAuth snapshot name → agentsam_send_email',
  1,
  unixepoch(),
  unixepoch()
);

UPDATE agentsam_tools
SET handler_config = json_object(
  'sql',
  'SELECT tool_key, display_name, tool_category, handler_type, description, risk_level ' ||
  'FROM agentsam_tools ' ||
  'WHERE (lower(tool_key) LIKE lower(''%''||:query||''%'') OR lower(description) LIKE lower(''%''||:query||''%'')) ' ||
  '  AND is_active = 1 ' ||
  '  AND (COALESCE(is_global, 0) = 1 OR workspace_scope LIKE ''%""*""%'' OR lower(COALESCE(workspace_scope, '''')) = ''global'' OR workspace_scope LIKE ''%'' || :workspace_id || ''%'') ' ||
  '  AND (:tenant_id = :tenant_id OR :workspace_id = :workspace_id) ' ||
  'LIMIT 30',
  'bind_workspace',
  1
),
updated_at = unixepoch()
WHERE tool_key = 'agentsam_search_tools';
