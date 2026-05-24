-- 387: i-am-inspector-playwright — wire open_target → browser_navigate, capture → browser.capture_context
--
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/387_inspector_playwright_catalog_browser.sql

UPDATE agentsam_workflow_handlers
SET
  executor_kind = 'catalog_tool',
  node_type = 'mcp_tool',
  handler_config_json = json('{
    "tool_key": "browser_navigate",
    "input_map": { "url": "$.url" }
  }'),
  description = 'Navigate browser to target URL via agentsam_tools browser_navigate (catalog dispatch).',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE handler_key = 'playwright_job_create';

UPDATE agentsam_workflow_nodes
SET
  handler_key = 'browser.capture_context',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE workflow_id = 'i-am-inspector-playwright'
  AND node_key = 'capture_evidence'
  AND handler_key = 'playwright_screenshot';
