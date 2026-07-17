-- 924: Real Database Studio profile (database_engineer).
-- Keep in_app_agent_cf_github as the general coding spine.
-- Studio route/task types bind to database_engineer instead of stuffing
-- Supabase tools into the CF+GitHub agent menu.

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
  'atprof_database_engineer',
  'database_engineer',
  'Database Engineer — D1 + Supabase Studio',
  '["agentsam_cf_d1_list","agentsam_d1_query","agentsam_d1_write","agentsam_supabase_query","agentsam_supabase_write","agentsam_memory_manager","search_web"]',
  12,
  0,
  '{"can_edit_files":false,"can_terminal":false,"can_d1_write":true,"can_deploy":false,"can_browser_automation":false,"can_memory_write":true}',
  '924: Explicit Database Studio faces only. Hyperdrive is transport, not a provider face.',
  1,
  8,
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

-- Studio / data-plane task types → database_engineer
INSERT INTO agentsam_tool_profile_bindings (
  id, task_type, profile_key, priority, is_active, notes, created_at, updated_at
) VALUES
  ('atpb_database_studio', 'database_studio', 'database_engineer', 1, 1, '924: route_key database_studio', unixepoch(), unixepoch()),
  ('atpb_database_schema', 'database_schema', 'database_engineer', 1, 1, '924: Studio schema quick action', unixepoch(), unixepoch()),
  ('atpb_supabase_query', 'supabase_query', 'database_engineer', 1, 1, '924: supabase read intent', unixepoch(), unixepoch()),
  ('atpb_supabase_write', 'supabase_write', 'database_engineer', 1, 1, '924: supabase write intent', unixepoch(), unixepoch())
ON CONFLICT(task_type) DO UPDATE SET
  profile_key = excluded.profile_key,
  priority = excluded.priority,
  is_active = 1,
  notes = excluded.notes,
  updated_at = unixepoch();

UPDATE agentsam_tool_profile_bindings
SET profile_key = 'database_engineer',
    priority = 1,
    is_active = 1,
    notes = '924: d1_query uses database_engineer (D1 + Supabase faces)',
    updated_at = unixepoch()
WHERE task_type = 'd1_query';

-- General agent spine: remove Supabase tools (they belong on database_engineer).
UPDATE agentsam_tool_profiles
SET tool_keys_json = '["agentsam_cf_d1_list","agentsam_d1_query","agentsam_d1_write","agentsam_cf_workers_list","agentsam_r2_list","agentsam_r2_get","agentsam_github_repo_list","agentsam_github_tree","agentsam_github_read","agentsam_github_read_many","agentsam_github_search","agentsam_github_write","agentsam_github_patch","agentsam_github_list_commits","agentsam_terminal_local","agentsam_terminal_remote","agentsam_terminal_sandbox","agentsam_memory_manager","fs_read_file","fs_search_files","fs_edit_file","pty_git_status","search_web"]',
    notes = '924: General CF+GitHub agent spine. Database Studio uses database_engineer.',
    updated_at = unixepoch()
WHERE profile_key = 'in_app_agent_cf_github';
