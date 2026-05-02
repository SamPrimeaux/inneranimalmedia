-- 174: Register Cursor Cloud Agents builtin tools (reference — skip if rows already seeded in D1).
-- agentsam_run_agent: requires_approval = 1. agentsam_get_agent / agentsam_list_agents: no approval.
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=migrations/174_mcp_cursor_cloud_agent_tools.sql

INSERT OR IGNORE INTO mcp_registered_tools (
  id,
  tool_name,
  tool_category,
  mcp_service_url,
  description,
  input_schema,
  requires_approval,
  enabled,
  cost_per_call_usd,
  created_at,
  updated_at
) VALUES
(
  'agentsam_run_agent',
  'agentsam_run_agent',
  'integrations',
  'BUILTIN',
  'Launch an async Cursor Cloud coding agent on a GitHub repository branch. Spawns work on Cursor infrastructure; poll with agentsam_get_agent. Requires user approval before execution.',
  '{"type":"object","properties":{"prompt":{"type":"string","description":"Task instructions for the agent"},"model":{"type":"string","description":"Cursor model slug, default claude-4.6-opus-high-thinking"},"repo":{"type":"string","description":"GitHub repo HTTPS URL"},"repository":{"type":"string","description":"Alias for repo"},"ref":{"type":"string","description":"Git ref, default main"}},"required":["prompt"],"additionalProperties":false}',
  1,
  1,
  0,
  datetime('now'),
  datetime('now')
),
(
  'agentsam_get_agent',
  'agentsam_get_agent',
  'integrations',
  'BUILTIN',
  'GET status for a Cursor Cloud agent by id (poll until FINISHED / FAILED).',
  '{"type":"object","properties":{"agent_id":{"type":"string","description":"Agent id from agentsam_run_agent (e.g. bc_abc123)"},"id":{"type":"string","description":"Alias for agent_id"}},"required":["agent_id"],"additionalProperties":false}',
  0,
  1,
  0,
  datetime('now'),
  datetime('now')
),
(
  'agentsam_list_agents',
  'agentsam_list_agents',
  'integrations',
  'BUILTIN',
  'List recent Cursor Cloud agents (paginated, limit 1–100, default 10).',
  '{"type":"object","properties":{"limit":{"type":"number","description":"Max agents to return, default 10, max 100"}},"additionalProperties":false}',
  0,
  1,
  0,
  datetime('now'),
  datetime('now')
);
