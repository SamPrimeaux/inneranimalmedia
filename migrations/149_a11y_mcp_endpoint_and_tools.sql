-- 149: Register hosted a11y MCP endpoint + tools + MCP command routing
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/149_a11y_mcp_endpoint_and_tools.sql
-- Purpose: Add first-party hosted endpoint wiring for a11y MCP workflows.

INSERT OR IGNORE INTO mcp_services (
  id,
  service_name,
  service_type,
  endpoint_url,
  d1_databases,
  authentication_type,
  token_secret_name,
  requires_oauth,
  is_active,
  health_status,
  metadata,
  created_at,
  updated_at
) VALUES (
  'mcp_a11y_server',
  'A11y MCP Server',
  'mcp-server',
  'https://inneranimalmedia.com/api/mcp/a11y',
  '["cf87b717-d4e2-4cf8-bab0-a81268e32d49"]',
  'token',
  'MCP_AUTH_TOKEN',
  0,
  1,
  'unverified',
  '{"purpose":"accessibility-audits","engine":"axe-core","hosted_proxy_endpoint":"https://inneranimalmedia.com/api/mcp/a11y","upstream_mcp_url":"https://mcp.inneranimalmedia.com/mcp","tools":["a11y_audit_webpage","a11y_get_summary"]}',
  unixepoch(),
  unixepoch()
);

INSERT OR IGNORE INTO mcp_registered_tools (
  id,
  tool_name,
  tool_category,
  mcp_service_url,
  description,
  input_schema,
  requires_approval,
  enabled,
  cost_per_call_usd,
  created_at,
  updated_at
) VALUES
(
  'a11y_audit_webpage',
  'a11y_audit_webpage',
  'quality',
  'https://inneranimalmedia.com/api/mcp/a11y',
  'Run detailed accessibility audit using axe-core via hosted MCP endpoint',
  '{"type":"object","properties":{"url":{"type":"string"},"includeHtml":{"type":"boolean"},"tags":{"type":"array","items":{"type":"string"}}},"required":["url"],"additionalProperties":false}',
  0,
  1,
  0.000000,
  datetime('now'),
  datetime('now')
),
(
  'a11y_get_summary',
  'a11y_get_summary',
  'quality',
  'https://inneranimalmedia.com/api/mcp/a11y',
  'Get accessibility summary for a webpage via hosted MCP endpoint',
  '{"type":"object","properties":{"url":{"type":"string"}},"required":["url"],"additionalProperties":false}',
  0,
  1,
  0.000000,
  datetime('now'),
  datetime('now')
);

INSERT OR IGNORE INTO mcp_command_suggestions (
  label,
  description,
  example_prompt,
  intent_slug,
  routed_to_agent,
  icon,
  sort_order,
  usage_count,
  is_pinned
) VALUES
(
  'Audit accessibility',
  'Run full a11y scan with axe-core',
  'audit https://inneranimalmedia.com/dashboard/mcp for accessibility issues',
  'intent_accessibility_audit',
  'mcp_agent_tester',
  'terminal',
  35,
  0,
  1
),
(
  'A11y summary',
  'Get accessibility summary for a page',
  'give me an accessibility summary for https://inneranimalmedia.com/dashboard/mcp',
  'intent_accessibility_audit',
  'mcp_agent_tester',
  'terminal',
  36,
  0,
  0
),
(
  'WCAG AA check',
  'Check WCAG 2.x AA issues',
  'check wcag2aa issues for https://inneranimalmedia.com/dashboard/mcp',
  'intent_accessibility_audit',
  'mcp_agent_tester',
  'terminal',
  37,
  0,
  0
);

INSERT OR IGNORE INTO agent_intent_patterns (
  intent_slug,
  display_name,
  description,
  triggers_json,
  workflow_agent,
  is_active,
  sort_order,
  created_at,
  updated_at
) VALUES (
  'intent_accessibility_audit',
  'Accessibility Audit',
  'Run accessibility and WCAG audits',
  '["a11y","accessibility","wcag","axe","contrast","aria","screen reader","keyboard nav"]',
  'mcp_agent_tester',
  1,
  38,
  datetime('now'),
  datetime('now')
);
