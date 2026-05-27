-- 428: agentsam_plan — allow {} for active-plan read (goal optional on create).
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/428_fix_agentsam_plan_input_schema.sql

UPDATE agentsam_tools
SET
  description = 'Read the latest active plan and tasks for this workspace, or create a new plan when goal is provided.',
  input_schema = '{"type":"object","properties":{"goal":{"type":"string","description":"When set, creates a new agentsam_plans row for this workspace."},"title":{"type":"string","description":"Optional title when creating a plan (defaults from goal)."},"context":{"type":"string","description":"Optional context stored in session_notes on create."},"create":{"type":"boolean","description":"Set true with goal to force create even if a plan already exists."}}}',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_plan';

-- Align notify copy with local D1 handler (message still required for writes).
UPDATE agentsam_tools
SET
  description = 'Send a dashboard notification (local D1). Use channel=dashboard; email queues are not wired on MCP yet.',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_notify';
