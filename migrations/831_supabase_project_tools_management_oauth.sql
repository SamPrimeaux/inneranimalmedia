-- Point user-account Supabase project tools at Management OAuth (customer_supabase),
-- not workspace settings_json URL/anon keys or IAM Hyperdrive.
UPDATE agentsam_tools
SET
  handler_config = '{"dispatcher":"customer_data_plane","data_plane":"customer_supabase","operation":"run_readonly_sql","schema":"public","auth_source":"oauth","oauth_provider":"supabase_management"}',
  description = 'Read-only SELECT on a project in the caller''s Supabase Management OAuth account. Pass project_ref (or use workspace pin). Never touches IAM Hyperdrive / agentsam.*',
  updated_at = unixepoch()
WHERE tool_name = 'agentsam_supabase_project_query';

UPDATE agentsam_tools
SET
  handler_config = '{"dispatcher":"customer_data_plane","data_plane":"customer_supabase","operation":"execute_sql","schema":"public","auth_source":"oauth","oauth_provider":"supabase_management","requires_approval":true}',
  description = 'INSERT/UPDATE/DELETE/DDL on a project in the caller''s Supabase Management OAuth account. Pass project_ref. Never touches IAM agentsam.*. Requires approval for writes.',
  updated_at = unixepoch()
WHERE tool_name = 'agentsam_supabase_project_write';

-- Ensure customer_* catalog tools stay on Management OAuth plane.
UPDATE agentsam_tools
SET
  handler_config = json_set(
    COALESCE(handler_config, '{}'),
    '$.dispatcher', 'customer_data_plane',
    '$.data_plane', 'customer_supabase',
    '$.auth_source', 'oauth',
    '$.oauth_provider', 'supabase_management'
  ),
  updated_at = unixepoch()
WHERE tool_name IN (
  'customer_supabase_list_projects',
  'customer_supabase_select_project',
  'customer_supabase_readonly_query',
  'customer_supabase_schema_inspect',
  'customer_supabase_propose_migration'
);
