-- 976: agentsam_search_tools — discovery schema (no Studio D1 resource).
-- Runtime bypasses catalog D1/CF via find_tools meta (dispatch + executor).
-- Schema: query optional; aliases accepted by normalizeFindToolsInput.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/976_agentsam_search_tools_discovery_schema.sql

UPDATE agentsam_tools
SET
  handler_type = 'agent',
  input_schema = json('{
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "Keyword or short phrase to search tool names and descriptions (e.g. github, commits, deploy). Optional — falls back to intent/q/search or the user message."
      },
      "intent": {
        "type": "string",
        "description": "Alternate free-text intent when query is omitted"
      },
      "q": { "type": "string", "description": "Alias for query" },
      "search": { "type": "string", "description": "Alias for query" },
      "limit": {
        "type": "integer",
        "description": "Max tools to return (1-64, default 24)"
      }
    },
    "required": []
  }'),
  description = COALESCE(
    nullif(trim(description), ''),
    'Search the Agent Sam tool catalog by keyword. Discovers tools to hydrate into the session (no Database Studio D1 selection required).'
  ),
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_search_tools';
