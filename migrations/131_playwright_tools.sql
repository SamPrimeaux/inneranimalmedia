-- 131: Register Playwright/browser screenshot tools for Agent Sam (Phase 2.6)
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/131_playwright_tools.sql
-- Purpose: Model can call playwright_screenshot and browser_screenshot; executed via BUILTIN/internal handler.

INSERT OR IGNORE INTO mcp_registered_tools (
  id,
  tool_name,
  tool_category,
  mcp_service_url,
  description,
  input_schema,
  requires_approval,
  enabled,
  created_at,
  updated_at
) VALUES
  (
    'playwright_screenshot',
    'playwright_screenshot',
    'browser',
    'BUILTIN',
    'Capture screenshot of a webpage using Playwright',
    '{"url": "string (required)", "selector": "string (optional CSS selector)", "fullPage": "boolean (optional, default false)"}',
    0,
    1,
    unixepoch(),
    unixepoch()
  ),
  (
    'browser_screenshot',
    'browser_screenshot',
    'browser',
    'BUILTIN',
    'Capture screenshot via browser rendering (faster, cached)',
    '{"url": "string (required)"}',
    0,
    1,
    unixepoch(),
    unixepoch()
  );
