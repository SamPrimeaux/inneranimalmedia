-- 913: In-app Agent Sam CF+GitHub profile SSOT
-- Dedicated profile for agent/multitask/debug — replaces narrow code_develop pin.
-- Menu = D1 only. Soft max keeps Worker under hang threshold.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=migrations/913_in_app_agent_cf_github_profile.sql

UPDATE agentsam_tools
SET is_active = 1,
    oauth_visible = 1,
    updated_at = unixepoch()
WHERE tool_key = 'agentsam_cf_d1_list' OR tool_name = 'agentsam_cf_d1_list';

UPDATE agentsam_tools
SET is_active = 1,
    oauth_visible = 1,
    updated_at = unixepoch()
WHERE tool_key IN (
  'agentsam_cf_workers_list',
  'agentsam_d1_query',
  'agentsam_d1_write',
  'agentsam_r2_list',
  'agentsam_r2_get',
  'agentsam_github_repo_list',
  'agentsam_github_list_commits'
);

INSERT INTO agentsam_tool_profiles (
  id,
  profile_key,
  display_name,
  tool_keys_json,
  max_tools,
  default_deny_oauth,
  write_policy_json,
  notes,
  is_active,
  sort_order,
  created_at,
  updated_at
) VALUES (
  'atp_in_app_agent_cf_github',
  'in_app_agent_cf_github',
  'In-app Agent — CF + GitHub',
  '["agentsam_cf_d1_list","agentsam_d1_query","agentsam_d1_write","agentsam_cf_workers_list","agentsam_r2_list","agentsam_r2_get","agentsam_github_repo_list","agentsam_github_tree","agentsam_github_read","agentsam_github_read_many","agentsam_github_search","agentsam_github_write","agentsam_github_patch","agentsam_github_list_commits","agentsam_terminal_local","agentsam_terminal_remote","agentsam_terminal_sandbox","agentsam_memory_manager","fs_read_file","fs_search_files","fs_edit_file","pty_git_status"]',
  32,
  0,
  '{"can_edit_files":true,"can_terminal":true,"can_d1_write":true,"can_deploy":true,"can_browser_automation":true,"can_memory_write":true}',
  '913: Operator in-app spine — account CF catalog + GitHub. Soft max 32. Edit tool_keys_json in D1 to change menu.',
  1,
  5,
  unixepoch(),
  unixepoch()
)
ON CONFLICT(profile_key) DO UPDATE SET
  display_name = excluded.display_name,
  tool_keys_json = excluded.tool_keys_json,
  max_tools = excluded.max_tools,
  write_policy_json = excluded.write_policy_json,
  notes = excluded.notes,
  is_active = 1,
  updated_at = unixepoch();

-- UNIQUE(task_type): one binding per mode — retarget to CF+GitHub profile.
UPDATE agentsam_tool_profile_bindings
SET profile_key = 'in_app_agent_cf_github',
    priority = 1,
    is_active = 1,
    notes = '913: agent/multitask/debug use CF+GitHub spine (not code_develop)',
    updated_at = unixepoch()
WHERE task_type IN ('agent', 'multitask', 'debug');
