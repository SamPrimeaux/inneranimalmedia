-- 563: Gemini 3.x picker + routing cleanup (retire 2.5 from picker/auto arms).
-- Superseded by 564_google_gemini3_lane_map.sql (564 is idempotent superset). Prefer applying 564 only.

-- Fix dispatch platform (worker maps google_ai_studio → gemini_api; catalog uses gemini_api).
UPDATE agentsam_ai
SET api_platform = 'gemini_api', updated_at = unixepoch()
WHERE model_key = 'gemini-3.5-flash';

-- Hide deprecated 2.5 models from composer picker.
UPDATE agentsam_ai
SET show_in_picker = 0, updated_at = unixepoch()
WHERE model_key IN ('gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro');

-- Retire 2.5 Pro from active picker surface (keep row for legacy run resolution).
UPDATE agentsam_ai
SET status = 'deprecated', updated_at = unixepoch()
WHERE model_key = 'gemini-2.5-pro' AND status = 'active';

-- Enable Gemini 3.5 Flash for Auto/Thompson on primary workspace.
UPDATE agentsam_routing_arms
SET is_paused = 0, pause_reason = NULL, updated_at = unixepoch()
WHERE workspace_id = 'ws_inneranimalmedia'
  AND model_key = 'gemini-3.5-flash'
  AND task_type IN ('chat', 'agent', 'code', 'sql', 'plan')
  AND id IN (
    'ra_balanced_35flash',
    'ra_gemini35_chat_agent',
    'ra_gemini35_chat_auto',
    'ra_code_35flash',
    'ra_sql_35flash',
    'ra_gemini35_plan_agent'
  );

-- Pause legacy 2.5 Flash agent arm (Google deprecation path).
UPDATE agentsam_routing_arms
SET is_paused = 1, pause_reason = 'gemini_2x_deprecation', updated_at = unixepoch()
WHERE id = 'ra_agent_agent_gemini_flash_ws';
