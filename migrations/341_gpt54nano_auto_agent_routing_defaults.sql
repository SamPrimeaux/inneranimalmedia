-- 341: Default chat routing for auto/agent modes → gpt-5.4-nano.
-- Updates existing arms by id (no INSERT — unique on workspace_id+task_type+mode+model_key).
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/341_gpt54nano_auto_agent_routing_defaults.sql

UPDATE agentsam_routing_arms
SET model_key = 'gpt-5.4-nano',
    provider = 'openai',
    decayed_score = CASE WHEN COALESCE(decayed_score, 0) < 0.95 THEN 0.95 ELSE decayed_score END,
    is_eligible = 1,
    is_paused = 0,
    updated_at = unixepoch()
WHERE id IN (
  'ra_chat_auto_gpt54mini_g',
  'ra_chat_agent_gpt54mini_g',
  'ra_chat_agent_gpt54mini_ws'
);

-- ws_inneranimalmedia auto: ra_nano_chat_gateway already owns (chat, auto, gpt-5.4-nano) — retire mini duplicate instead of retargeting.
UPDATE agentsam_routing_arms
SET is_eligible = 0,
    is_paused = 1,
    updated_at = unixepoch()
WHERE id = 'ra_chat_auto_gpt54mini_ws';

-- Workspace already has ra_nano_chat_gateway (auto + nano): boost it and pause any other auto mini arms.
UPDATE agentsam_routing_arms
SET decayed_score = 0.95,
    priority = 100,
    is_eligible = 1,
    is_paused = 0,
    updated_at = unixepoch()
WHERE id = 'ra_nano_chat_gateway';

UPDATE agentsam_routing_arms
SET is_eligible = 0,
    is_paused = 1,
    updated_at = unixepoch()
WHERE workspace_id = 'ws_inneranimalmedia'
  AND task_type = 'chat'
  AND mode = 'auto'
  AND model_key = 'gpt-5.4-mini'
  AND id != 'ra_nano_chat_gateway';

UPDATE agentsam_model_catalog SET
  api_platform = 'openai_responses',
  openai_model_id = COALESCE(NULLIF(TRIM(openai_model_id), ''), 'gpt-5.4-nano'),
  supports_tools = COALESCE(supports_tools, 1),
  supports_streaming = COALESCE(supports_streaming, 1),
  is_active = 1
WHERE lower(trim(model_key)) = 'gpt-5.4-nano';

UPDATE agentsam_workspace
SET default_model_id = 'gpt-5.4-nano',
    updated_at = unixepoch()
WHERE id = 'ws_inneranimalmedia';

UPDATE agentsam_bootstrap
SET ui_preferences_json = json_set(COALESCE(ui_preferences_json, '{}'), '$.default_model', 'gpt-5.4-nano'),
    updated_at = datetime('now')
WHERE COALESCE(is_active, 1) = 1;

UPDATE agentsam_ai
SET sort_order = 5,
    picker_group = COALESCE(NULLIF(TRIM(picker_group), ''), 'OPENAI'),
    show_in_picker = 1,
    picker_eligible = 1,
    updated_at = unixepoch()
WHERE model_key = 'gpt-5.4-nano'
  AND mode = 'model';
