-- 441: Canonical agentsam_db_query MCP input_schema (sql, params, limit, mode).

UPDATE agentsam_tools
SET input_schema = '{
  "type": "object",
  "properties": {
    "sql": {
      "type": "string",
      "description": "Read-only SELECT (or WITH … SELECT) for D1. For tenant/workspace-scoped tables, include tenant_id or workspace_id matching the authenticated token. Platform catalog tables and sqlite_master discovery do not require scope predicates."
    },
    "query": {
      "type": "string",
      "description": "Alias for sql (legacy connectors)."
    },
    "params": {
      "type": "array",
      "description": "Optional positional bind values for ? placeholders in sql.",
      "items": {}
    },
    "limit": {
      "type": "integer",
      "default": 100,
      "maximum": 500,
      "description": "Max rows returned when SQL has no LIMIT clause."
    },
    "mode": {
      "type": "string",
      "enum": ["query", "schema", "explain"],
      "default": "query",
      "description": "query: run read SQL. schema: list tables or column metadata. explain: EXPLAIN QUERY PLAN."
    },
    "table": {
      "type": "string",
      "description": "When mode=schema, optional table name for PRAGMA table_info."
    },
    "include_indexes": {
      "type": "boolean",
      "description": "When mode=schema and table is set, include PRAGMA index_list."
    }
  },
  "additionalProperties": false
}',
    schema_hint = 'Universal D1 read gateway: SELECT across tables with scope enforcement. Use mode=schema for discovery. Mutations require agentsam_db_write + approval_id.',
    updated_at = unixepoch()
WHERE tool_key IN ('agentsam_db_query', 'd1_query');
