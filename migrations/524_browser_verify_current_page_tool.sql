-- 524: browser_verify_current_page — runtime proof before quoting live page state
INSERT OR IGNORE INTO agentsam_tools (
  id, tool_name, display_name, tool_category, handler_type,
  description, is_active, tool_key, risk_level, requires_approval
) VALUES (
  'ast_browser_verify_current_page',
  'browser_verify_current_page',
  'Browser verify current page',
  'browser',
  'mybrowser',
  'Verify the live browser current URL, title, and visible text sample before claiming navigation or reading page content. Intent is not proof — only verified live session state counts.',
  1,
  'browser_verify_current_page',
  'low',
  0
);
