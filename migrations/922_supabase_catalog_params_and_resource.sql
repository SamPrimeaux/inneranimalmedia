-- 922: Supabase catalog tools carry native schema/params and expose the
-- concrete database plane. Hyperdrive remains transport for platform Postgres.

UPDATE agentsam_tools
SET description = 'Read-only SQL on Supabase/Postgres. Platform DB uses the configured Hyperdrive binding; connected Supabase projects require project/project_ref. Supports PostgreSQL $1 parameters on the platform lane.',
    input_schema = json('{
  "type":"object",
  "additionalProperties":false,
  "required":["sql"],
  "properties":{
    "sql":{"type":"string","description":"SELECT or EXPLAIN only"},
    "schema":{"type":"string","description":"Active PostgreSQL schema; defaults from the authorized datasource."},
    "project":{"type":"string","description":"Connected Supabase project ref or name. Omit only for the explicitly configured platform database."},
    "project_ref":{"type":"string","description":"Alias for project."},
    "data_plane":{"type":"string","enum":["platform_supabase_agentsam","customer_supabase"],"description":"Explicit datasource plane supplied by Database Studio context."},
    "table":{"type":"string"},
    "params":{"type":"array","items":{}}
  }
}'),
    updated_at = datetime('now')
WHERE tool_key = 'agentsam_supabase_query';

UPDATE agentsam_tools
SET description = 'Mutating SQL on Supabase/Postgres. Platform DB uses the configured Hyperdrive binding; connected projects require project/project_ref. Writes require policy approval.',
    input_schema = json('{
  "type":"object",
  "additionalProperties":false,
  "required":["sql"],
  "properties":{
    "sql":{"type":"string"},
    "schema":{"type":"string","description":"Active PostgreSQL schema; defaults from the authorized datasource."},
    "project":{"type":"string","description":"Connected Supabase project ref or name. Omit only for the explicitly configured platform database."},
    "project_ref":{"type":"string","description":"Alias for project."},
    "data_plane":{"type":"string","enum":["platform_supabase_agentsam","customer_supabase"],"description":"Explicit datasource plane supplied by Database Studio context."},
    "table":{"type":"string"},
    "params":{"type":"array","items":{}},
    "approval_id":{"type":"string"}
  }
}'),
    updated_at = datetime('now')
WHERE tool_key = 'agentsam_supabase_write';
