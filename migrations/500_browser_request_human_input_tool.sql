-- 500: Human-in-the-loop browser checkpoint (shared Agent Live Browser Session).

INSERT OR IGNORE INTO agentsam_tools (
  id, tool_name, display_name, tool_category, handler_type,
  description, is_active, tool_key, risk_level, requires_approval
) VALUES (
  'ast_browser_request_human_input',
  'browser_request_human_input',
  'Request human browser input',
  'browser',
  'mybrowser',
  'Pause agent automation and share the live Browser Run session with the human for MFA, CAPTCHA, or sensitive steps. Blocks until Continue or timeout.',
  1,
  'browser_request_human_input',
  'medium',
  0
);
