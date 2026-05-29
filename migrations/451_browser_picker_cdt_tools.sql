-- 451: Restore BrowserView picker CDT tools missing from agentsam_tools (production gap).
-- Symptom: dashboard toast "Picker needs cdt_evaluate_script in agentsam_tools for this workspace."
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/451_browser_picker_cdt_tools.sql

-- ── 1. Global browser picker tools (workspace_scope * — all workspaces) ─────
INSERT OR IGNORE INTO agentsam_tools (
  id, tool_name, tool_key, display_name, tool_category, handler_type,
  description, handler_config, risk_level, requires_approval,
  is_active, is_degraded, workspace_scope, is_global, updated_at
) VALUES
(
  'ast_cdt_evaluate_script_global',
  'cdt_evaluate_script', 'cdt_evaluate_script', 'CDT Evaluate Script', 'browser.debug.script', 'mybrowser',
  'Run JavaScript in page context for element picker injection and approved debugging.',
  '{"dispatcher":"cdt_evaluate_script","source_file":"src/tools/builtin/web.js"}',
  'medium', 0, 1, 0, '["*"]', 1, unixepoch()
),
(
  'ast_cdt_list_console_global',
  'cdt_list_console_messages', 'cdt_list_console_messages', 'CDT List Console', 'browser', 'mybrowser',
  'List console messages from the active browser session.',
  '{"dispatcher":"cdt_list_console_messages","source_file":"src/tools/builtin/web.js"}',
  'low', 0, 1, 0, '["*"]', 1, unixepoch()
),
(
  'ast_cdt_list_network_global',
  'cdt_list_network_requests', 'cdt_list_network_requests', 'CDT List Network', 'browser', 'mybrowser',
  'List network requests from the active browser session.',
  '{"dispatcher":"cdt_list_network_requests","source_file":"src/tools/builtin/web.js"}',
  'low', 0, 1, 0, '["*"]', 1, unixepoch()
),
(
  'ast_cdt_take_screenshot_global',
  'cdt_take_screenshot', 'cdt_take_screenshot', 'CDT Screenshot', 'browser.capture', 'mybrowser',
  'DevTools-backed screenshot including JS-rendered content.',
  '{"dispatcher":"cdt_take_screenshot","source_file":"src/tools/builtin/web.js"}',
  'low', 0, 1, 0, '["*"]', 1, unixepoch()
),
(
  'ast_playwright_screenshot_global',
  'playwright_screenshot', 'playwright_screenshot', 'Playwright Screenshot', 'browser.capture', 'mybrowser',
  'Full Playwright screenshot job for visual proof and layout review.',
  '{"dispatcher":"playwright_screenshot","source_file":"src/tools/builtin/web.js"}',
  'low', 0, 1, 0, '["*"]', 1, unixepoch()
),
(
  'ast_cdt_hover_global',
  'cdt_hover', 'cdt_hover', 'CDT Hover', 'browser', 'mybrowser',
  'Hover element for picker and hover-state UI inspection.',
  '{"dispatcher":"cdt_hover","source_file":"src/tools/builtin/web.js"}',
  'low', 0, 1, 0, '["*"]', 1, unixepoch()
),
(
  'ast_cdt_navigate_page_global',
  'cdt_navigate_page', 'cdt_navigate_page', 'CDT Navigate Page', 'browser', 'mybrowser',
  'Navigate browser tab to URL (CDT lane).',
  '{"dispatcher":"cdt_navigate_page","source_file":"src/tools/builtin/web.js"}',
  'low', 0, 1, 0, '["*"]', 1, unixepoch()
);

-- Repair rows if a partial/stale row exists (ensure active + global scope)
UPDATE agentsam_tools
SET
  tool_key = COALESCE(NULLIF(trim(tool_key), ''), tool_name),
  handler_type = 'mybrowser',
  workspace_scope = '["*"]',
  is_active = 1,
  is_degraded = 0,
  is_global = 1,
  updated_at = unixepoch()
WHERE tool_name IN (
  'cdt_evaluate_script',
  'cdt_list_console_messages',
  'cdt_list_network_requests',
  'cdt_take_screenshot',
  'playwright_screenshot',
  'cdt_hover',
  'cdt_navigate_page',
  'cdt_take_snapshot',
  'browser_navigate',
  'browser_content',
  'browser_close_session'
);

-- ── 2. Owner profiles: full policy on primary dashboard workspace ───────────
INSERT OR IGNORE INTO agentsam_user_policy (
  user_id, workspace_id, tenant_id,
  can_run_pty, tool_risk_level_max, require_allowlist_for_mcp,
  auto_run_mode, terminal_ai_enabled, updated_at
)
SELECT
  u.id,
  'ws_inneranimalmedia',
  'tenant_sam_primeaux',
  1,
  'critical',
  0,
  'allowlist',
  1,
  datetime('now')
FROM auth_users u
WHERE COALESCE(u.is_superadmin, 0) = 1
  AND u.tenant_id = 'tenant_sam_primeaux';

UPDATE agentsam_user_policy
SET
  can_run_pty = 1,
  tool_risk_level_max = 'critical',
  require_allowlist_for_mcp = 0,
  terminal_ai_enabled = 1,
  tenant_id = COALESCE(NULLIF(trim(tenant_id), ''), 'tenant_sam_primeaux'),
  updated_at = datetime('now')
WHERE user_id IN (
  SELECT id FROM auth_users
  WHERE COALESCE(is_superadmin, 0) = 1 AND tenant_id = 'tenant_sam_primeaux'
)
AND workspace_id = 'ws_inneranimalmedia';
