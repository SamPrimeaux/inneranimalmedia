-- 946: Route agentsam_cf_kv_list through Worker Management API (not Bindings MCP proxy).
UPDATE agentsam_tools
SET
  handler_type = 'cf',
  handler_config = '{"operation":"kv.manage","resource":"kv","auth_source":"platform","credential_lane":"superadmin_management_api"}',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_cf_kv_list';
