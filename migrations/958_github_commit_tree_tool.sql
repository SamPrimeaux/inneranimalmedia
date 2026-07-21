-- 958: agentsam_github_commit_tree — atomic multi-file Git Data API commit.
-- Prefer over N× agentsam_github_write. Still use terminal+git for binary / scaffolds / push.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=migrations/958_github_commit_tree_tool.sql

INSERT OR IGNORE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category,
  description, input_schema,
  handler_type, handler_config,
  risk_level, requires_approval,
  workspace_scope, modes_json,
  oauth_visible, is_active, is_global,
  sort_priority, updated_at
)
VALUES (
  'ast_github_commit_tree',
  'agentsam_github_commit_tree',
  'agentsam_github_commit_tree',
  'GitHub Commit Tree',
  'github.write',
  'Atomic multi-file commit via Git Data API (blobs→tree→commit→ref). Pass files[{path,content}] + message. Max 50 UTF-8 text files. Prefer this over multiple agentsam_github_write calls. Binary assets, git push, and scaffolds: use terminal + git over SSH.',
  '{"type":"object","additionalProperties":false,"properties":{"repo":{"type":"string","description":"owner/repo"},"message":{"type":"string"},"files":{"type":"array","minItems":1,"maxItems":50,"items":{"type":"object","additionalProperties":false,"properties":{"path":{"type":"string"},"content":{"type":"string"}},"required":["path","content"]}},"branch":{"type":"string"}},"required":["repo","message","files"]}',
  'github',
  '{"auth_source":"user_oauth_tokens","provider":"github","operation":"commit_tree"}',
  'medium', 0,
  '["*"]', '["ask","plan","debug","agent","multitask"]',
  1, 1, 1,
  125, unixepoch()
);

UPDATE agentsam_tools
SET
  tool_key = 'agentsam_github_commit_tree',
  display_name = 'GitHub Commit Tree',
  tool_category = 'github.write',
  description = 'Atomic multi-file commit via Git Data API (blobs→tree→commit→ref). Pass files[{path,content}] + message. Max 50 UTF-8 text files. Prefer this over multiple agentsam_github_write calls. Binary assets, git push, and scaffolds: use terminal + git over SSH.',
  input_schema = '{"type":"object","additionalProperties":false,"properties":{"repo":{"type":"string","description":"owner/repo"},"message":{"type":"string"},"files":{"type":"array","minItems":1,"maxItems":50,"items":{"type":"object","additionalProperties":false,"properties":{"path":{"type":"string"},"content":{"type":"string"}},"required":["path","content"]}},"branch":{"type":"string"}},"required":["repo","message","files"]}',
  handler_type = 'github',
  handler_config = '{"auth_source":"user_oauth_tokens","provider":"github","operation":"commit_tree"}',
  risk_level = 'medium',
  requires_approval = 0,
  oauth_visible = 1,
  is_active = 1,
  is_global = 1,
  sort_priority = 125,
  updated_at = unixepoch()
WHERE tool_name = 'agentsam_github_commit_tree'
   OR tool_key = 'agentsam_github_commit_tree';

UPDATE agentsam_tools
SET
  description = 'Single UTF-8 text file create/update via Contents API. Omit sha for new files. For multiple files in one commit use agentsam_github_commit_tree. Binary / scaffolds / push: terminal + git over SSH.',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_github_write';

UPDATE agentsam_mcp_oauth_tool_allowlist
SET
  is_active = 1,
  expose_on_connector = 1,
  connector_priority = 125,
  access_class = 'write',
  runtime_contract_key = 'agentsam_github_commit_tree',
  notes = 'Atomic multi-file Git Data API commit',
  updated_at = unixepoch()
WHERE client_id = 'iam_mcp_inneranimalmedia'
  AND tool_key = 'agentsam_github_commit_tree';

INSERT INTO agentsam_mcp_oauth_tool_allowlist (
  client_id,
  tool_key,
  is_active,
  expose_on_connector,
  connector_priority,
  access_class,
  runtime_contract_key,
  notes,
  updated_at
)
SELECT
  'iam_mcp_inneranimalmedia',
  'agentsam_github_commit_tree',
  1,
  1,
  125,
  'write',
  'agentsam_github_commit_tree',
  'Atomic multi-file Git Data API commit',
  unixepoch()
WHERE NOT EXISTS (
  SELECT 1 FROM agentsam_mcp_oauth_tool_allowlist
  WHERE client_id = 'iam_mcp_inneranimalmedia'
    AND tool_key = 'agentsam_github_commit_tree'
);

UPDATE agentsam_rules_document
SET
  body_markdown = REPLACE(
    COALESCE(body_markdown, ''),
    '| One UTF-8 text file create/update | `agentsam_github_write` (omit sha on create) |',
    '| One UTF-8 text file create/update | `agentsam_github_write` (omit sha on create) |
| Multiple UTF-8 text files, one commit | `agentsam_github_commit_tree` (files[{path,content}] + message) |'
  ),
  updated_at_epoch = unixepoch()
WHERE id = 'rule_github_ssh_git_workflow'
  AND body_markdown NOT LIKE '%agentsam_github_commit_tree%';

UPDATE agentsam_rules_document
SET
  body_markdown = body_markdown || CASE
    WHEN body_markdown LIKE '%agentsam_github_commit_tree%' THEN ''
    WHEN body_markdown LIKE '%agentsam_github_write%' THEN char(10) || '- `agentsam_github_commit_tree`: atomic multi-file text commit via Git Data API (max 50 paths)'
    ELSE ''
  END,
  updated_at_epoch = unixepoch()
WHERE id = 'rule_github_ssh_git_workflow';
