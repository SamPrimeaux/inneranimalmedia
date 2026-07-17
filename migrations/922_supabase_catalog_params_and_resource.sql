-- 922: Supabase catalog tools carry native schema/params and expose the
-- concrete database plane. Hyperdrive remains transport for platform Postgres.

UPDATE agentsam_tools
SET description = 'Read-only SQL on an explicitly selected Supabase/Postgres resource. Supports PostgreSQL $1 parameters on the platform resource.',
    input_schema = json('{
  "type":"object",
  "additionalProperties":false,
  "anyOf":[
    {"required":["sql","resource_ref"]},
    {"properties":{"operation":{"const":"list_projects"}},"required":["operation"]},
    {"required":["operation","resource_ref"]}
  ],
  "properties":{
    "operation":{"type":"string","enum":["list_projects","get_project","list_branches","list_migrations","get_database_context","query_logs"]},
    "sql":{"type":"string","description":"SELECT or EXPLAIN only"},
    "provider":{"type":"string","const":"supabase"},
    "resource_scope":{"type":"string","enum":["platform","workspace","connected"]},
    "resource_ref":{"type":"string","minLength":1,"description":"Server-resolved authorized Supabase resource."},
    "schema":{"type":"string","description":"Explicit PostgreSQL schema when the operation targets one."},
    "project":{"type":"string","description":"Connected Supabase project ref or name. Omit only for the explicitly configured platform database."},
    "project_ref":{"type":"string","description":"Alias for project."},
    "table":{"type":"string"},
    "log_sql":{"type":"string","description":"Optional SQL for the Supabase logs endpoint."},
    "iso_timestamp_start":{"type":"string"},
    "iso_timestamp_end":{"type":"string"},
    "params":{"type":"array","items":{}}
  }
}'),
    handler_config = json_set(
      COALESCE(handler_config, '{}'),
      '$.data_plane', 'platform_supabase',
      '$.provider', 'supabase'
    ),
    updated_at = datetime('now')
WHERE tool_key = 'agentsam_supabase_query';

UPDATE agentsam_tools
SET description = 'Approval-gated mutating SQL on an explicitly selected Supabase/Postgres resource. INSERT, UPDATE, and DELETE must include RETURNING for readback.',
    input_schema = json('{
  "type":"object",
  "additionalProperties":false,
  "required":["sql","resource_ref"],
  "properties":{
    "sql":{"type":"string"},
    "provider":{"type":"string","const":"supabase"},
    "resource_scope":{"type":"string","enum":["platform","workspace","connected"]},
    "resource_ref":{"type":"string","minLength":1,"description":"Server-resolved authorized Supabase resource."},
    "schema":{"type":"string","description":"Explicit PostgreSQL schema when the operation targets one."},
    "project":{"type":"string","description":"Connected Supabase project ref or name. Omit only for the explicitly configured platform database."},
    "project_ref":{"type":"string","description":"Alias for project."},
    "table":{"type":"string"},
    "params":{"type":"array","items":{}},
    "approval_id":{"type":"string"}
  }
}'),
    handler_config = json_set(
      COALESCE(handler_config, '{}'),
      '$.data_plane', 'platform_supabase',
      '$.provider', 'supabase'
    ),
    updated_at = datetime('now')
WHERE tool_key = 'agentsam_supabase_write';
