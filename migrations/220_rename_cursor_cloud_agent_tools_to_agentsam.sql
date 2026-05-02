-- 220: Rename Cursor Cloud builtin tool ids from cursor_* to agentsam_* (align with worker.js).
-- Safe to run on prod after worker deploy; no-ops if old ids already migrated.
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=migrations/220_rename_cursor_cloud_agent_tools_to_agentsam.sql

-- mcp_registered_tools: primary key + unique tool_name
UPDATE mcp_registered_tools SET
  id = 'agentsam_run_agent',
  tool_name = 'agentsam_run_agent',
  description = 'Launch an async Cursor Cloud coding agent on a GitHub repository branch. Spawns work on Cursor infrastructure; poll with agentsam_get_agent. Requires user approval before execution.',
  input_schema = '{"type":"object","properties":{"prompt":{"type":"string","description":"Task instructions for the agent"},"model":{"type":"string","description":"Cursor model slug, default claude-4.6-opus-high-thinking"},"repo":{"type":"string","description":"GitHub repo HTTPS URL"},"repository":{"type":"string","description":"Alias for repo"},"ref":{"type":"string","description":"Git ref, default main"}},"required":["prompt"],"additionalProperties":false}',
  updated_at = datetime('now')
WHERE id = 'cursor_run_agent';

UPDATE mcp_registered_tools SET
  id = 'agentsam_get_agent',
  tool_name = 'agentsam_get_agent',
  description = 'GET status for a Cursor Cloud agent by id (poll until FINISHED / FAILED).',
  input_schema = '{"type":"object","properties":{"agent_id":{"type":"string","description":"Agent id from agentsam_run_agent (e.g. bc_abc123)"},"id":{"type":"string","description":"Alias for agent_id"}},"required":["agent_id"],"additionalProperties":false}',
  updated_at = datetime('now')
WHERE id = 'cursor_get_agent';

UPDATE mcp_registered_tools SET
  id = 'agentsam_list_agents',
  tool_name = 'agentsam_list_agents',
  description = 'List recent Cursor Cloud agents (paginated, limit 1–100, default 10).',
  updated_at = datetime('now')
WHERE id = 'cursor_list_agents';

-- Per-user allowlist keys
UPDATE agentsam_mcp_allowlist SET tool_key = 'agentsam_run_agent' WHERE tool_key = 'cursor_run_agent';
UPDATE agentsam_mcp_allowlist SET tool_key = 'agentsam_get_agent' WHERE tool_key = 'cursor_get_agent';
UPDATE agentsam_mcp_allowlist SET tool_key = 'agentsam_list_agents' WHERE tool_key = 'cursor_list_agents';

-- Skill markdown may list tool names (order: longest substring first to avoid partial matches)
UPDATE agentsam_skill SET content_markdown = replace(content_markdown, 'cursor_list_agents', 'agentsam_list_agents') WHERE content_markdown LIKE '%cursor_list_agents%';
UPDATE agentsam_skill SET content_markdown = replace(content_markdown, 'cursor_get_agent', 'agentsam_get_agent') WHERE content_markdown LIKE '%cursor_get_agent%';
UPDATE agentsam_skill SET content_markdown = replace(content_markdown, 'cursor_run_agent', 'agentsam_run_agent') WHERE content_markdown LIKE '%cursor_run_agent%';
