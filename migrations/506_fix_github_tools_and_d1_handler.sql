-- 506: GitHub tool surface upsert + agentsam_d1_query handler_type fix
--
-- Goals:
-- - GitHub: stable operation strings + per-user OAuth; requires_approval ONLY for merge_pr + delete_branch
-- - D1: (superseded by 509) agentsam_d1_* belong in handler_type='cf' with operation d1.*
--
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml \
--     --file=migrations/506_fix_github_tools_and_d1_handler.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- D1 tool fix
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE agentsam_tools
SET handler_type = 'd1',
    updated_at = unixepoch()
WHERE tool_name = 'agentsam_d1_query';

-- Ensure handler_config stays as binding='DB' + operation='query' (idempotent).
UPDATE agentsam_tools
SET handler_config = json_set(
      json_set(COALESCE(handler_config, '{}'), '$.binding', 'DB'),
      '$.operation', 'query'
    ),
    updated_at = unixepoch()
WHERE tool_name = 'agentsam_d1_query';

-- ─────────────────────────────────────────────────────────────────────────────
-- GitHub tool surface upsert
-- ─────────────────────────────────────────────────────────────────────────────

-- Normalize approval flags on any existing GitHub tools: only merge_pr + delete_branch are gated.
UPDATE agentsam_tools
SET requires_approval = CASE
  WHEN json_extract(handler_config, '$.operation') IN ('merge_pr','delete_branch') THEN 1
  ELSE 0
END,
updated_at = unixepoch()
WHERE lower(handler_type) = 'github'
  AND COALESCE(is_active, 1) = 1;

-- Canonical alias tools required by policy surfaces.
INSERT OR REPLACE INTO agentsam_tools
  (tool_key, tool_name, display_name, tool_category,
   description, input_schema,
   handler_type, handler_config,
   risk_level, requires_approval,
   workspace_scope, modes_json,
   oauth_visible, is_active, is_global,
   updated_at)
VALUES
(
  'agentsam_github_read',
  'agentsam_github_read',
  'GitHub Read',
  'github.read',
  'Read a file from GitHub by repo + path (supports ref/branch).',
  '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"repo":{"type":"string"},"path":{"type":"string"},"branch":{"type":"string"},"ref":{"type":"string"},"account":{"type":"string"},"account_identifier":{"type":"string"}},"required":["user_id","repo","path"]}',
  'github',
  '{"auth_source":"user_oauth_tokens","provider":"github","operation":"get_file"}',
  'low', 0,
  '["*"]', '["ask","plan","debug","agent","multitask"]',
  1, 1, 1,
  unixepoch()
),
(
  'agentsam_github_write',
  'agentsam_github_write',
  'GitHub Write',
  'github.write',
  'Update an existing file in GitHub (requires sha from a prior read).',
  '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"repo":{"type":"string"},"path":{"type":"string"},"content":{"type":"string"},"message":{"type":"string"},"sha":{"type":"string"},"branch":{"type":"string"},"account":{"type":"string"},"account_identifier":{"type":"string"}},"required":["user_id","repo","path","content","message","sha"]}',
  'github',
  '{"auth_source":"user_oauth_tokens","provider":"github","operation":"update_file"}',
  'medium', 0,
  '["*"]', '["ask","plan","debug","agent","multitask"]',
  1, 1, 1,
  unixepoch()
);

-- Operation-specific tools (one per op string; stable contract).
-- Note: input_schema here is minimal/strict; execution will additionally validate at runtime.
INSERT OR REPLACE INTO agentsam_tools
  (tool_key, tool_name, display_name, tool_category,
   description, input_schema,
   handler_type, handler_config,
   risk_level, requires_approval,
   workspace_scope, modes_json,
   oauth_visible, is_active, is_global,
   updated_at)
VALUES
-- READ OPS
('agentsam_github_get_file','agentsam_github_get_file','GitHub Get File','github.file',
 'Get file contents from GitHub (base64 decode to text).',
 '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"repo":{"type":"string"},"path":{"type":"string"},"branch":{"type":"string"},"ref":{"type":"string"}},"required":["user_id","repo","path"]}',
 'github','{"auth_source":"user_oauth_tokens","provider":"github","operation":"get_file"}',
 'low',0,'["*"]','["ask","plan","debug","agent","multitask"]',1,1,1,unixepoch()),
('agentsam_github_list_repos','agentsam_github_list_repos','GitHub List Repos','github.repo',
 'List GitHub repositories for the connected user.',
 '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"account":{"type":"string"},"account_identifier":{"type":"string"}},"required":["user_id"]}',
 'github','{"auth_source":"user_oauth_tokens","provider":"github","operation":"list_repos"}',
 'low',0,'["*"]','["ask","plan","debug","agent","multitask"]',1,1,1,unixepoch()),
('agentsam_github_list_branches','agentsam_github_list_branches','GitHub List Branches','github.branch',
 'List branches in a repository.',
 '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"repo":{"type":"string"}},"required":["user_id","repo"]}',
 'github','{"auth_source":"user_oauth_tokens","provider":"github","operation":"list_branches"}',
 'low',0,'["*"]','["ask","plan","debug","agent","multitask"]',1,1,1,unixepoch()),
('agentsam_github_get_tree','agentsam_github_get_tree','GitHub Get Tree','github.tree',
 'Get a git tree for a branch.',
 '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"repo":{"type":"string"},"branch":{"type":"string"}},"required":["user_id","repo","branch"]}',
 'github','{"auth_source":"user_oauth_tokens","provider":"github","operation":"get_tree"}',
 'low',0,'["*"]','["ask","plan","debug","agent","multitask"]',1,1,1,unixepoch()),
('agentsam_github_read_dir','agentsam_github_read_dir','GitHub Read Dir','github.tree',
 'Read directory entries via GitHub contents API.',
 '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"repo":{"type":"string"},"path":{"type":"string"},"branch":{"type":"string"},"ref":{"type":"string"}},"required":["user_id","repo","path"]}',
 'github','{"auth_source":"user_oauth_tokens","provider":"github","operation":"read_dir"}',
 'low',0,'["*"]','["ask","plan","debug","agent","multitask"]',1,1,1,unixepoch()),
('agentsam_github_batch_read','agentsam_github_batch_read','GitHub Batch Read','github.tree',
 'Batch read multiple files from a repo.',
 '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"repo":{"type":"string"},"files":{"type":"array","items":{"anyOf":[{"type":"string"},{"type":"object","properties":{"path":{"type":"string"},"ref":{"type":"string"},"branch":{"type":"string"}},"required":["path"],"additionalProperties":false}]}}},"required":["user_id","repo","files"]}',
 'github','{"auth_source":"user_oauth_tokens","provider":"github","operation":"batch_read"}',
 'low',0,'["*"]','["ask","plan","debug","agent","multitask"]',1,1,1,unixepoch()),
('agentsam_github_get_commit','agentsam_github_get_commit','GitHub Get Commit','github.commit',
 'Get a commit by sha.',
 '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"repo":{"type":"string"},"sha":{"type":"string"}},"required":["user_id","repo","sha"]}',
 'github','{"auth_source":"user_oauth_tokens","provider":"github","operation":"get_commit"}',
 'low',0,'["*"]','["ask","plan","debug","agent","multitask"]',1,1,1,unixepoch()),
('agentsam_github_compare_commits','agentsam_github_compare_commits','GitHub Compare Commits','github.commit',
 'Compare commits base...head.',
 '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"repo":{"type":"string"},"base":{"type":"string"},"head":{"type":"string"}},"required":["user_id","repo","base","head"]}',
 'github','{"auth_source":"user_oauth_tokens","provider":"github","operation":"compare_commits"}',
 'low',0,'["*"]','["ask","plan","debug","agent","multitask"]',1,1,1,unixepoch()),
('agentsam_github_get_pr','agentsam_github_get_pr','GitHub Get PR','github.pr',
 'Get pull request by number.',
 '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"repo":{"type":"string"},"pull_number":{"type":"integer"}},"required":["user_id","repo","pull_number"]}',
 'github','{"auth_source":"user_oauth_tokens","provider":"github","operation":"get_pr"}',
 'low',0,'["*"]','["ask","plan","debug","agent","multitask"]',1,1,1,unixepoch()),
('agentsam_github_list_prs','agentsam_github_list_prs','GitHub List PRs','github.pr',
 'List pull requests.',
 '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"repo":{"type":"string"},"state":{"type":"string"},"base":{"type":"string"},"head":{"type":"string"}},"required":["user_id","repo"]}',
 'github','{"auth_source":"user_oauth_tokens","provider":"github","operation":"list_prs"}',
 'low',0,'["*"]','["ask","plan","debug","agent","multitask"]',1,1,1,unixepoch()),
('agentsam_github_get_pr_diff','agentsam_github_get_pr_diff','GitHub Get PR Diff','github.pr',
 'Get PR diff as unified patch text.',
 '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"repo":{"type":"string"},"pull_number":{"type":"integer"}},"required":["user_id","repo","pull_number"]}',
 'github','{"auth_source":"user_oauth_tokens","provider":"github","operation":"get_pr_diff"}',
 'low',0,'["*"]','["ask","plan","debug","agent","multitask"]',1,1,1,unixepoch()),
('agentsam_github_list_pr_files','agentsam_github_list_pr_files','GitHub List PR Files','github.pr',
 'List files changed in a PR.',
 '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"repo":{"type":"string"},"pull_number":{"type":"integer"}},"required":["user_id","repo","pull_number"]}',
 'github','{"auth_source":"user_oauth_tokens","provider":"github","operation":"list_pr_files"}',
 'low',0,'["*"]','["ask","plan","debug","agent","multitask"]',1,1,1,unixepoch()),
('agentsam_github_list_issues','agentsam_github_list_issues','GitHub List Issues','github.issue',
 'List issues (PRs filtered out).',
 '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"repo":{"type":"string"},"state":{"type":"string"},"labels":{"type":"string"},"assignee":{"type":"string"},"creator":{"type":"string"}},"required":["user_id","repo"]}',
 'github','{"auth_source":"user_oauth_tokens","provider":"github","operation":"list_issues"}',
 'low',0,'["*"]','["ask","plan","debug","agent","multitask"]',1,1,1,unixepoch()),
('agentsam_github_get_issue','agentsam_github_get_issue','GitHub Get Issue','github.issue',
 'Get issue by number.',
 '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"repo":{"type":"string"},"issue_number":{"type":"integer"}},"required":["user_id","repo","issue_number"]}',
 'github','{"auth_source":"user_oauth_tokens","provider":"github","operation":"get_issue"}',
 'low',0,'["*"]','["ask","plan","debug","agent","multitask"]',1,1,1,unixepoch()),
('agentsam_github_search_code','agentsam_github_search_code','GitHub Search Code','github.search',
 'Search code using GitHub search query string.',
 '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"q":{"type":"string"}},"required":["user_id","q"]}',
 'github','{"auth_source":"user_oauth_tokens","provider":"github","operation":"search_code"}',
 'low',0,'["*"]','["ask","plan","debug","agent","multitask"]',1,1,1,unixepoch()),
('agentsam_github_search_issues','agentsam_github_search_issues','GitHub Search Issues/PRs','github.search',
 'Search issues and PRs using GitHub search query string.',
 '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"q":{"type":"string"}},"required":["user_id","q"]}',
 'github','{"auth_source":"user_oauth_tokens","provider":"github","operation":"search_issues"}',
 'low',0,'["*"]','["ask","plan","debug","agent","multitask"]',1,1,1,unixepoch()),
('agentsam_github_list_workflow_runs','agentsam_github_list_workflow_runs','GitHub List Workflow Runs','github.actions',
 'List GitHub Actions workflow runs.',
 '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"repo":{"type":"string"},"branch":{"type":"string"},"workflow_id":{"type":"string"},"status":{"type":"string"},"event":{"type":"string"}},"required":["user_id","repo"]}',
 'github','{"auth_source":"user_oauth_tokens","provider":"github","operation":"list_workflow_runs"}',
 'low',0,'["*"]','["ask","plan","debug","agent","multitask"]',1,1,1,unixepoch()),
('agentsam_github_get_workflow_run','agentsam_github_get_workflow_run','GitHub Get Workflow Run','github.actions',
 'Get a workflow run by run_id.',
 '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"repo":{"type":"string"},"run_id":{"type":"integer"}},"required":["user_id","repo","run_id"]}',
 'github','{"auth_source":"user_oauth_tokens","provider":"github","operation":"get_workflow_run"}',
 'low',0,'["*"]','["ask","plan","debug","agent","multitask"]',1,1,1,unixepoch()),
('agentsam_github_list_workflow_jobs','agentsam_github_list_workflow_jobs','GitHub List Workflow Jobs','github.actions',
 'List jobs for a workflow run.',
 '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"repo":{"type":"string"},"run_id":{"type":"integer"}},"required":["user_id","repo","run_id"]}',
 'github','{"auth_source":"user_oauth_tokens","provider":"github","operation":"list_workflow_jobs"}',
 'low',0,'["*"]','["ask","plan","debug","agent","multitask"]',1,1,1,unixepoch()),
('agentsam_github_get_job_logs','agentsam_github_get_job_logs','GitHub Get Job Logs','github.actions',
 'Fetch job logs for a GitHub Actions job.',
 '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"repo":{"type":"string"},"job_id":{"type":"integer"}},"required":["user_id","repo","job_id"]}',
 'github','{"auth_source":"user_oauth_tokens","provider":"github","operation":"get_job_logs"}',
 'low',0,'["*"]','["ask","plan","debug","agent","multitask"]',1,1,1,unixepoch()),
('agentsam_github_get_commit_status','agentsam_github_get_commit_status','GitHub Get Commit Status','github.commit',
 'Get combined commit status for a sha.',
 '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"repo":{"type":"string"},"sha":{"type":"string"}},"required":["user_id","repo","sha"]}',
 'github','{"auth_source":"user_oauth_tokens","provider":"github","operation":"get_commit_status"}',
 'low',0,'["*"]','["ask","plan","debug","agent","multitask"]',1,1,1,unixepoch()),
('agentsam_github_check_permission','agentsam_github_check_permission','GitHub Check Permission','github.repo',
 'Check the connected user permission level for a repo.',
 '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"repo":{"type":"string"}},"required":["user_id","repo"]}',
 'github','{"auth_source":"user_oauth_tokens","provider":"github","operation":"check_permission"}',
 'low',0,'["*"]','["ask","plan","debug","agent","multitask"]',1,1,1,unixepoch()),
-- WRITE OPS
('agentsam_github_create_file','agentsam_github_create_file','GitHub Create File','github.file',
 'Create a new file in a repo.',
 '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"repo":{"type":"string"},"path":{"type":"string"},"content":{"type":"string"},"message":{"type":"string"},"branch":{"type":"string"}},"required":["user_id","repo","path","content","message"]}',
 'github','{"auth_source":"user_oauth_tokens","provider":"github","operation":"create_file"}',
 'medium',0,'["*"]','["ask","plan","debug","agent","multitask"]',1,1,1,unixepoch()),
('agentsam_github_update_file','agentsam_github_update_file','GitHub Update File','github.file',
 'Update an existing file in a repo (requires sha).',
 '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"repo":{"type":"string"},"path":{"type":"string"},"content":{"type":"string"},"message":{"type":"string"},"sha":{"type":"string"},"branch":{"type":"string"}},"required":["user_id","repo","path","content","message","sha"]}',
 'github','{"auth_source":"user_oauth_tokens","provider":"github","operation":"update_file"}',
 'medium',0,'["*"]','["ask","plan","debug","agent","multitask"]',1,1,1,unixepoch()),
('agentsam_github_delete_file','agentsam_github_delete_file','GitHub Delete File','github.file',
 'Delete a file in a repo (requires sha; can be resolved by a prior read).',
 '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"repo":{"type":"string"},"path":{"type":"string"},"message":{"type":"string"},"sha":{"type":"string"},"branch":{"type":"string"}},"required":["user_id","repo","path","message"]}',
 'github','{"auth_source":"user_oauth_tokens","provider":"github","operation":"delete_file"}',
 'medium',0,'["*"]','["ask","plan","debug","agent","multitask"]',1,1,1,unixepoch()),
('agentsam_github_create_branch','agentsam_github_create_branch','GitHub Create Branch','github.branch',
 'Create a branch from base ref.',
 '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"repo":{"type":"string"},"base":{"type":"string"},"name":{"type":"string"}},"required":["user_id","repo","base","name"]}',
 'github','{"auth_source":"user_oauth_tokens","provider":"github","operation":"create_branch"}',
 'medium',0,'["*"]','["ask","plan","debug","agent","multitask"]',1,1,1,unixepoch()),
('agentsam_github_create_pr','agentsam_github_create_pr','GitHub Create PR','github.pr',
 'Create a pull request.',
 '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"repo":{"type":"string"},"title":{"type":"string"},"head":{"type":"string"},"base":{"type":"string"},"body":{"type":"string"}},"required":["user_id","repo","title","head"]}',
 'github','{"auth_source":"user_oauth_tokens","provider":"github","operation":"create_pr"}',
 'medium',0,'["*"]','["ask","plan","debug","agent","multitask"]',1,1,1,unixepoch()),
('agentsam_github_update_pr','agentsam_github_update_pr','GitHub Update PR','github.pr',
 'Update a pull request.',
 '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"repo":{"type":"string"},"pull_number":{"type":"integer"},"title":{"type":"string"},"body":{"type":"string"},"state":{"type":"string"},"base":{"type":"string"}},"required":["user_id","repo","pull_number"]}',
 'github','{"auth_source":"user_oauth_tokens","provider":"github","operation":"update_pr"}',
 'medium',0,'["*"]','["ask","plan","debug","agent","multitask"]',1,1,1,unixepoch()),
('agentsam_github_create_comment','agentsam_github_create_comment','GitHub Create Comment','github.comment',
 'Create a comment on an issue or PR.',
 '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"repo":{"type":"string"},"issue_number":{"type":"integer"},"body":{"type":"string"}},"required":["user_id","repo","issue_number","body"]}',
 'github','{"auth_source":"user_oauth_tokens","provider":"github","operation":"create_comment"}',
 'medium',0,'["*"]','["ask","plan","debug","agent","multitask"]',1,1,1,unixepoch()),
('agentsam_github_create_issue','agentsam_github_create_issue','GitHub Create Issue','github.issue',
 'Create an issue.',
 '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"repo":{"type":"string"},"title":{"type":"string"},"body":{"type":"string"},"labels":{"type":"array","items":{"type":"string"}},"assignees":{"type":"array","items":{"type":"string"}}},"required":["user_id","repo","title"]}',
 'github','{"auth_source":"user_oauth_tokens","provider":"github","operation":"create_issue"}',
 'medium',0,'["*"]','["ask","plan","debug","agent","multitask"]',1,1,1,unixepoch()),
('agentsam_github_update_issue','agentsam_github_update_issue','GitHub Update Issue','github.issue',
 'Update an issue.',
 '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"repo":{"type":"string"},"issue_number":{"type":"integer"},"title":{"type":"string"},"body":{"type":"string"},"state":{"type":"string"},"labels":{"type":"array","items":{"type":"string"}},"assignees":{"type":"array","items":{"type":"string"}}},"required":["user_id","repo","issue_number"]}',
 'github','{"auth_source":"user_oauth_tokens","provider":"github","operation":"update_issue"}',
 'medium',0,'["*"]','["ask","plan","debug","agent","multitask"]',1,1,1,unixepoch()),
('agentsam_github_close_issue','agentsam_github_close_issue','GitHub Close Issue','github.issue',
 'Close an issue.',
 '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"repo":{"type":"string"},"issue_number":{"type":"integer"}},"required":["user_id","repo","issue_number"]}',
 'github','{"auth_source":"user_oauth_tokens","provider":"github","operation":"close_issue"}',
 'medium',0,'["*"]','["ask","plan","debug","agent","multitask"]',1,1,1,unixepoch()),
('agentsam_github_set_commit_status','agentsam_github_set_commit_status','GitHub Set Commit Status','github.commit',
 'Create a commit status.',
 '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"repo":{"type":"string"},"sha":{"type":"string"},"state":{"type":"string"},"context":{"type":"string"},"description":{"type":"string"},"target_url":{"type":"string"}},"required":["user_id","repo","sha","state"]}',
 'github','{"auth_source":"user_oauth_tokens","provider":"github","operation":"set_commit_status"}',
 'medium',0,'["*"]','["ask","plan","debug","agent","multitask"]',1,1,1,unixepoch()),
-- HIGH RISK
('agentsam_github_merge_pr','agentsam_github_merge_pr','GitHub Merge PR','github.pr',
 'Merge a pull request. Approval required.',
 '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"repo":{"type":"string"},"pull_number":{"type":"integer"},"merge_method":{"type":"string"},"commit_title":{"type":"string"},"commit_message":{"type":"string"}},"required":["user_id","repo","pull_number"]}',
 'github','{"auth_source":"user_oauth_tokens","provider":"github","operation":"merge_pr"}',
 'high',1,'["*"]','["ask","plan","debug","agent","multitask"]',1,1,1,unixepoch()),
('agentsam_github_delete_branch','agentsam_github_delete_branch','GitHub Delete Branch','github.branch',
 'Delete a branch. Approval required.',
 '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"repo":{"type":"string"},"branch":{"type":"string"}},"required":["user_id","repo","branch"]}',
 'github','{"auth_source":"user_oauth_tokens","provider":"github","operation":"delete_branch"}',
 'high',1,'["*"]','["ask","plan","debug","agent","multitask"]',1,1,1,unixepoch());

