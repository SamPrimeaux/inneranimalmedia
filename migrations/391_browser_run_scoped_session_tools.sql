-- 391: Register run-scoped browser session control tools (MYBROWSER acquire/connect).

INSERT OR IGNORE INTO agentsam_tools (
  id, tool_name, display_name, tool_category, handler_type,
  description, is_active, tool_key, risk_level, requires_approval
) VALUES (
  'ast_browser_close_session_global',
  'browser_close_session',
  'Close browser run session',
  'browser',
  'mybrowser',
  'Release KV mapping for run-scoped MYBROWSER session (agent_run_id / workflow_run_id).',
  1,
  'browser_close_session',
  'low',
  0
);
