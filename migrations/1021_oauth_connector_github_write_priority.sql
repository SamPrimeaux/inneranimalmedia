-- 1021: Promote clean GitHub write tools into OAuth connector top-40 via D1 priority.
-- SSOT is agentsam_mcp_oauth_tool_allowlist.connector_priority — no JS pin arrays.
-- Prior bug: write/patch/pr/issue sat at 130–150 and fell past CONNECTOR_TOOL_SURFACE_MAX (40).
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/1021_oauth_connector_github_write_priority.sql

UPDATE agentsam_mcp_oauth_tool_allowlist
SET
  connector_priority = CASE tool_key
    WHEN 'agentsam_github_write' THEN 7
    WHEN 'agentsam_github_commit_tree' THEN 8
    WHEN 'agentsam_github_patch' THEN 9
    WHEN 'agentsam_github_pr' THEN 10
    WHEN 'agentsam_github_issue' THEN 11
    WHEN 'agentsam_github_repo_list' THEN 16
    WHEN 'agentsam_github_read' THEN 17
    WHEN 'agentsam_github_tree' THEN 18
    WHEN 'agentsam_github_read_many' THEN 19
    WHEN 'agentsam_github_list_commits' THEN 21
    WHEN 'agentsam_github_search' THEN 23
    WHEN 'agentsam_github_grep' THEN 24
    ELSE connector_priority
  END,
  access_class = CASE
    WHEN tool_key IN (
      'agentsam_github_write',
      'agentsam_github_commit_tree',
      'agentsam_github_patch',
      'agentsam_github_pr',
      'agentsam_github_issue'
    ) THEN 'write'
    WHEN tool_key IN (
      'agentsam_github_repo_list',
      'agentsam_github_read',
      'agentsam_github_tree',
      'agentsam_github_read_many',
      'agentsam_github_list_commits',
      'agentsam_github_search',
      'agentsam_github_grep'
    ) THEN 'read'
    ELSE access_class
  END,
  expose_on_connector = 1,
  is_active = 1,
  updated_at = unixepoch()
WHERE tool_key IN (
  'agentsam_github_write',
  'agentsam_github_commit_tree',
  'agentsam_github_patch',
  'agentsam_github_pr',
  'agentsam_github_issue',
  'agentsam_github_repo_list',
  'agentsam_github_read',
  'agentsam_github_tree',
  'agentsam_github_read_many',
  'agentsam_github_list_commits',
  'agentsam_github_search',
  'agentsam_github_grep'
);
