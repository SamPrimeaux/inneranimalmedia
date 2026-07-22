-- 982: Phase 5 — force_first_tool → agentsam_repo_context + profile menu membership
-- force_first only fires when the tool is already on the active menu (agent-tool-loop).
-- Requires migration 454 (MCP) agentsam_repo_context row in agentsam_tools first.

UPDATE agentsam_tool_profile_bindings
SET force_first_tool = 'agentsam_repo_context',
    updated_at = unixepoch()
WHERE task_type IN (
  'project_question',
  'readonly_repo_audit',
  'github',
  'git',
  'search_code',
  'research',
  'review',
  'summary'
)
AND force_first_tool = 'agentsam_github_tree';

-- Inject composite onto profiles that already expose github_tree (idempotent).
UPDATE agentsam_tool_profiles
SET tool_keys_json = REPLACE(
      tool_keys_json,
      '"agentsam_github_tree"',
      '"agentsam_repo_context","agentsam_github_tree"'
    ),
    updated_at = unixepoch()
WHERE tool_keys_json LIKE '%"agentsam_github_tree"%'
  AND tool_keys_json NOT LIKE '%"agentsam_repo_context"%';
