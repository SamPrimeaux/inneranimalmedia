-- 386: Browser / CDT dispatch routes → gemini-3-flash-preview (native computer-use tier).
-- Pairs with agentsam_prompt_routes.route_key = 'browser' (preferred_model already set).
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/386_browser_routing_gemini3_flash.sql

-- Primary: gemini-3-flash-preview (Thompson warm prior + high priority)
INSERT OR REPLACE INTO agentsam_routing_arms (
  id, task_type, mode, model_key, provider, workspace_id,
  success_alpha, success_beta, decayed_score,
  is_eligible, is_paused, is_active, budget_exhausted,
  supports_tools, priority, total_executions,
  tools_json, workflow_agent, reasoning_effort,
  model_catalog_id, last_decay_at, updated_at
) VALUES
('ra_browser_gemini3_flash_ws', 'browser', 'agent', 'gemini-3-flash-preview', 'google', 'ws_inneranimalmedia',
 2.5, 1.0, 0.92,
 1, 0, 1, 0,
 1, 220, 0,
 '["browser_navigate","cdt_take_snapshot","browser_content","cdt_take_screenshot"]',
 'browser_computer_use', 'medium', 'mdl_368f995d20cc', unixepoch(), unixepoch()),
('ra_browser_gemini3_flash_g', 'browser', 'agent', 'gemini-3-flash-preview', 'google', '',
 2.5, 1.0, 0.92,
 1, 0, 1, 0,
 1, 220, 0,
 '["browser_navigate","cdt_take_snapshot","browser_content","cdt_take_screenshot"]',
 'browser_computer_use', 'medium', 'mdl_368f995d20cc', unixepoch(), unixepoch()),
('ra_browser_ui_repair_gemini3_ws', 'browser_ui_repair', 'agent', 'gemini-3-flash-preview', 'google', 'ws_inneranimalmedia',
 2.5, 1.0, 0.90,
 1, 0, 1, 0,
 1, 210, 0,
 '["browser_navigate","cdt_take_snapshot","browser_content","cdt_take_screenshot","workspace_read_file"]',
 'browser_computer_use', 'medium', 'mdl_368f995d20cc', unixepoch(), unixepoch()),
('ra_browser_ui_repair_gemini3_g', 'browser_ui_repair', 'agent', 'gemini-3-flash-preview', 'google', '',
 2.5, 1.0, 0.90,
 1, 0, 1, 0,
 1, 210, 0,
 '["browser_navigate","cdt_take_snapshot","browser_content","cdt_take_screenshot","workspace_read_file"]',
 'browser_computer_use', 'medium', 'mdl_368f995d20cc', unixepoch(), unixepoch());

-- Fallback arms (lower priority — Thompson can promote gemini when ETO signal arrives)
INSERT OR IGNORE INTO agentsam_routing_arms (
  id, task_type, mode, model_key, provider, workspace_id,
  success_alpha, success_beta, decayed_score,
  is_eligible, is_paused, is_active, budget_exhausted,
  supports_tools, priority, total_executions,
  tools_json, workflow_agent, reasoning_effort,
  last_decay_at, updated_at
) VALUES
('ra_browser_fallback_mini_ws', 'browser', 'agent', 'gpt-5.4-mini', 'openai', 'ws_inneranimalmedia',
 1.0, 1.0, 0.75,
 1, 0, 1, 0,
 1, 80, 0,
 '["browser_navigate","cdt_take_snapshot","browser_content"]',
 'browser_computer_use', 'medium', unixepoch(), unixepoch()),
('ra_browser_ui_repair_fallback_mini_ws', 'browser_ui_repair', 'agent', 'gpt-5.4-mini', 'openai', 'ws_inneranimalmedia',
 1.0, 1.0, 0.72,
 1, 0, 1, 0,
 1, 70, 0,
 '["browser_navigate","cdt_take_snapshot","browser_content"]',
 'browser_computer_use', 'medium', unixepoch(), unixepoch());

UPDATE agentsam_prompt_routes
SET preferred_model = 'gemini-3-flash-preview',
    fallback_model = COALESCE(NULLIF(TRIM(fallback_model), ''), 'gpt-5.4-mini'),
    updated_at = unixepoch()
WHERE route_key = 'browser';
