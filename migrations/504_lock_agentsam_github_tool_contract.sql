-- 504: Lock supported GitHub tool contract (Phase 1)
-- Only expose implemented GitHub operations to OAuth tool discovery.
--
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml \
--     --file=migrations/504_lock_agentsam_github_tool_contract.sql

-- 1) Deactivate all GitHub tools except the contract list.
UPDATE agentsam_tools
SET is_active = 0,
    oauth_visible = 0,
    updated_at = unixepoch()
WHERE COALESCE(is_active, 1) = 1
  AND lower(handler_type) = 'github'
  AND lower(tool_name) NOT IN (
    'agentsam_github_repo_list',
    'agentsam_github_file_read',
    'agentsam_github_file_write',
    'agentsam_github_pr_create'
  );

-- 2) Upsert contract tools with strict handler_config.operation mapping.
-- Notes:
-- - tool_category must start with "github." for lane filtering.
-- - oauth_visible=1 is the OAuth discovery SSOT (see migration 498).
INSERT INTO agentsam_tools
  (tool_key, tool_name, display_name, tool_category,
   description, input_schema,
   handler_type, handler_config,
   risk_level, requires_approval,
   workspace_scope, modes_json,
   oauth_visible, is_active, is_global,
   updated_at)
VALUES
(
  'agentsam_github_repo_list',
  'agentsam_github_repo_list',
  'GitHub Repo List',
  'github.repo',
  'List GitHub repositories available to the connected GitHub account.',
  '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"account":{"type":"string"},"account_identifier":{"type":"string"}},"required":["user_id"]}',
  'github',
  '{"handler":"github","auth_source":"user_oauth_tokens","provider":"github","operation":"list_repos"}',
  'low', 0,
  '["*"]', '["ask","plan","debug","agent","multitask"]',
  1, 1, 1,
  unixepoch()
),
(
  'agentsam_github_file_read',
  'agentsam_github_file_read',
  'GitHub File Read',
  'github.file',
  'Read a file from a GitHub repository by path.',
  '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"repo":{"type":"string","description":"owner/repo"},"path":{"type":"string"},"branch":{"type":"string"},"ref":{"type":"string"},"account":{"type":"string"},"account_identifier":{"type":"string"}},"required":["user_id","repo","path"]}',
  'github',
  '{"handler":"github","auth_source":"user_oauth_tokens","provider":"github","operation":"get_file"}',
  'low', 0,
  '["*"]', '["ask","plan","debug","agent","multitask"]',
  1, 1, 1,
  unixepoch()
),
(
  'agentsam_github_file_write',
  'agentsam_github_file_write',
  'GitHub File Write',
  'github.file',
  'Create or update a file in a GitHub repository with a commit.',
  '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"repo":{"type":"string","description":"owner/repo"},"path":{"type":"string"},"content":{"type":"string"},"message":{"type":"string"},"branch":{"type":"string"},"account":{"type":"string"},"account_identifier":{"type":"string"}},"required":["user_id","repo","path","content","message"]}',
  'github',
  '{"handler":"github","auth_source":"user_oauth_tokens","provider":"github","operation":"update_file"}',
  'medium', 1,
  '["*"]', '["agent","multitask"]',
  1, 1, 1,
  unixepoch()
),
(
  'agentsam_github_pr_create',
  'agentsam_github_pr_create',
  'GitHub PR Create',
  'github.pr',
  'Create a pull request on GitHub.',
  '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"repo":{"type":"string","description":"owner/repo"},"title":{"type":"string"},"head":{"type":"string"},"base":{"type":"string"},"body":{"type":"string"},"account":{"type":"string"},"account_identifier":{"type":"string"}},"required":["user_id","repo","title","head"]}',
  'github',
  '{"handler":"github","auth_source":"user_oauth_tokens","provider":"github","operation":"create_pr"}',
  'medium', 1,
  '["*"]', '["agent","multitask"]',
  1, 1, 1,
  unixepoch()
)
ON CONFLICT(tool_key) DO UPDATE SET
  tool_name = excluded.tool_name,
  display_name = excluded.display_name,
  tool_category = excluded.tool_category,
  description = excluded.description,
  input_schema = excluded.input_schema,
  handler_type = excluded.handler_type,
  handler_config = excluded.handler_config,
  risk_level = excluded.risk_level,
  requires_approval = excluded.requires_approval,
  workspace_scope = excluded.workspace_scope,
  modes_json = excluded.modes_json,
  oauth_visible = excluded.oauth_visible,
  is_active = excluded.is_active,
  is_global = excluded.is_global,
  updated_at = unixepoch();

