-- 436: Expose approval-gated D1 write to external MCP OAuth connectors.
-- agentsam_db_write was disabled in 416; d1_write allowlist row exists but connectors
-- expect agentsam_db_* naming alongside agentsam_db_query.

INSERT OR IGNORE INTO agentsam_mcp_oauth_tool_allowlist (client_id, tool_key, access_class, sort_order, notes) VALUES
  ('iam_mcp_inneranimalmedia', 'agentsam_db_write', 'write', 16,
   'Approval-gated INSERT/UPDATE/DELETE — pass approval_id from IAM'),
  ('iam_mcp_inneranimalmedia', 'd1_write', 'write', 17,
   'Canonical d1_write (approval-gated)');

UPDATE agentsam_mcp_oauth_tool_allowlist
SET is_active = 1,
    access_class = 'write',
    sort_order = 16,
    notes = 'Approval-gated INSERT/UPDATE/DELETE — pass approval_id from IAM',
    updated_at = unixepoch()
WHERE client_id = 'iam_mcp_inneranimalmedia'
  AND tool_key = 'agentsam_db_write';

UPDATE agentsam_mcp_oauth_tool_allowlist
SET is_active = 1,
    access_class = 'write',
    sort_order = 17,
    updated_at = unixepoch()
WHERE client_id = 'iam_mcp_inneranimalmedia'
  AND tool_key = 'd1_write';

UPDATE agentsam_tools
SET handler_type = 'd1',
    handler_config = '{"binding":"DB","operation":"execute","database_id":"cf87b717-d4e2-4cf8-bab0-a81268e32d49","auth_source":"platform"}',
    tool_category = 'platform',
    risk_level = 'medium',
    requires_approval = 1,
    is_active = 1,
    is_global = 1,
    workspace_scope = '["*"]',
    input_schema = '{"type":"object","properties":{"sql":{"type":"string","description":"INSERT, UPDATE, DELETE, or DDL SQL (must scope tenant_id/workspace_id)"},"params":{"type":"array","description":"Parameterized query values"},"approval_id":{"type":"string","description":"IAM agentsam_approval_queue id (required)"},"batch":{"type":"array","items":{"type":"object","properties":{"sql":{"type":"string"},"params":{"type":"array"}}}}},"required":["sql","approval_id"]}',
    description = 'Approval-gated D1 write for OAuth MCP. SQL must include workspace_id or tenant_id binding.'
WHERE tool_key = 'agentsam_db_write';

UPDATE agentsam_tools
SET requires_approval = 1,
    input_schema = COALESCE(
      NULLIF(trim(input_schema), ''),
      '{"type":"object","properties":{"sql":{"type":"string"},"params":{"type":"array"},"approval_id":{"type":"string","description":"IAM approval id"}},"required":["sql","approval_id"]}'
    )
WHERE tool_key = 'd1_write';

INSERT OR IGNORE INTO agentsam_capability_aliases (
  id, abstract_capability, match_kind, match_value, capability_lane, priority, requires_approval, rationale, is_active, created_at, updated_at
) VALUES (
  'cap_alias_agentsam_db_write_436',
  'database.d1.write',
  'tool_key',
  'agentsam_db_write',
  'develop',
  10,
  1,
  '436: OAuth-facing approval-gated D1 write',
  1,
  unixepoch(),
  unixepoch()
);

INSERT OR IGNORE INTO agentsam_capability_aliases (
  id, abstract_capability, match_kind, match_value, capability_lane, priority, requires_approval, rationale, is_active, created_at, updated_at
) VALUES (
  'cap_alias_d1_write_436',
  'database.d1.write',
  'tool_key',
  'd1_write',
  'develop',
  5,
  1,
  '436: canonical D1 write',
  1,
  unixepoch(),
  unixepoch()
);

UPDATE mcp_workspace_tokens
SET allowed_tools = (
  SELECT COALESCE(json_group_array(tool_key), '[]')
  FROM (
    SELECT tool_key
    FROM agentsam_mcp_oauth_tool_allowlist
    WHERE client_id = 'iam_mcp_inneranimalmedia'
      AND COALESCE(is_active, 1) = 1
    ORDER BY sort_order ASC, tool_key ASC
  )
)
WHERE token_type = 'oauth'
  AND COALESCE(is_active, 1) = 1;
