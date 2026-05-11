-- Post-deploy verification: active agentsam_tools rows that map to builtin/github/ai dispatch.
-- Run against production D1 after deploying Worker changes that add handlers.
-- Adjust tool_name lists if your catalog differs.

SELECT tool_name, COALESCE(is_active, 1) AS active, risk_level, handler_type
FROM agentsam_tools
WHERE COALESCE(is_active, 1) = 1
  AND tool_name IN (
    'd1_query',
    'd1_explain',
    'd1_schema_introspect',
    'd1_write',
    'd1_batch_write',
    'agentsam_get_agent',
    'agentsam_list_agents',
    'agentsam_run_agent',
    'ai_complete',
    'ai_compare',
    'ai_embed',
    'browser_content',
    'r2_write',
    'terminal_execute',
    'github_repos',
    'github_file',
    'github_get_file',
    'github_update_file',
    'github_create_pr'
  )
ORDER BY tool_name;
