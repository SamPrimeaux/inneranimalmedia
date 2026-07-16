-- 912: D1 tools prefer `database` (CF name) over workspace_slug.
-- Deactivate overlap tools; slim DB profiles. Alias/allowlist normalize is in worker code.

-- ── agentsam_d1_query ────────────────────────────────────────────────────────
UPDATE agentsam_tools
SET description = 'Query Cloudflare D1. PREFER database (plain CF name, e.g. inneranimalmedia-business, companionscpas) — resolved against your Cloudflare account catalog. Optional database_id UUID. workspace_slug is deprecated.',
    input_schema = json('{
  "type":"object",
  "additionalProperties":false,
  "properties":{
    "database":{"type":"string","description":"PREFERRED. Cloudflare D1 database name (e.g. inneranimalmedia-business, companionscpas). Resolved against your CF account — not a workspace slug."},
    "sql":{"type":"string","description":"Read-only SELECT / WITH … SELECT / EXPLAIN."},
    "query":{"type":"string","description":"Alias for sql."},
    "params":{"type":"array","items":{}},
    "limit":{"type":"integer"},
    "mode":{"type":"string","enum":["query","schema","explain"]},
    "table":{"type":"string"},
    "include_indexes":{"type":"boolean"},
    "database_id":{"type":"string","description":"Optional D1 UUID. Prefer database (plain name)."},
    "workspace_slug":{"type":"string","description":"Deprecated alias. Prefer database."},
    "workspace_id":{"type":"string","description":"Deprecated alias. Prefer database."},
    "d1_lane":{"type":"string","enum":["platform","workspace","explicit"]}
  }
}'),
    handler_config = json_set(
      COALESCE(handler_config, '{}'),
      '$.auth_source', 'platform',
      '$.lane', 'account_d1',
      '$.hint', 'Pass database (CF D1 name). workspace_slug is deprecated.'
    ),
    updated_at = datetime('now')
WHERE tool_key = 'agentsam_d1_query';

-- ── agentsam_d1_write / agentsam_d1_delete ────────────────────────────────────
UPDATE agentsam_tools
SET description = 'Write Cloudflare D1. PREFER database (plain CF name). Requires sql. workspace_slug is deprecated.',
    input_schema = json('{
  "type":"object",
  "additionalProperties":false,
  "required":["sql"],
  "properties":{
    "database":{"type":"string","description":"PREFERRED. Cloudflare D1 database name (e.g. inneranimalmedia-business)."},
    "sql":{"type":"string"},
    "query":{"type":"string"},
    "params":{"type":"array","items":{}},
    "database_id":{"type":"string"},
    "workspace_slug":{"type":"string","description":"Deprecated alias. Prefer database."},
    "workspace_id":{"type":"string","description":"Deprecated alias. Prefer database."},
    "d1_lane":{"type":"string","enum":["platform","workspace","explicit"]}
  }
}'),
    handler_config = json_set(
      COALESCE(handler_config, '{}'),
      '$.auth_source', 'platform',
      '$.lane', 'account_d1',
      '$.hint', 'Pass database (CF D1 name).'
    ),
    updated_at = datetime('now')
WHERE tool_key IN ('agentsam_d1_write', 'agentsam_d1_delete');

-- delete tool keeps same schema; tighten description
UPDATE agentsam_tools
SET description = 'DELETE/DROP on Cloudflare D1. PREFER database (plain CF name). Separate from write for safety. workspace_slug is deprecated.',
    updated_at = datetime('now')
WHERE tool_key = 'agentsam_d1_delete';

-- ── agentsam_d1_migrate ──────────────────────────────────────────────────────
UPDATE agentsam_tools
SET description = 'Execute a D1 migration against a named database. PREFER database (plain CF name). Always draft and review before applying.',
    input_schema = json_set(
      COALESCE(input_schema, '{}'),
      '$.properties.database', json('{"type":"string","description":"PREFERRED. Cloudflare D1 database name (e.g. inneranimalmedia-business)."}'),
      '$.properties.workspace_slug', json('{"type":"string","description":"Deprecated alias. Prefer database."}')
    ),
    updated_at = datetime('now')
WHERE tool_key = 'agentsam_d1_migrate';

-- ── Supabase: project param on query/write ───────────────────────────────────
UPDATE agentsam_tools
SET description = 'Read-only SQL on Supabase/Postgres. Omit project for platform Hyperdrive (operator). Pass project (name or project_ref) for a user Management OAuth project.',
    input_schema = json('{
  "type":"object",
  "additionalProperties":false,
  "required":["sql"],
  "properties":{
    "sql":{"type":"string","description":"SELECT or EXPLAIN only"},
    "schema":{"type":"string","default":"agentsam"},
    "project":{"type":"string","description":"Optional Supabase project ref or name. When set, uses caller Management OAuth (customer plane). When omitted, platform Hyperdrive for operators."},
    "project_ref":{"type":"string","description":"Alias for project."},
    "params":{"type":"array","items":{}}
  }
}'),
    updated_at = datetime('now')
WHERE tool_key = 'agentsam_supabase_query';

UPDATE agentsam_tools
SET description = 'Mutating SQL on Supabase/Postgres. Omit project for platform Hyperdrive (operator). Pass project for user Management OAuth project. Requires approval when configured.',
    input_schema = json('{
  "type":"object",
  "additionalProperties":false,
  "required":["sql"],
  "properties":{
    "sql":{"type":"string"},
    "project":{"type":"string","description":"Optional Supabase project ref or name. When set, customer Management plane."},
    "project_ref":{"type":"string","description":"Alias for project."},
    "params":{"type":"array","items":{"type":"string"}},
    "approval_id":{"type":"string"}
  }
}'),
    updated_at = datetime('now')
WHERE tool_key = 'agentsam_supabase_write';

-- vector unchanged functionally; clarify plane
UPDATE agentsam_tools
SET description = 'pgvector similarity search. Platform Hyperdrive for operators; optional project for user BYOK/customer plane when supported.',
    input_schema = json_set(
      COALESCE(input_schema, '{}'),
      '$.properties.project', json('{"type":"string","description":"Optional Supabase project ref or name."}')
    ),
    updated_at = datetime('now')
WHERE tool_key = 'agentsam_supabase_vector';

-- ── Deactivate overlap tools ─────────────────────────────────────────────────
UPDATE agentsam_tools
SET is_active = 0,
    oauth_visible = 0,
    updated_at = datetime('now')
WHERE tool_key IN (
  'agentsam_cf_d1_list',
  'agentsam_supabase_project_query',
  'agentsam_supabase_project_write'
);

-- ── Slim DB profiles ─────────────────────────────────────────────────────────
UPDATE agentsam_tool_profiles
SET tool_keys_json = json('["agentsam_d1_query"]'),
    max_tools = 4,
    notes = '912: single tool — agentsam_d1_query (database name targeting)',
    updated_at = unixepoch()
WHERE profile_key = 'd1_read';

UPDATE agentsam_tool_profiles
SET tool_keys_json = json('["agentsam_supabase_query","agentsam_supabase_vector"]'),
    max_tools = 4,
    notes = '912: supabase read + vector only',
    updated_at = unixepoch()
WHERE profile_key = 'supabase_read';

UPDATE agentsam_tool_profiles
SET tool_keys_json = json('["agentsam_supabase_write","agentsam_supabase_query"]'),
    max_tools = 4,
    notes = '912: supabase write + readback query',
    updated_at = unixepoch()
WHERE profile_key = 'supabase_write';

-- Strip deactivated keys from any remaining profiles
UPDATE agentsam_tool_profiles
SET tool_keys_json = (
  SELECT json_group_array(value)
  FROM json_each(tool_keys_json)
  WHERE value NOT IN (
    'agentsam_cf_d1_list',
    'agentsam_supabase_project_query',
    'agentsam_supabase_project_write'
  )
),
    updated_at = unixepoch()
WHERE tool_keys_json LIKE '%agentsam_cf_d1_list%'
   OR tool_keys_json LIKE '%agentsam_supabase_project_query%'
   OR tool_keys_json LIKE '%agentsam_supabase_project_write%';

-- Policy keys: store both short + full forms for D1 baseline
INSERT OR IGNORE INTO agentsam_tool_policy_keys (id, policy_kind, tool_key, sort_order, notes) VALUES
  ('atpk_912_builtin_agentsam_d1_query', 'builtin_safe_allowlist', 'agentsam_d1_query', 10, '912: full catalog key alias for d1_query'),
  ('atpk_912_essential_agentsam_d1_query', 'agent_chat_essential', 'agentsam_d1_query', 10, '912: full catalog key alias for d1_query');
