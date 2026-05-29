-- 453: Register web_fetch (URL text extraction — not MYBROWSER, not search_web).
INSERT OR IGNORE INTO agentsam_tools (
  id, tool_key, tool_code, tool_name, display_name, tool_category, handler_type,
  handler_config, risk_level, requires_approval, workspace_scope, is_active, is_degraded
) VALUES (
  'ast_web_fetch_global',
  'web_fetch', 'web_fetch', 'web_fetch', 'Web Fetch', 'research.web', 'builtin',
  '{"dispatcher":"web_fetch","source_file":"src/tools/builtin/web.js"}',
  'low', 0, '["*"]', 1, 0
);
UPDATE agentsam_tools SET
  tool_key = 'web_fetch',
  display_name = 'Web Fetch',
  description = 'Fetch a known public URL and return text (no browser render). Use for docs pages, raw GitHub, API references.',
  tool_category = 'research.web',
  handler_type = 'builtin',
  handler_config = '{"dispatcher":"web_fetch","source_file":"src/tools/builtin/web.js"}',
  is_active = 1,
  is_degraded = 0,
  updated_at = unixepoch()
WHERE tool_name = 'web_fetch';
