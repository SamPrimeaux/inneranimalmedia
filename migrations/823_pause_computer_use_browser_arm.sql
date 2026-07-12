-- 823: Pause Gemini Computer Use arm until Computer Use tool is wired in the agent loop.
-- Also: any https:// paste was false-positive browser → this model → Gemini 400.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/823_pause_computer_use_browser_arm.sql

UPDATE agentsam_routing_arms SET
  is_paused = 1,
  pause_reason = 'requires_computer_use_tool_not_in_agent_loop_2026-07-11',
  updated_at = unixepoch()
WHERE id = 'ra_browser_computer_use_ws'
   OR model_key = 'models/gemini-2.5-computer-use-preview-10-2025';
