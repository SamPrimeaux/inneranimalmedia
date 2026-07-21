-- 967: Design Mode — visual UI edit kit (auto-bound from browserContext.design_mode).
-- Not a composer mode. Agent/Multitask stay selected; session-profile-task resolves
-- task_type=design_mode when Design Mode is active in the Browser panel.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/967_design_mode_tool_profile.sql

INSERT INTO agentsam_tool_profiles (
  id, profile_key, display_name, tool_keys_json, max_tools, default_deny_oauth,
  write_policy_json, notes, is_active, sort_order, created_at, updated_at
) VALUES (
  'atprof_design_mode',
  'design_mode',
  'Design Mode — visual UI edit (Browser pick/draw)',
  '["fs_read_file","fs_search_files","fs_edit_file","fs_write_file","agentsam_github_read","agentsam_github_tree","agentsam_github_read_many","agentsam_github_search","agentsam_github_write","agentsam_github_patch","agentsam_codebase_retrieve","cdt_take_screenshot","cdt_take_snapshot","cdt_evaluate_script","cdt_hover","cdt_navigate_page","browser_run_screenshot","browser_content","agentsam_r2_get","agentsam_r2_put","agentsam_memory_search","agentsam_memory_commit","search_web"]',
  24,
  0,
  '{"can_edit_files":true,"can_terminal":false,"can_d1_write":false,"can_deploy":false,"can_browser_automation":true,"can_memory_write":true}',
  '967: Auto-bound when browserContext.design_mode.active — no composer mode swap',
  1,
  6,
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

INSERT INTO agentsam_tool_profile_bindings (
  id, task_type, profile_key, priority, is_active, notes, created_at, updated_at
)
SELECT
  'atpb_design_mode', 'design_mode', 'design_mode', 1, 1,
  '967: Design Mode browser context → design_mode profile (auto, not composer)',
  unixepoch(), unixepoch()
WHERE NOT EXISTS (
  SELECT 1 FROM agentsam_tool_profile_bindings WHERE task_type = 'design_mode'
);

UPDATE agentsam_tool_profile_bindings
SET
  profile_key = 'design_mode',
  priority = 1,
  is_active = 1,
  notes = '967: Design Mode browser context → design_mode profile (auto, not composer)',
  updated_at = unixepoch()
WHERE task_type = 'design_mode';
