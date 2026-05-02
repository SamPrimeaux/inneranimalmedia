-- Migration 154: Unify MCP services to canonical endpoint
-- Purpose: Consolidate MCP service routing to one canonical server
-- Date: 2026-03-19
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/154_unify_mcp_services_to_canonical.sql

-- ============================================================================
-- 1) Ensure canonical MCP service row exists
-- ============================================================================
INSERT INTO mcp_services (
  id,
  service_name,
  service_type,
  endpoint_url,
  d1_databases,
  authentication_type,
  token_secret_name,
  requires_oauth,
  is_active,
  health_status,
  metadata,
  created_at,
  updated_at
)
VALUES (
  'inneranimalmedia-mcp',
  'InnerAnimalMedia MCP',
  'mcp-server',
  'https://mcp.inneranimalmedia.com/mcp',
  '["cf87b717-d4e2-4cf8-bab0-a81268e32d49"]',
  'token',
  'MCP_AUTH_TOKEN',
  0,
  1,
  'unverified',
  '{"purpose":"canonical-mcp-endpoint","consolidated":true,"protocol":"2024-11-05"}',
  unixepoch(),
  unixepoch()
)
ON CONFLICT(id) DO UPDATE SET
  service_name = excluded.service_name,
  service_type = excluded.service_type,
  endpoint_url = excluded.endpoint_url,
  d1_databases = excluded.d1_databases,
  authentication_type = excluded.authentication_type,
  token_secret_name = excluded.token_secret_name,
  requires_oauth = excluded.requires_oauth,
  is_active = 1,
  updated_at = unixepoch();

-- ============================================================================
-- 2) Point affected tools to canonical MCP endpoint
-- ============================================================================
UPDATE mcp_registered_tools
SET
  mcp_service_url = 'https://mcp.inneranimalmedia.com/mcp',
  updated_at = datetime('now')
WHERE
  mcp_service_url IN (
    'https://inneranimalmedia.com/api/mcp/a11y',
    'https://inneranimalmedia.com/api/mcp/imgx',
    'https://inneranimalmedia.com/api/mcp/playwright',
    'https://inneranimalmedia.com/api/mcp/cdp',
    'https://inneranimalmedia.com/api/mcp/context',
    'BUILTIN'
  )
  OR tool_name IN (
    'a11y_audit_webpage',
    'a11y_get_summary',
    'imgx_generate_image',
    'imgx_edit_image',
    'imgx_list_providers',
    'playwright_navigate',
    'playwright_screenshot',
    'playwright_click',
    'playwright_fill',
    'playwright_evaluate',
    'playwright_wait_for_selector',
    'playwright_mobile_test',
    'playwright_accessibility_scan',
    'chrome_console_logs',
    'chrome_network_requests',
    'chrome_dom_snapshot',
    'chrome_evaluate',
    'chrome_performance_metrics',
    'chrome_coverage',
    'chrome_js_exceptions',
    'context_optimize',
    'context_search',
    'context_chunk',
    'context_summarize_code',
    'context_extract_structure',
    'context_progressive_disclosure'
  );

-- ============================================================================
-- 3) Deactivate redundant MCP service rows now consolidated
-- ============================================================================
UPDATE mcp_services
SET
  is_active = 0,
  updated_at = unixepoch(),
  metadata = json_set(
    COALESCE(metadata, '{}'),
    '$.consolidated_into',
    'inneranimalmedia-mcp'
  )
WHERE id IN (
  'mcp_a11y_server',
  'mcp_imgx_remote',
  'mcp_playwright_server',
  'mcp_chrome_devtools_server',
  'mcp_context_mem_server'
)
AND id <> 'inneranimalmedia-mcp';
