-- browser.capture_context: registry row so workflow executor uses DB-driven multi-tool capture
-- (not the legacy MCP_HANDLER_TOOL_ALIASES → cdt_take_snapshot-only shortcut).

INSERT OR IGNORE INTO agentsam_workflow_handlers (
  handler_key,
  node_type,
  executor_kind,
  title,
  description,
  handler_config_json,
  input_schema_json,
  quality_gate_json,
  risk_level,
  requires_approval,
  is_active,
  tenant_id,
  workspace_id,
  created_at,
  updated_at
) VALUES (
  'browser.capture_context',
  'agent',
  'builtin_tool',
  'Capture Browser Context',
  'Navigate, content, console, network, optional snapshot/screenshot; merges browserContext.selected_element from dashboard.',
  '{"tools":["browser_navigate","browser_content","cdt_list_console_messages","cdt_list_network_requests","cdt_take_snapshot","playwright_screenshot"],"source":"src/core/browser-capture-context.js"}',
  '{"browserContext":"object","url":"string","selected_element":"object"}',
  '{}',
  'low',
  0,
  1,
  NULL,
  NULL,
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
);

UPDATE agentsam_workflow_handlers
SET
  executor_kind = 'builtin_tool',
  handler_config_json = '{"tools":["browser_navigate","browser_content","cdt_list_console_messages","cdt_list_network_requests","cdt_take_snapshot","playwright_screenshot"],"source":"src/core/browser-capture-context.js"}',
  description = 'Navigate, content, console, network, optional snapshot/screenshot; merges browserContext.selected_element from dashboard.',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE handler_key = 'browser.capture_context';
