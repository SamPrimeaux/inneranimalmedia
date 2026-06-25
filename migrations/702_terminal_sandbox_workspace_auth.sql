-- 702: agentsam_terminal_sandbox — use workspace auth (no platform secret/binding required)
-- Sandbox runs via runTerminalCommand + workspace root; platform auth_source blocked credential resolution.

UPDATE agentsam_tools
SET handler_config = json_set(
  COALESCE(handler_config, '{}'),
  '$.auth_source', 'workspace'
)
WHERE tool_key = 'agentsam_terminal_sandbox'
  AND json_extract(COALESCE(handler_config, '{}'), '$.auth_source') = 'platform';
