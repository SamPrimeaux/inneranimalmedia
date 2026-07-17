-- 925: Canonical agentsam_d1_query contract for in-app + MCP parity.
-- sql required; targeting via database (name) OR database_id (UUID) OR resource_ref.
-- Replaces migration 917's required=["database_id","sql"] which forced UUID-only prompting.

UPDATE agentsam_tools
SET description = 'Query Cloudflare D1. Require sql. Prefer database (CF D1 name, e.g. inneranimalmedia-business). Optional database_id UUID or resource_ref. workspace_slug is deprecated.',
    input_schema = json('{
  "type": "object",
  "additionalProperties": false,
  "required": ["sql"],
  "properties": {
    "sql": {
      "type": "string",
      "description": "Read-only SELECT / WITH … SELECT / EXPLAIN for D1."
    },
    "database": {
      "type": "string",
      "description": "PREFERRED. Cloudflare D1 database name (e.g. inneranimalmedia-business). Resolved against your CF account catalog."
    },
    "database_id": {
      "type": "string",
      "description": "Optional Cloudflare D1 UUID. Prefer database (plain name). Non-UUID values are treated as database names."
    },
    "resource_ref": {
      "type": "string",
      "description": "Studio / connector resource: CF D1 name or UUID."
    },
    "query": {
      "type": "string",
      "description": "Alias for sql (legacy connectors)."
    },
    "params": {
      "type": "array",
      "items": {}
    },
    "limit": {
      "type": "integer"
    },
    "mode": {
      "type": "string",
      "enum": ["query", "schema", "explain"]
    },
    "table": {
      "type": "string"
    },
    "include_indexes": {
      "type": "boolean"
    },
    "workspace_slug": {
      "type": "string",
      "description": "Deprecated alias. Prefer database."
    },
    "workspace_id": {
      "type": "string",
      "description": "Deprecated alias. Prefer database."
    },
    "d1_lane": {
      "type": "string",
      "enum": ["platform", "workspace", "explicit"]
    }
  }
}'),
    handler_config = json_set(
      COALESCE(handler_config, '{}'),
      '$.hint',
      'Require sql. Target with database (CF name) OR database_id (UUID) OR resource_ref. Prefer name.'
    ),
    updated_at = datetime('now')
WHERE tool_key = 'agentsam_d1_query';
