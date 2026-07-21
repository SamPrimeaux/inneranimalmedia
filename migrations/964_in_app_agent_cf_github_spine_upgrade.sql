-- 964: Upgrade in_app_agent_cf_github coding spine.
-- memory_manager → memory_search + memory_commit
-- Add: github_commit_tree, codebase_retrieve, r2_put, worker_deploy, github_pr
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/964_in_app_agent_cf_github_spine_upgrade.sql

UPDATE agentsam_tool_profiles
SET
  tool_keys_json = '["agentsam_cf_d1_list","agentsam_d1_query","agentsam_d1_write","agentsam_cf_workers_list","agentsam_worker_deploy","agentsam_r2_list","agentsam_r2_get","agentsam_r2_put","agentsam_github_repo_list","agentsam_github_tree","agentsam_github_read","agentsam_github_read_many","agentsam_github_search","agentsam_github_write","agentsam_github_patch","agentsam_github_commit_tree","agentsam_github_list_commits","agentsam_github_pr","agentsam_terminal_local","agentsam_terminal_remote","agentsam_terminal_sandbox","agentsam_codebase_retrieve","agentsam_memory_search","agentsam_memory_commit","fs_read_file","fs_search_files","fs_edit_file","pty_git_status","search_web"]',
  max_tools = 32,
  notes = '964: commit_tree, codebase_retrieve, r2_put, worker_deploy, github_pr; memory_manager → search+commit',
  is_active = 1,
  updated_at = unixepoch()
WHERE profile_key = 'in_app_agent_cf_github';

UPDATE agentsam_tools
SET is_active = 1, updated_at = unixepoch()
WHERE tool_key IN (
  'agentsam_github_commit_tree',
  'agentsam_codebase_retrieve',
  'agentsam_r2_put',
  'agentsam_worker_deploy',
  'agentsam_github_pr',
  'agentsam_memory_search',
  'agentsam_memory_commit'
);
