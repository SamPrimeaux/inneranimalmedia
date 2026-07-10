-- agentsam_d1_write: accept workspace_slug / database_id like agentsam_d1_query
-- Code schema override in MCP agentsam-tools-catalog.js wins at tools/list; keep D1 in sync.

UPDATE agentsam_tools
SET
  input_schema = json('{
    "type": "object",
    "properties": {
      "workspace_slug": {
        "type": "string",
        "description": "Target workspace slug (e.g. companionscpas). Routes write to that workspace D1."
      },
      "workspace_id": {
        "type": "string",
        "description": "Target workspace id (e.g. ws_companionscpas) or short slug."
      },
      "d1_lane": {
        "type": "string",
        "enum": ["platform", "workspace", "explicit"],
        "description": "Optional D1 routing override. Default workspace."
      },
      "database_id": {
        "type": "string",
        "description": "Optional Cloudflare D1 UUID — bypass workspace resolution via CF REST."
      },
      "sql": {
        "type": "string",
        "description": "Mutating SQL for the target D1."
      },
      "query": {
        "type": "string",
        "description": "Alias for sql."
      },
      "params": {
        "type": "array",
        "items": {},
        "description": "Optional bind params."
      }
    },
    "required": ["sql"],
    "additionalProperties": false
  }'),
  updated_at = datetime('now')
WHERE tool_key IN ('agentsam_d1_write', 'agentsam_db_write', 'd1_write');
