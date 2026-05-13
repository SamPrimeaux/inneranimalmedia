-- python_execute: align with terminal-style policy (script execution is mutating / high-impact).
UPDATE agentsam_mcp_tools
SET requires_approval = 1
WHERE lower(trim(tool_name)) = 'python_execute';
