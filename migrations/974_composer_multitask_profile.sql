-- 974: composer_multitask — Cursor-aligned Multitask parent kit
-- Parent inherits Agent-level tools (edit / terminal / d1 write / deploy).
-- Child RWS roles further scope via agentsam_subagent_profile — not this ceiling.
-- agent + debug stay on in_app_agent_cf_github until their own composer_* kits land.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/974_composer_multitask_profile.sql

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
  'atprof_composer_multitask',
  'composer_multitask',
  'Composer Multitask — Cursor-level parent (Agent tools + fan-out)',
  '["agentsam_cf_d1_list","agentsam_d1_query","agentsam_d1_write","agentsam_cf_workers_list","agentsam_worker_deploy","agentsam_r2_list","agentsam_r2_get","agentsam_r2_put","agentsam_github_repo_list","agentsam_github_tree","agentsam_github_read","agentsam_github_read_many","agentsam_github_search","agentsam_github_write","agentsam_github_patch","agentsam_github_commit_tree","agentsam_github_list_commits","agentsam_github_pr","agentsam_terminal_local","agentsam_terminal_remote","agentsam_terminal_sandbox","agentsam_codebase_retrieve","agentsam_memory_search","agentsam_memory_commit","fs_read_file","fs_search_files","fs_edit_file","pty_git_status","search_web"]',
  32,
  0,
  '{"version":2,"deny_capabilities":[],"allow_mutating_capabilities":["d1.write","file.write","github.write","terminal.execute","container.execute","python.execute","git.commit","git.push","memory.write","memory.delete","cloudflare.execute","cloudflare.deploy","r2.write","r2.delete","kv.write","kv.delete","vector.write","images.write","browser.navigate","browser.execute","email.modify","email.draft","email.send","cms.write","cms.publish","media.generate","media.transform","media.render","media.export","media.manage","design.write","design.export","workflow.execute","workflow.manage","ticket.write","ticket.status","agent.execute","agent.spawn","drive.write","platform.telemetry"],"require_approval_capabilities":["git.commit","git.push","cloudflare.deploy","email.send","cms.publish","media.manage"]}',
  '974: Cursor-aligned Multitask — parent ≈ Agent tool ceiling; RWS children scope via subagent profiles. Distinct profile_key so Agent/Debug kits can diverge later without retargeting Multitask.',
  1,
  7,
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
  profile_key = 'composer_multitask',
  priority = 1,
  is_active = 1,
  notes = '974: Multitask → composer_multitask (Cursor-level parent; was in_app_agent_cf_github)',
  updated_at = unixepoch()
WHERE task_type = 'multitask';
