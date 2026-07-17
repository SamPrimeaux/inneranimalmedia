-- 923: Keep both Database Studio provider faces executable in the in-app Agent profile.
-- D1 resources use the caller's Cloudflare OAuth token; Supabase uses the explicit
-- resource_ref contract from 922. Memory is Worker-local and needs no credential.

UPDATE agentsam_tool_profiles
SET tool_keys_json = '["agentsam_cf_d1_list","agentsam_d1_query","agentsam_d1_write","agentsam_supabase_query","agentsam_supabase_write","agentsam_cf_workers_list","agentsam_r2_list","agentsam_r2_get","agentsam_github_repo_list","agentsam_github_tree","agentsam_github_read","agentsam_github_read_many","agentsam_github_search","agentsam_github_write","agentsam_github_patch","agentsam_github_list_commits","agentsam_terminal_local","agentsam_terminal_remote","agentsam_terminal_sandbox","agentsam_memory_manager","fs_read_file","fs_search_files","fs_edit_file","pty_git_status","search_web"]',
    max_tools = 32,
    notes = '923: In-app Agent includes explicit D1 and Supabase Database Studio faces.',
    updated_at = unixepoch()
WHERE profile_key = 'in_app_agent_cf_github';

UPDATE agentsam_tools
SET handler_config = json_set(
      COALESCE(handler_config, '{}'),
      '$.platform_bindingless',
      json('true')
    ),
    updated_at = unixepoch()
WHERE tool_key = 'agentsam_memory_manager';
