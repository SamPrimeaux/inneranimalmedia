-- M3: activate agentsam_cms_* tools via agent handler + builtin cms module
UPDATE agentsam_tools
SET
  handler_type = 'agent',
  handler_config = json_object(
    'handler', COALESCE(NULLIF(trim(handler_key), ''), tool_key),
    'module', 'tools/builtin/cms.js'
  ),
  is_active = 1,
  oauth_visible = 1,
  updated_at = unixepoch()
WHERE tool_key IN ('agentsam_cms_read', 'agentsam_cms_write', 'agentsam_cms_publish');
