-- Action-aware MCP execution audit columns + global dispatch tool template.
-- Apply with: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/313_mcp_execution_action_context.sql
-- If a column already exists, use scripts/patch_mcp_execution_action_columns_safe.sh instead.

ALTER TABLE agentsam_mcp_tool_execution ADD COLUMN tool_key TEXT;
ALTER TABLE agentsam_mcp_tool_execution ADD COLUMN action_type TEXT;
ALTER TABLE agentsam_mcp_tool_execution ADD COLUMN resource_type TEXT;
ALTER TABLE agentsam_mcp_tool_execution ADD COLUMN resource_id TEXT;
ALTER TABLE agentsam_mcp_tool_execution ADD COLUMN actor_type TEXT DEFAULT 'user';
ALTER TABLE agentsam_mcp_tool_execution ADD COLUMN actor_source TEXT;
ALTER TABLE agentsam_mcp_tool_execution ADD COLUMN policy_decision_json TEXT DEFAULT '{}';
ALTER TABLE agentsam_mcp_tool_execution ADD COLUMN denial_code TEXT;
ALTER TABLE agentsam_mcp_tool_execution ADD COLUMN error_code TEXT;
ALTER TABLE agentsam_mcp_tool_execution ADD COLUMN error_family TEXT;
ALTER TABLE agentsam_mcp_tool_execution ADD COLUMN error_detail_json TEXT DEFAULT '{}';
ALTER TABLE agentsam_mcp_tool_execution ADD COLUMN error_log_id TEXT;

-- Unscoped template row: matched by selectAgentsamMcpToolRow global OR branch.
INSERT OR IGNORE INTO agentsam_mcp_tools (
  id,
  user_id,
  tool_key,
  tool_name,
  display_name,
  description,
  enabled,
  is_active,
  is_degraded,
  risk_level,
  requires_approval,
  timeout_seconds,
  tenant_id,
  workspace_id,
  workspace_scope,
  created_at
) VALUES (
  'amt_mcp_dispatch_builtin',
  '',
  'mcp_dispatch',
  'mcp_dispatch',
  'MCP Dispatch',
  'Route MCP dashboard dispatch prompts to panel agents',
  1,
  1,
  0,
  'low',
  0,
  120,
  NULL,
  NULL,
  '[]',
  datetime('now')
);
