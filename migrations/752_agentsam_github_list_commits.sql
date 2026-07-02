-- 752: Add agentsam_github_list_commits — list recent commits on a branch/ref.
--
-- Fixes Agent Sam "list my last N commits" requests where only agentsam_github_search
-- (code search) was available and the model correctly reported no commit-history tool.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=migrations/752_agentsam_github_list_commits.sql

INSERT OR IGNORE INTO agentsam_tools
  (id, tool_key, tool_name, display_name, tool_category,
   description, input_schema,
   handler_type, handler_config,
   risk_level, requires_approval,
   workspace_scope, modes_json,
   oauth_visible, dispatch_target, is_active, is_global,
   sort_priority, updated_at)
VALUES
(
  'ast_agentsam_github_list_commits',
  'agentsam_github_list_commits',
  'agentsam_github_list_commits',
  'GitHub List Commits',
  'github.read',
  'READ ONLY — list recent commits for a repository branch or ref (GitHub Commits API). Use for "last N commits", git log, or recent history on main.',
  '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"repo":{"type":"string","description":"owner/repo","default":"SamPrimeaux/inneranimalmedia"},"sha":{"type":"string","description":"Branch, tag, or commit SHA (default main)"},"ref":{"type":"string","description":"Alias for sha"},"branch":{"type":"string","description":"Alias for sha"},"limit":{"type":"integer","minimum":1,"maximum":100,"default":30,"description":"Max commits to return"}},"required":["user_id","repo"]}',
  'github',
  '{"auth_source":"user_oauth_tokens","provider":"github","operation":"list_commits","repo_field":"workspace.github_repo"}',
  'low', 0,
  '["*"]', '["ask","plan","debug","agent","multitask"]',
  1, 'both', 1, 1,
  42, unixepoch()
);

UPDATE agentsam_tools
SET tool_key = 'agentsam_github_list_commits',
    display_name = 'GitHub List Commits',
    tool_category = 'github.read',
    description = 'READ ONLY — list recent commits for a repository branch or ref (GitHub Commits API). Use for "last N commits", git log, or recent history on main.',
    input_schema = '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":"string"},"repo":{"type":"string","description":"owner/repo","default":"SamPrimeaux/inneranimalmedia"},"sha":{"type":"string","description":"Branch, tag, or commit SHA (default main)"},"ref":{"type":"string","description":"Alias for sha"},"branch":{"type":"string","description":"Alias for sha"},"limit":{"type":"integer","minimum":1,"maximum":100,"default":30,"description":"Max commits to return"}},"required":["user_id","repo"]}',
    handler_type = 'github',
    handler_config = '{"auth_source":"user_oauth_tokens","provider":"github","operation":"list_commits","repo_field":"workspace.github_repo"}',
    risk_level = 'low',
    requires_approval = 0,
    workspace_scope = '["*"]',
    modes_json = '["ask","plan","debug","agent","multitask"]',
    oauth_visible = 1,
    dispatch_target = 'both',
    is_active = 1,
    is_global = 1,
    sort_priority = 42,
    updated_at = unixepoch()
WHERE tool_name = 'agentsam_github_list_commits';

INSERT OR IGNORE INTO agentsam_mcp_oauth_tool_allowlist
  (client_id, tool_key, access_class, sort_order, is_active)
VALUES
  ('iam_mcp_inneranimalmedia', 'agentsam_github_list_commits', 'read', 41, 1);
