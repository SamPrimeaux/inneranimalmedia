-- 515: OAuth GitHub write upsert (create+update) + SamPrimeaux-wide SSH git template.
--
-- Fixes agentsam_github_write requiring sha/update_file only (OAuth MCP could not create files).
-- Generalizes ws_inneranimalmedia github SSH to all SamPrimeaux/* repos (Connor self-configures).
--
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml \
--     --file=migrations/515_github_oauth_upsert_samprimeaux_ssh.sql

UPDATE agentsam_rules_document
SET
  body_markdown = '## RULE: GitHub — OAuth upsert + terminal git (SSH)

**ID:** rule_github_ssh_git_workflow | **Priority:** HIGH

### OAuth MCP / in-app single-file writes
- **`agentsam_github_write`** uses **`upsert_file`**: creates when path missing, updates when present.
- **Do not pass `sha` for new files** — omit the field entirely (empty string breaks create).
- Optional `sha` only when you already have it from `agentsam_github_read`.

### Terminal git (bulk / scaffolds / no OAuth)
- PTY has **git + SSH keys**, **no `gh` CLI**.
- **Sam (`ws_inneranimalmedia`)**: any **`SamPrimeaux/REPO`** → `git@github.com:SamPrimeaux/REPO.git`
  - Override: `inneranimalmedia-mcp-server` → `git@github.com-inneranimal-mcp:SamPrimeaux/inneranimalmedia-mcp-server.git`
- **Connor / other users**: configure `workspace_settings.github` on their own workspace — do not inherit Sam remotes.

### When to use which
| Task | Tool |
|------|------|
| Read/list/search | `agentsam_github_read`, `agentsam_github_repo_list` |
| One file create or update (OAuth connected) | `agentsam_github_write` (no sha for create) |
| Multi-file scaffold, clone, npm init, deploy | `agentsam_terminal_run` + git over SSH |
| PR/issue after branch pushed | `agentsam_github_pr`, `agentsam_github_issue` |

### Do NOT
- Do not require `sha` on create.
- Do not use `gh` (not installed on PTY).
- Do not merge multi-page apps into one existing file because write failed — use git or upsert per path.',
  updated_at_epoch = unixepoch()
WHERE id = 'rule_github_ssh_git_workflow';

UPDATE agentsam_tools
SET
  description = 'Create or update one file in a GitHub repo via OAuth. Omit sha for NEW files; include sha only when updating and you already read it. For multi-file scaffolds use agentsam_terminal_run + git over SSH.',
  input_schema = '{"type":"object","properties":{"path":{"type":"string","description":"File path in repo"},"content":{"type":"string","description":"Full file content"},"message":{"type":"string","description":"Commit message"},"sha":{"type":"string","description":"Optional — only for updates when already known from read"},"branch":{"type":"string","default":"main"},"repo":{"type":"string","description":"owner/repo — any SamPrimeaux repo or collaborator repo you have access to"}},"required":["path","content","message"]}',
  handler_config = '{"handler":"github","auth_source":"user_oauth_tokens","provider":"github","repo_field":"workspace.github_repo","operation":"upsert_file"}',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_github_write';

UPDATE agentsam_tools
SET
  description = 'Create or update one file (upsert). Omit sha for new paths. Multi-file work → terminal git over SSH.',
  handler_config = json_set(COALESCE(handler_config, '{}'), '$.operation', 'upsert_file'),
  updated_at = unixepoch()
WHERE tool_key IN ('agentsam_github_file_write', 'agentsam_github_create_file')
  AND is_active = 1;

UPDATE agentsam_tools
SET
  description = 'Update ONLY when sha is known from read. For create-or-update use agentsam_github_write (upsert).',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_github_update_file'
  AND is_active = 1;

UPDATE workspace_settings
SET settings_json = json_set(
  COALESCE(settings_json, '{}'),
  '$.github', json_object(
    'prefer_terminal_for', 'multi_file_scaffolds',
    'no_gh_cli', 1,
    'github_account', 'SamPrimeaux',
    'ssh_remote_template', 'git@github.com:SamPrimeaux/{repo}.git',
    'ssh_remote_overrides', json_object(
      'inneranimalmedia-mcp-server', 'git@github.com-inneranimal-mcp:SamPrimeaux/inneranimalmedia-mcp-server.git'
    ),
    'ssh_hosts', json_object(
      'default', 'github.com',
      'inneranimal_org', 'github-inneranimal',
      'mcp_deploy_key', 'github.com-inneranimal-mcp',
      'agentsam', 'github.com-agentsam'
    ),
    'notes', 'All SamPrimeaux/* repos use ssh_remote_template unless listed in ssh_remote_overrides. Connor configures his own workspace github block.'
  ),
  '$.terminal_hints', json_object(
    'wrangler_tail', 'npx wrangler tail inneranimalmedia -c wrangler.production.toml',
    'wrangler_deployments', 'npx wrangler deployments list -c wrangler.production.toml',
    'dev_deploy_auto', 'bash scripts/dev-deploy.sh',
    'dev_deploy_worker', 'bash scripts/dev-deploy.sh --worker',
    'dev_deploy_front', 'bash scripts/dev-deploy.sh --front',
    'ssh_test_github', 'ssh -T git@github.com',
    'git_clone_sam_repo', 'git clone git@github.com:SamPrimeaux/REPO.git',
    'git_clone_mcp_repo', 'git clone git@github.com-inneranimal-mcp:SamPrimeaux/inneranimalmedia-mcp-server.git',
    'git_new_branch', 'git checkout -b BRANCH && git push -u origin HEAD',
    'git_commit_push', 'git add -A && git commit -m "MSG" && git push origin HEAD',
    'git_new_file', 'install -d DIR && printf "%s\n" "CONTENT" > PATH && git add PATH && git commit -m "MSG" && git push origin HEAD',
    'github_oauth_write', 'agentsam_github_write — omit sha for new files; upserts create or update one path',
    'github_policy', 'OAuth write=single file upsert; terminal git=multi-file; no gh CLI on PTY'
  )
),
updated_at = unixepoch()
WHERE workspace_id = 'ws_inneranimalmedia';

UPDATE agentsam_workspace
SET metadata_json = json_set(
  COALESCE(metadata_json, '{}'),
  '$.github', json_object(
    'github_account', 'SamPrimeaux',
    'ssh_remote_template', 'git@github.com:SamPrimeaux/{repo}.git',
    'ssh_remote_overrides', json_object(
      'inneranimalmedia-mcp-server', 'git@github.com-inneranimal-mcp:SamPrimeaux/inneranimalmedia-mcp-server.git'
    )
  )
),
updated_at = unixepoch()
WHERE id = 'ws_inneranimalmedia';
