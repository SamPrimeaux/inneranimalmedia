-- 908: D1 tools route by agentsam_workspace (workspace_slug → d1_database_id).
-- Code path in MCP resolves registry first; keep D1 catalog schemas/descriptions aligned.

UPDATE agentsam_tools
SET description = 'Query Cloudflare D1. PREFER workspace_slug (e.g. companionscpas) — resolves d1_database_id from agentsam_workspace. Optional database_id UUID bypass. Do not assume the IAM business D1.',
    input_schema = json('{
  "type":"object",
  "additionalProperties":false,
  "properties":{
    "workspace_slug":{"type":"string","description":"PREFERRED. agentsam_workspace.workspace_slug (e.g. companionscpas). Resolves d1_database_id + cloudflare_account_id."},
    "workspace_id":{"type":"string","description":"ws_* id or short slug — same registry lookup as workspace_slug."},
    "sql":{"type":"string","description":"Read-only SELECT / WITH … SELECT / EXPLAIN."},
    "query":{"type":"string","description":"Alias for sql."},
    "params":{"type":"array","items":{}},
    "limit":{"type":"integer"},
    "mode":{"type":"string","enum":["query","schema","explain"]},
    "table":{"type":"string"},
    "include_indexes":{"type":"boolean"},
    "database_id":{"type":"string","description":"Optional D1 UUID. Prefer workspace_slug."},
    "d1_lane":{"type":"string","enum":["platform","workspace","explicit"]}
  }
}'),
    handler_config = json_set(
      COALESCE(handler_config, '{}'),
      '$.auth_source', 'platform',
      '$.lane', 'account_d1',
      '$.hint', 'Pass workspace_slug from agentsam_workspace; omit only to use the OAuth session workspace D1.'
    ),
    updated_at = datetime('now')
WHERE tool_key = 'agentsam_d1_query';

UPDATE agentsam_tools
SET description = 'Write Cloudflare D1. PREFER workspace_slug from agentsam_workspace (resolves d1_database_id). Requires sql.',
    handler_config = json_set(
      COALESCE(handler_config, '{}'),
      '$.auth_source', 'platform',
      '$.lane', 'account_d1',
      '$.hint', 'Pass workspace_slug from agentsam_workspace for client DBs.'
    ),
    updated_at = datetime('now')
WHERE tool_key IN ('agentsam_d1_write', 'agentsam_d1_delete');

UPDATE agentsam_tools
SET input_schema = json('{
  "type":"object",
  "additionalProperties":false,
  "required":["sql"],
  "properties":{
    "workspace_slug":{"type":"string","description":"PREFERRED. agentsam_workspace.workspace_slug (e.g. companionscpas)."},
    "workspace_id":{"type":"string"},
    "sql":{"type":"string"},
    "query":{"type":"string"},
    "params":{"type":"array","items":{}},
    "database_id":{"type":"string"},
    "d1_lane":{"type":"string","enum":["platform","workspace","explicit"]}
  }
}'),
    updated_at = datetime('now')
WHERE tool_key IN ('agentsam_d1_write', 'agentsam_d1_delete');
