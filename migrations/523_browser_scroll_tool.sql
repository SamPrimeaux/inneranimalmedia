-- 523: browser_scroll — prove scroll actions in Agent Live Browser lane
INSERT OR IGNORE INTO agentsam_tools (
  id, tool_name, display_name, tool_category, handler_type,
  description, is_active, tool_key, risk_level, requires_approval
) VALUES (
  'ast_browser_scroll',
  'browser_scroll',
  'Browser scroll',
  'browser',
  'mybrowser',
  'Scroll the live browser page up or down. Reuses the same agent_run_id Browser Run session.',
  1,
  'browser_scroll',
  'low',
  0
);
