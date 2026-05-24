-- 404: Expand OAuth external allowlist + github_create_repo; refresh OAuth token tool JSON.

INSERT OR IGNORE INTO agentsam_mcp_oauth_tool_allowlist (client_id, tool_key, access_class, sort_order, notes) VALUES
  ('iam_mcp_inneranimalmedia', 'd1_write', 'write', 15, 'Scoped INSERT/UPDATE/DELETE — SQL must include tenant_id or workspace_id'),
  ('iam_mcp_inneranimalmedia', 'github_merge_pr', 'write', 113, 'Merge PR in workspace-bound repo only'),
  ('iam_mcp_inneranimalmedia', 'github_create_repo', 'write', 114, 'Create repo on the authenticated user''s GitHub account');

-- github_repos is the registry key for "list my repos" (alias: github_repo_list).
INSERT OR IGNORE INTO agentsam_mcp_oauth_tool_allowlist (client_id, tool_key, access_class, sort_order, notes) VALUES
  ('iam_mcp_inneranimalmedia', 'github_repos', 'read', 38, 'List repos for connected GitHub user (github_repo_list)');

INSERT OR IGNORE INTO agentsam_mcp_tools (
  id, user_id, tool_key, tool_name, display_name, tool_category, description,
  input_schema, handler_type, handler_config, modes_json, is_active, enabled, risk_level, requires_approval
) VALUES (
  'amt_oauth_github_create_repo',
  '',
  'github_create_repo',
  'github_create_repo',
  'GitHub create repository',
  'github',
  'Create a new repository on the authenticated user''s GitHub account (OAuth token).',
  '{"type":"object","properties":{"name":{"type":"string"},"private":{"type":"boolean"},"description":{"type":"string"},"auto_init":{"type":"boolean"}},"required":["name"]}',
  'github',
  '{"operation":"create_repo"}',
  '["auto","agent","debug"]',
  1,
  1,
  'medium',
  1
);

UPDATE mcp_workspace_tokens
SET allowed_tools = (
  SELECT COALESCE(json_group_array(tool_key), '[]')
  FROM (
    SELECT tool_key
    FROM agentsam_mcp_oauth_tool_allowlist
    WHERE client_id = 'iam_mcp_inneranimalmedia'
      AND COALESCE(is_active, 1) = 1
    ORDER BY sort_order ASC, tool_key ASC
  )
)
WHERE token_type = 'oauth'
  AND COALESCE(is_active, 1) = 1;
