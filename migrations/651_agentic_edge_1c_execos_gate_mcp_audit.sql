-- 651: Sprint 1C — gate ExecOS legacy bridge fallback + agentsam_mcp_audit tool.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/651_agentic_edge_1c_execos_gate_mcp_audit.sql

UPDATE agentsam_feature_flag
SET enabled_globally = 0,
    description = 'Allow legacy iam-pty /exec-agentsam-bridgekey fallback when ExecOS service binding fails. Off by default after Sprint 1C binding-only smoke.'
WHERE flag_key = 'execos_bridge_fallback_enabled';

INSERT OR IGNORE INTO agentsam_feature_flag (flag_key, description, enabled_globally)
VALUES (
  'execos_bridge_fallback_enabled',
  'Allow legacy iam-pty /exec-agentsam-bridgekey fallback when ExecOS service binding fails. Off by default after Sprint 1C binding-only smoke.',
  0
);

INSERT OR IGNORE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type,
  description, input_schema, handler_config, capability_key,
  risk_level, requires_approval, requires_confirmation,
  is_active, is_degraded, workspace_scope, sort_priority, is_global,
  oauth_visible, modes_json, updated_at
) VALUES (
  'ast_agentsam_mcp_audit',
  'agentsam_mcp_audit',
  'agentsam_mcp_audit',
  'MCP Audit Log',
  'platform.audit',
  'telemetry',
  'Read-only query of mcp_audit_log — recent MCP tool calls with status, latency, workspace, and actor. Filters: tool_name, status, workspace_id. Default last 24h, limit 20 (max 100).',
  '{"type":"object","properties":{"tool_name":{"type":"string","description":"Optional filter on tool_name"},"status":{"type":"string","description":"Optional filter on status (e.g. success, error)"},"workspace_id":{"type":"string","description":"Optional workspace_id filter (superadmin/bridge only when omitted)"},"limit":{"type":"integer","description":"Max rows (default 20, max 100)"},"since_hours":{"type":"integer","description":"Lookback window in hours (default 24)"}},"additionalProperties":false}',
  '{"operation":"audit.query","dispatch_target":"agentsam_mcp_audit"}',
  'platform.mcp.audit',
  'agentsam_mcp_audit',
  'low',
  0,
  0,
  1,
  0,
  '["*"]',
  12,
  1,
  1,
  '["agent","debug","plan","research"]',
  unixepoch()
);

INSERT OR IGNORE INTO agentsam_mcp_oauth_tool_allowlist (
  client_id, tool_key, access_class, sort_order, notes, is_active, expose_on_connector, connector_priority, updated_at
) VALUES (
  'iam_mcp_inneranimalmedia',
  'agentsam_mcp_audit',
  'read',
  12,
  '651: read-only mcp_audit_log query for operator diagnostics',
  1,
  1,
  12,
  unixepoch()
);

UPDATE mcp_workspace_tokens
SET allowed_tools = (
  SELECT COALESCE(json_group_array(tool_key), '[]')
  FROM (
    SELECT a.tool_key
    FROM agentsam_mcp_oauth_tool_allowlist a
    INNER JOIN agentsam_tools t ON t.tool_key = a.tool_key
    WHERE a.client_id = 'iam_mcp_inneranimalmedia'
      AND COALESCE(a.is_active, 1) = 1
      AND COALESCE(t.is_active, 1) = 1
      AND COALESCE(t.is_degraded, 0) = 0
    ORDER BY a.sort_order ASC, a.tool_key ASC
  )
),
allowed_domains_json = json_set(
  COALESCE(allowed_domains_json, '{}'),
  '$.oauth_tool_access',
  COALESCE(
    (
      SELECT json_group_object(
        a.tool_key,
        CASE WHEN lower(a.access_class) = 'write' THEN 'write' ELSE 'read' END
      )
      FROM agentsam_mcp_oauth_tool_allowlist a
      INNER JOIN agentsam_tools t ON t.tool_key = a.tool_key
      WHERE a.client_id = 'iam_mcp_inneranimalmedia'
        AND COALESCE(a.is_active, 1) = 1
        AND COALESCE(t.is_active, 1) = 1
        AND COALESCE(t.is_degraded, 0) = 0
    ),
    '{}'
  )
)
WHERE lower(COALESCE(token_type, '')) = 'oauth'
  AND COALESCE(is_active, 1) = 1
  AND COALESCE(revoked_at, 0) = 0;
