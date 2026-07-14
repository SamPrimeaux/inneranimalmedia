-- 859: Dedicated cms_edit tool profile — Agent Sam can save/publish pages + site chrome.
-- Fixes: CMS surface with route_key=cms_edit was resolving to ask/chat (read-only) or
-- code_develop (repo tools, no agentsam_cms_*). Header/footer need site-shell tools.
-- Apply:
--   npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/859_cms_edit_tool_profile.sql

INSERT OR REPLACE INTO agentsam_tool_profiles (
  id, profile_key, display_name, tool_keys_json, max_tools, default_deny_oauth, write_policy_json, notes, is_active, sort_order, updated_at
) VALUES (
  'atprof_cms_edit',
  'cms_edit',
  'CMS edit / publish (pages + site chrome)',
  '["agentsam_cms_read","agentsam_cms_write","agentsam_cms_save_page_html","agentsam_cms_save_injected","agentsam_cms_publish","agentsam_cms_verify_live","agentsam_cms_save_site_shell","agentsam_cms_publish_site_shell","cms_pipeline_prototype","fs_read_file","agentsam_d1_query","agentsam_memory_manager","agentsam_autorag","agentsam_github_read"]',
  14,
  1,
  '{"can_edit_files":true,"can_terminal":false,"can_d1_write":true,"can_deploy":true,"can_browser_automation":false,"can_memory_write":true}',
  'PrimeTech loop: read → save page/inject/shell → publish → verify. Site chrome = agentsam_cms_save_site_shell + publish_site_shell (iam-header/footer).',
  1,
  25,
  unixepoch()
);

-- Prefer cms_edit profile for cms_edit task_type (was code_develop — missing CMS tools)
INSERT OR REPLACE INTO agentsam_tool_profile_bindings (
  id, task_type, profile_key, priority, notes, is_active, updated_at
) VALUES (
  'atpb_cms_edit',
  'cms_edit',
  'cms_edit',
  10,
  'CMS studio / site chrome — never ask or code_develop',
  1,
  unixepoch()
);

-- Soft aliases so classifier labels still get write CMS tools when on CMS work
INSERT OR REPLACE INTO agentsam_tool_profile_bindings (
  id, task_type, profile_key, priority, notes, is_active, updated_at
) VALUES
  ('atpb_cms_page', 'cms_page', 'cms_edit', 10, 'alias', 1, unixepoch()),
  ('atpb_cms_publish', 'cms_publish', 'cms_edit', 10, 'alias', 1, unixepoch());
