-- 860: Expand cms_edit profile pins — D1 R/W, R2, browser debug, GitHub (connected CMS repos).
-- Law: agentsam_tool_profiles.tool_keys_json is SSOT (no Worker redeploy for pin changes).
-- Apply:
--   npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/860_cms_edit_profile_capabilities.sql

UPDATE agentsam_tool_profiles
SET
  display_name = 'CMS edit — pages, chrome, R2, browser verify, GitHub',
  tool_keys_json = '["agentsam_cms_read","agentsam_cms_write","agentsam_cms_save_page_html","agentsam_cms_save_injected","agentsam_cms_publish","agentsam_cms_verify_live","agentsam_cms_save_site_shell","agentsam_cms_publish_site_shell","agentsam_d1_query","agentsam_d1_write","agentsam_r2_list","agentsam_r2_get","agentsam_r2_put","browser_navigate","browser_content","browser_run_screenshot","browser_run_snapshot","web_fetch","agentsam_github_read","agentsam_github_tree","agentsam_github_search","agentsam_github_read_many","agentsam_github_patch","fs_read_file","fs_search_files","agentsam_memory_manager"]',
  max_tools = 24,
  write_policy_json = '{"can_edit_files":true,"can_terminal":false,"can_d1_write":true,"can_deploy":true,"can_browser_automation":true,"can_memory_write":true}',
  notes = 'CMS focus: PrimeTech page/shell loop + D1 R/W + R2 list/get/put + browser navigate/content/screenshot/snapshot + web_fetch + GitHub read/tree/search/patch when repo-connected. No ambient prompt dump — tools discover open page via page_id. Omit r2_delete / d1_migrate / github_write by default (approval-heavy).',
  updated_at = unixepoch()
WHERE profile_key = 'cms_edit';

-- Bindings stay keyed to cms_edit profile (already applied in 859). Re-assert SSOT rows.
INSERT OR REPLACE INTO agentsam_tool_profile_bindings (
  id, task_type, profile_key, priority, notes, is_active, updated_at
) VALUES
  ('atpb_cms_edit', 'cms_edit', 'cms_edit', 10, 'CMS studio surface / Theme Studio', 1, unixepoch()),
  ('atpb_cms_page', 'cms_page', 'cms_edit', 10, 'classifier alias', 1, unixepoch()),
  ('atpb_cms_publish', 'cms_publish', 'cms_edit', 10, 'classifier alias', 1, unixepoch());
