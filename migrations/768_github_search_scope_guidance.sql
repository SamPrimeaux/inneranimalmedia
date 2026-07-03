-- 768: GitHub search tools — scoped queries only (repo:owner/name); avoid global /search/code burn.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=migrations/768_github_search_scope_guidance.sql

UPDATE agentsam_tools
SET description = 'READ ONLY — search code in a scoped repo (repo:owner/name required). GitHub limits code search to 10 req/min; prefer github_get_tree or github_list_commits for browsing.',
    handler_config = json_set(
      COALESCE(handler_config, '{}'),
      '$.operation',
      'search_code'
    ),
    updated_at = unixepoch()
WHERE tool_key IN (
  'agentsam_github_search',
  'agentsam_github_search_code',
  'github_search'
);

UPDATE agentsam_tools
SET description = 'READ ONLY — search issues/PRs with repo:owner/name or user:/org: qualifiers. Prefer github_list_issues for a known repo.',
    updated_at = unixepoch()
WHERE tool_key IN (
  'agentsam_github_search_issues',
  'agentsam_github_search_issues_prs'
);
