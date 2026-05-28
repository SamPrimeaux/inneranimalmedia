-- 442: Expose D1 + R2 agentsam_* tools on external OAuth connector (ChatGPT/Claude/Cursor).
-- R2 rows exist from 427; this adds connector visibility + upload alias + MCP input schemas.

INSERT OR IGNORE INTO agentsam_tools
  (tool_key, tool_name, display_name, tool_category, handler_type, handler_config, is_active, is_global,
   risk_level, requires_approval, input_schema)
VALUES
  ('agentsam_r2_upload',
   'agentsam_r2_upload', 'R2 Upload', 'storage', 'r2',
   '{"binding":"ASSETS","auth_source":"platform","operation":"write"}',
   1, 1, 'medium', 1,
   '{"type":"object","properties":{"bucket":{"type":"string"},"key":{"type":"string"},"content":{"type":"string"},"content_type":{"type":"string","default":"text/plain"},"approval_id":{"type":"string"}},"required":["bucket","key","content","approval_id"],"additionalProperties":false}');

INSERT OR IGNORE INTO agentsam_mcp_oauth_tool_allowlist (client_id, tool_key, access_class, sort_order, is_active, notes)
VALUES
  ('iam_mcp_inneranimalmedia', 'agentsam_r2_read', 'read', 95, 1, 'External MCP R2 read/list'),
  ('iam_mcp_inneranimalmedia', 'agentsam_r2_list', 'read', 96, 1, 'External MCP R2 prefix list'),
  ('iam_mcp_inneranimalmedia', 'agentsam_r2_upload', 'write', 97, 1, 'External MCP R2 upload (approval-gated)'),
  ('iam_mcp_inneranimalmedia', 'agentsam_r2_write', 'write', 98, 1, 'External MCP R2 write');

UPDATE agentsam_mcp_oauth_tool_allowlist
SET is_active = 1,
    access_class = 'read',
    expose_on_connector = 1,
    runtime_contract_key = COALESCE(NULLIF(trim(runtime_contract_key), ''), tool_key),
    connector_priority = 95,
    updated_at = unixepoch()
WHERE client_id = 'iam_mcp_inneranimalmedia'
  AND tool_key = 'agentsam_r2_read';

UPDATE agentsam_mcp_oauth_tool_allowlist
SET is_active = 1,
    access_class = 'read',
    expose_on_connector = 1,
    runtime_contract_key = COALESCE(NULLIF(trim(runtime_contract_key), ''), tool_key),
    connector_priority = 96,
    updated_at = unixepoch()
WHERE client_id = 'iam_mcp_inneranimalmedia'
  AND tool_key = 'agentsam_r2_list';

UPDATE agentsam_mcp_oauth_tool_allowlist
SET is_active = 1,
    access_class = 'write',
    expose_on_connector = 1,
    runtime_contract_key = COALESCE(NULLIF(trim(runtime_contract_key), ''), tool_key),
    connector_priority = 97,
    updated_at = unixepoch()
WHERE client_id = 'iam_mcp_inneranimalmedia'
  AND tool_key = 'agentsam_r2_upload';

UPDATE agentsam_mcp_oauth_tool_allowlist
SET is_active = 1,
    access_class = 'write',
    expose_on_connector = 0,
    runtime_contract_key = COALESCE(NULLIF(trim(runtime_contract_key), ''), tool_key),
    connector_priority = 98,
    updated_at = unixepoch()
WHERE client_id = 'iam_mcp_inneranimalmedia'
  AND tool_key = 'agentsam_r2_write';

UPDATE agentsam_tools
SET input_schema = '{"type":"object","properties":{"bucket":{"type":"string","description":"R2 bucket name"},"key":{"type":"string","description":"Object key (omit for list)"},"prefix":{"type":"string","description":"List prefix"},"limit":{"type":"integer","default":100,"maximum":500},"mode":{"type":"string","enum":["list","read"],"default":"list"}},"required":["bucket"],"additionalProperties":false}',
    updated_at = unixepoch()
WHERE tool_key = 'agentsam_r2_read';

UPDATE agentsam_tools
SET handler_config = json_patch(
      COALESCE(NULLIF(trim(handler_config), ''), '{}'),
      '{"endpoint":"https://inneranimalmedia.com/api/internal/agentsam-vectorize/describe"}'
    ),
    updated_at = unixepoch()
WHERE tool_key = 'agentsam_vectorize_describe'
  AND handler_type = 'http';

UPDATE agentsam_tools
SET input_schema = '{"type":"object","properties":{"namespace":{"type":"string","description":"Optional legacy label (ignored)"},"tier":{"type":"string","enum":["all","custom","supabase"],"default":"all"}},"additionalProperties":false}',
    updated_at = unixepoch()
WHERE tool_key = 'agentsam_vectorize_describe';
