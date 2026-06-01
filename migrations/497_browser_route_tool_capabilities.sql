-- Align browser route with file/github/D1 evidence capabilities (D1 SSOT — not hardcoded tool names in Worker).
-- Merges into optional_capability_keys_json for route_key = browser.
--
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/497_browser_route_tool_capabilities.sql

UPDATE agentsam_route_requirements
SET
  optional_capability_keys_json = '[
    "browser.navigate","browser.inspect","browser_navigate","browser_content","cdt_take_snapshot",
    "context.search","workspace_read_file","workspace_search","code.search","file.read","grep",
    "github.read","github.write","github_file","github_repos","d1.read","d1_query","d1.schema"
  ]',
  allowed_lanes_json = '["inspect","develop","research"]',
  requires_tools = 1,
  max_tools = COALESCE(max_tools, 8)
WHERE route_key = 'browser'
  AND is_active = 1;
