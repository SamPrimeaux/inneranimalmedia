-- 981: force_first_tool on agentsam_tool_profile_bindings (§6.1 MCP Optimization Spec)
-- Editable without Worker deploys for new task_type → forced first tool mappings.

ALTER TABLE agentsam_tool_profile_bindings ADD COLUMN force_first_tool TEXT;

-- Seed inspect / repo-audit lanes: force a live-tree tool on turn 1 so the model
-- cannot answer from empty context. Prefer github_tree until agentsam_repo_context ships.
UPDATE agentsam_tool_profile_bindings
SET force_first_tool = 'agentsam_github_tree',
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
AND COALESCE(force_first_tool, '') = '';

UPDATE agentsam_tool_profile_bindings
SET force_first_tool = 'agentsam_ship_check',
    updated_at = unixepoch()
WHERE task_type IN ('deploy')
AND COALESCE(force_first_tool, '') = '';
