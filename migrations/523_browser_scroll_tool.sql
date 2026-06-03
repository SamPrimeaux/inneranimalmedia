-- 523: browser_scroll — prove scroll actions in Agent Live Browser lane
INSERT INTO agentsam_tools (
  tool_key,
  tool_name,
  display_name,
  description,
  category,
  handler_type,
  handler_key,
  is_active,
  oauth_visible,
  created_at,
  updated_at
)
SELECT
  'browser_scroll',
  'browser_scroll',
  'Browser scroll',
  'Scroll the live browser page up or down. Use for smoke tests and reading long pages. Reuses the same agent_run_id Browser Run session.',
  'browser',
  'mybrowser',
  'browser_scroll',
  1,
  0,
  unixepoch(),
  unixepoch()
WHERE NOT EXISTS (
  SELECT 1 FROM agentsam_tools WHERE tool_key = 'browser_scroll' OR tool_name = 'browser_scroll'
);
