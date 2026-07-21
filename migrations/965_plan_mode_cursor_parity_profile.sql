-- 965: Cursor-parity Plan mode — dedicated research profile (not inspect).
-- Clarifying questions + plan.md in ARTIFACTS remain the product spine;
-- this profile is the read-only research kit used while Plan mode explores.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/965_plan_mode_cursor_parity_profile.sql

INSERT INTO agentsam_tool_profiles (
  id, profile_key, display_name, tool_keys_json, max_tools, default_deny_oauth,
  write_policy_json, notes, is_active, sort_order, created_at, updated_at
) VALUES (
  'atprof_plan_mode',
  'plan',
  'Plan Mode — research then plan (Cursor-parity)',
  '["fs_read_file","fs_search_files","agentsam_github_read","agentsam_github_tree","agentsam_github_read_many","agentsam_github_search","agentsam_github_list_commits","agentsam_codebase_retrieve","agentsam_d1_query","agentsam_memory_search","agentsam_memory_commit","agentsam_autorag","search_web"]',
  16,
  0,
  '{"can_edit_files":false,"can_terminal":false,"can_d1_write":false,"can_deploy":false,"can_browser_automation":false,"can_memory_write":true}',
  '965: Cursor-parity Plan — explore/read only; plan.md + tasks via plan_pipeline; Build executes separately',
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

UPDATE agentsam_tool_profile_bindings
SET
  profile_key = 'plan',
  priority = 1,
  is_active = 1,
  notes = '965: Plan composer → dedicated plan profile (was inspect)',
  updated_at = unixepoch()
WHERE task_type = 'plan';

INSERT INTO agentsam_tool_profile_bindings (
  id, task_type, profile_key, priority, is_active, notes, created_at, updated_at
)
SELECT
  'atpb_plan_mode', 'plan', 'plan', 1, 1,
  '965: Plan composer → dedicated plan profile',
  unixepoch(), unixepoch()
WHERE NOT EXISTS (
  SELECT 1 FROM agentsam_tool_profile_bindings WHERE task_type = 'plan'
);
