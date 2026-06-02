-- 514: GitHub agent workflow — prefer terminal git over SSH; no gh CLI on PTY.
-- Fixes tool descriptions so OAuth/in-app agents stop relying on Contents API for new files.
--
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml \
--     --file=migrations/514_github_ssh_agent_workflow.sql

INSERT OR IGNORE INTO agentsam_rules_document (
  id,
  user_id,
  workspace_id,
  title,
  body_markdown,
  version,
  is_active,
  created_at_epoch,
  updated_at_epoch,
  apply_mode,
  rule_type,
  notes,
  source_stored
) VALUES (
  'rule_github_ssh_git_workflow',
  '',
  '',
  'GitHub: terminal git over SSH (no gh CLI)',
  '## RULE: GitHub repo changes via terminal git (SSH)

**ID:** rule_github_ssh_git_workflow | **Priority:** HIGH for mutate operations

### Runtime facts
- PTY hosts (Mac `localpty`, GCP `terminal`) have **git + SSH keys** — **no `gh` CLI** and no GitHub auth helper.
- `agentsam_github_*` **read** tools: discovery (list repos, read file, tree, branches, search).
- **Commits, new files, scaffolds, multi-file edits:** use `agentsam_terminal_run` / `agentsam_terminal_remote` with **git over SSH**.

### SSH remotes (Sam workspace — resolve from workspace_settings.github.remotes when present)
- `git@github.com:SamPrimeaux/inneranimalmedia.git`
- `git@github.com:SamPrimeaux/agentsam-cms-editor.git`
- `git@github.com-inneranimal-mcp:SamPrimeaux/inneranimalmedia-mcp-server.git`

### Do NOT
- Do not use `gh` (not installed).
- Do not use HTTPS remotes for push (no credential helper on PTY).
- Do not cram new pages into a single existing file because API write failed — clone/mkdir/write/commit/push instead.
- Do not pass empty string as `sha` for create; omit `sha` or use git.

### API write tools (narrow use)
- `agentsam_github_update_file`: single existing file when `sha` is known.
- `agentsam_github_create_pr` / issues / comments: after branch exists on remote.
- Everything else mutating → terminal git.',
  1,
  1,
  unixepoch(),
  unixepoch(),
  'always',
  'workflow',
  'ChatGPT OAuth MCP unreliable on Contents API create; PTY has SSH keys',
  'd1:agentsam_rules_document:rule_github_ssh_git_workflow'
);

UPDATE agentsam_rules_document
SET
  body_markdown = '## RULE: GitHub repo changes via terminal git (SSH)

**ID:** rule_github_ssh_git_workflow | **Priority:** HIGH for mutate operations

### Runtime facts
- PTY hosts (Mac `localpty`, GCP `terminal`) have **git + SSH keys** — **no `gh` CLI** and no GitHub auth helper.
- `agentsam_github_*` **read** tools: discovery (list repos, read file, tree, branches, search).
- **Commits, new files, scaffolds, multi-file edits:** use `agentsam_terminal_run` / `agentsam_terminal_remote` with **git over SSH**.

### SSH remotes (Sam workspace — resolve from workspace_settings.github.remotes when present)
- `git@github.com:SamPrimeaux/inneranimalmedia.git`
- `git@github.com:SamPrimeaux/agentsam-cms-editor.git`
- `git@github.com-inneranimal-mcp:SamPrimeaux/inneranimalmedia-mcp-server.git`

### Do NOT
- Do not use `gh` (not installed).
- Do not use HTTPS remotes for push (no credential helper on PTY).
- Do not cram new pages into a single existing file because API write failed — clone/mkdir/write/commit/push instead.
- Do not pass empty string as `sha` for create; omit `sha` or use git.

### API write tools (narrow use)
- `agentsam_github_update_file`: single existing file when `sha` is known.
- `agentsam_github_create_pr` / issues / comments: after branch exists on remote.
- Everything else mutating → terminal git.',
  is_active = 1,
  updated_at_epoch = unixepoch()
WHERE id = 'rule_github_ssh_git_workflow';

-- Tool descriptions: self-evident mutate vs read split
UPDATE agentsam_tools SET
  description = 'READ ONLY — list/search/get GitHub repos, files, branches, PRs, issues. For commits or new files use agentsam_terminal_run with git over SSH (no gh CLI on PTY).',
  updated_at = unixepoch()
WHERE tool_key IN (
  'agentsam_github_repo_list',
  'agentsam_github_file_read',
  'agentsam_github_get_file',
  'agentsam_github_list_repos',
  'agentsam_github_list_branches',
  'agentsam_github_get_tree',
  'agentsam_github_read_dir',
  'agentsam_github_batch_read',
  'agentsam_github_get_commit',
  'agentsam_github_compare_commits',
  'agentsam_github_get_pr',
  'agentsam_github_list_prs',
  'agentsam_github_get_pr_diff',
  'agentsam_github_list_pr_files',
  'agentsam_github_list_issues',
  'agentsam_github_get_issue',
  'agentsam_github_search_code',
  'agentsam_github_search_issues',
  'agentsam_github_search_issues_prs',
  'agentsam_github_list_workflow_runs',
  'agentsam_github_get_workflow_run',
  'agentsam_github_list_workflow_jobs',
  'agentsam_github_get_job_logs',
  'agentsam_github_get_commit_status',
  'agentsam_github_check_permission',
  'agentsam_github_read'
);

UPDATE agentsam_tools SET
  description = 'Prefer agentsam_terminal_run + git over SSH for new files and scaffolds. API create only for a single new path when git is unavailable. Do not pass blank sha. PTY has no gh CLI.',
  updated_at = unixepoch()
WHERE tool_key IN ('agentsam_github_create_file', 'agentsam_github_file_write');

UPDATE agentsam_tools SET
  description = 'Update ONE existing file via Contents API — requires non-empty sha from a prior read. For new files or multi-file work use agentsam_terminal_run + git push over SSH.',
  updated_at = unixepoch()
WHERE tool_key IN ('agentsam_github_update_file', 'agentsam_github_file_write', 'agentsam_github_write');

UPDATE agentsam_tools SET
  description = 'Delete via API when sha is known. Prefer terminal git for bulk or structural deletes.',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_github_delete_file';

UPDATE agentsam_tools SET
  description = 'Create branch via API when head ref is known. Prefer terminal: git checkout -b && git push -u origin.',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_github_create_branch';

UPDATE agentsam_tools SET
  description = 'Open PR after branch is pushed (terminal git push first). Do not use Contents API to simulate multi-file PRs.',
  updated_at = unixepoch()
WHERE tool_key IN ('agentsam_github_create_pr', 'agentsam_github_pr_create', 'agentsam_github_pr');

UPDATE workspace_settings
SET settings_json = json_set(
  COALESCE(settings_json, '{}'),
  '$.github', json_object(
    'prefer', 'terminal_git_ssh',
    'no_gh_cli', 1,
    'ssh_hosts', json_object(
      'default', 'github.com',
      'inneranimal_org', 'github-inneranimal',
      'mcp_deploy_key', 'github.com-inneranimal-mcp',
      'agentsam', 'github.com-agentsam'
    ),
    'remotes', json_object(
      'SamPrimeaux/inneranimalmedia', 'git@github.com:SamPrimeaux/inneranimalmedia.git',
      'SamPrimeaux/agentsam-cms-editor', 'git@github.com:SamPrimeaux/agentsam-cms-editor.git',
      'SamPrimeaux/inneranimalmedia-mcp-server', 'git@github.com-inneranimal-mcp:SamPrimeaux/inneranimalmedia-mcp-server.git'
    )
  ),
  '$.terminal_hints', json_object(
    'wrangler_tail', 'npx wrangler tail inneranimalmedia -c wrangler.production.toml',
    'wrangler_deployments', 'npx wrangler deployments list -c wrangler.production.toml',
    'dev_deploy_auto', 'bash scripts/dev-deploy.sh',
    'dev_deploy_worker', 'bash scripts/dev-deploy.sh --worker',
    'dev_deploy_front', 'bash scripts/dev-deploy.sh --front',
    'ssh_test_github', 'ssh -T git@github.com',
    'git_clone_ssh', 'git clone git@github.com:OWNER/REPO.git',
    'git_new_branch', 'git checkout -b BRANCH && git push -u origin HEAD',
    'git_commit_push', 'git add -A && git commit -m "MSG" && git push origin HEAD',
    'git_new_file', 'install -d DIR && printf "%s\n" "CONTENT" > PATH && git add PATH && git commit -m "MSG" && git push origin HEAD',
    'github_policy', 'No gh CLI on PTY — use git over SSH for writes; GitHub API read tools for discovery only'
  )
),
updated_at = unixepoch()
WHERE workspace_id = 'ws_inneranimalmedia';

UPDATE agentsam_workspace
SET metadata_json = json_set(
  COALESCE(metadata_json, '{}'),
  '$.github', json_object(
    'prefer', 'terminal_git_ssh',
    'no_gh_cli', 1,
    'remotes', json_object(
      'SamPrimeaux/inneranimalmedia', 'git@github.com:SamPrimeaux/inneranimalmedia.git',
      'SamPrimeaux/agentsam-cms-editor', 'git@github.com:SamPrimeaux/agentsam-cms-editor.git',
      'SamPrimeaux/inneranimalmedia-mcp-server', 'git@github.com-inneranimal-mcp:SamPrimeaux/inneranimalmedia-mcp-server.git'
    )
  )
),
updated_at = unixepoch()
WHERE id = 'ws_inneranimalmedia';
