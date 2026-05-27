-- ============================================================
-- Migration 416: oauth_external_tools_curate_28
-- Trim agentsam_mcp_oauth_tool_allowlist to ~28 curated tools
-- for external OAuth clients (ChatGPT, Claude.ai).
--
-- Disabled tools remain available to Cursor/full bearer tokens.
-- client_id = 'iam_mcp_inneranimalmedia' affects both ChatGPT
-- and Claude.ai (they share the same OAuth client/catalog).
--
-- KEEP (27 active — db_explain to be added separately):
--   Orient (4):  health_check, workspace_context, recent_errors, search_tools
--   Read  (11):  db_query, db_schema, r2_read, r2_list, github_repo_list,
--                file_read, knowledge_search, memory_search,
--                list_agents, get_agent, workflow_status
--   Ship  (8):   run, plan, todo_add, todo_update, memory_save,
--                github_pr_create, r2_write, file_write
--   Ops   (4):   workflow_trigger, deploy_status, daily_summary, spend_summary
--
-- DISABLE (19): terminal_run, python_run, deploy_trigger, email_send,
--   notify, drive_read, db_write, file_search, git_status, git_diff,
--   git_commit, git_push, github_issue_create, github_pr_merge,
--   cms_read, cms_write, cms_publish, cms_assets, cms_liquid
--
-- NOTE: cms_read is disabled here. Re-enable if ChatGPT is your
-- primary CMS/PM interface:
--   UPDATE agentsam_mcp_oauth_tool_allowlist
--   SET is_active = 1, updated_at = unixepoch()
--   WHERE tool_key IN ('agentsam_cms_read','agentsam_cms_write','agentsam_cms_publish')
--   AND client_id = 'iam_mcp_inneranimalmedia';
-- ============================================================

UPDATE agentsam_mcp_oauth_tool_allowlist
SET
  is_active  = 0,
  updated_at = unixepoch()
WHERE client_id = 'iam_mcp_inneranimalmedia'
  AND tool_key IN (
    -- shell / code execution (never for external)
    'agentsam_terminal_run',
    'agentsam_python_run',
    -- dangerous write ops for external clients
    'agentsam_deploy_trigger',
    'agentsam_db_write',
    -- git ops (keep pr_create, drop the rest)
    'agentsam_git_status',
    'agentsam_git_diff',
    'agentsam_git_commit',
    'agentsam_git_push',
    'agentsam_github_issue_create',
    'agentsam_github_pr_merge',
    -- comms (external clients shouldn't blast email/notify)
    'agentsam_email_send',
    'agentsam_notify',
    -- misc read tools not needed for connector UX
    'agentsam_drive_read',
    'agentsam_file_search',
    -- CMS mesh (re-enable above if needed)
    'agentsam_cms_read',
    'agentsam_cms_write',
    'agentsam_cms_publish',
    'agentsam_cms_assets',
    'agentsam_cms_liquid'
  );

-- Verify: should be 27
SELECT
  COUNT(*) AS active_tool_count,
  GROUP_CONCAT(tool_key, ', ') AS active_tools
FROM agentsam_mcp_oauth_tool_allowlist
WHERE client_id = 'iam_mcp_inneranimalmedia'
  AND is_active = 1;
