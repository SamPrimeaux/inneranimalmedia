-- 465: Customer / public learning data-plane tools (BYO infrastructure).
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/465_customer_data_plane_tools.sql

-- Public learning
INSERT OR REPLACE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type, handler_key,
  description, input_schema, handler_config, capability_key,
  risk_level, requires_approval, requires_confirmation,
  is_active, is_degraded, workspace_scope, sort_priority, is_global, updated_at
) VALUES
('ast_public_learning_search', 'public_learning_search', 'public_learning_search', 'Public Learning Search', 'database.public', 'ai', 'dispatchPublicLearning',
 'Search public.iam_* learning tables (read-only).', '{"type":"object","properties":{"query":{"type":"string"}},"required":["query"]}',
 '{"dispatcher":"customer_data_plane","data_plane":"public_learning","operation":"public_learning_search"}',
 'public_learning_search', 'low', 0, 0, 1, 0, '["*"]', 40, 1, unixepoch()),
('ast_public_learning_read', 'public_learning_read_table', 'public_learning_read_table', 'Public Learning Read Table', 'database.public', 'ai', 'dispatchPublicLearning',
 'Read rows from a public.iam_* table (read-only).', '{"type":"object","properties":{"table":{"type":"string"},"limit":{"type":"integer"}},"required":["table"]}',
 '{"dispatcher":"customer_data_plane","data_plane":"public_learning","operation":"read_table"}',
 'public_learning_read', 'low', 0, 0, 1, 0, '["*"]', 41, 1, unixepoch());

-- Customer Supabase
INSERT OR REPLACE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type, handler_key,
  description, input_schema, handler_config, capability_key,
  risk_level, requires_approval, requires_confirmation,
  is_active, is_degraded, workspace_scope, sort_priority, is_global, updated_at
) VALUES
('ast_cust_sb_list', 'customer_supabase_list_projects', 'customer_supabase_list_projects', 'List My Supabase Projects', 'database.customer', 'ai', 'dispatchCustomerSupabase',
 'List Supabase projects for the connected workspace OAuth token.', '{}',
 '{"dispatcher":"customer_data_plane","data_plane":"customer_supabase","operation":"list_projects"}',
 'customer_supabase_list', 'low', 0, 0, 1, 0, '["*"]', 42, 1, unixepoch()),
('ast_cust_sb_select', 'customer_supabase_select_project', 'customer_supabase_select_project', 'Select Supabase Project', 'database.customer', 'ai', 'dispatchCustomerSupabase',
 'Set default Supabase project for workspace.', '{"type":"object","properties":{"project_id":{"type":"string"}},"required":["project_id"]}',
 '{"dispatcher":"customer_data_plane","data_plane":"customer_supabase","operation":"select_project_for_workspace"}',
 'customer_supabase_select', 'medium', 0, 0, 1, 0, '["*"]', 43, 1, unixepoch()),
('ast_cust_sb_schema', 'customer_supabase_schema_inspect', 'customer_supabase_schema_inspect', 'Inspect My Supabase Schema', 'database.customer', 'ai', 'dispatchCustomerSupabase',
 'List tables in the user''s selected Supabase project.', '{}',
 '{"dispatcher":"customer_data_plane","data_plane":"customer_supabase","operation":"inspect_schema"}',
 'customer_supabase_schema', 'low', 0, 0, 1, 0, '["*"]', 44, 1, unixepoch()),
('ast_cust_sb_read', 'customer_supabase_readonly_query', 'customer_supabase_readonly_query', 'My Supabase Read-Only SQL', 'database.customer', 'ai', 'dispatchCustomerSupabase',
 'Run read-only SQL against the user''s Supabase project (not IAM platform Hyperdrive).', '{"type":"object","properties":{"sql":{"type":"string"}},"required":["sql"]}',
 '{"dispatcher":"customer_data_plane","data_plane":"customer_supabase","operation":"run_readonly_sql"}',
 'customer_supabase_read', 'medium', 0, 0, 1, 0, '["*"]', 45, 1, unixepoch()),
('ast_cust_sb_migrate', 'customer_supabase_propose_migration', 'customer_supabase_propose_migration', 'Propose Supabase Migration', 'database.customer', 'ai', 'dispatchCustomerSupabase',
 'Propose DDL/DML migration + rollback for user Supabase (approval required to apply).', '{"type":"object","properties":{"migration_sql":{"type":"string"}},"required":["migration_sql"]}',
 '{"dispatcher":"customer_data_plane","data_plane":"customer_supabase","operation":"propose_migration"}',
 'customer_supabase_migrate', 'high', 1, 1, 1, 0, '["*"]', 46, 1, unixepoch());

-- Customer Cloudflare
INSERT OR REPLACE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type, handler_key,
  description, input_schema, handler_config, capability_key,
  risk_level, requires_approval, requires_confirmation,
  is_active, is_degraded, workspace_scope, sort_priority, is_global, updated_at
) VALUES
('ast_cust_cf_accounts', 'customer_cloudflare_list_accounts', 'customer_cloudflare_list_accounts', 'List My Cloudflare Accounts', 'database.customer', 'ai', 'dispatchCustomerCloudflare',
 'List Cloudflare accounts for OAuth-connected user.', '{}',
 '{"dispatcher":"customer_data_plane","data_plane":"customer_cloudflare_d1","operation":"list_accounts"}',
 'customer_cloudflare_accounts', 'low', 0, 0, 1, 0, '["*"]', 47, 1, unixepoch()),
('ast_cust_cf_d1_list', 'customer_cloudflare_list_d1', 'customer_cloudflare_list_d1', 'List My D1 Databases', 'database.customer', 'ai', 'dispatchCustomerCloudflare',
 'List D1 databases in a Cloudflare account.', '{"type":"object","properties":{"account_id":{"type":"string"}}}',
 '{"dispatcher":"customer_data_plane","data_plane":"customer_cloudflare_d1","operation":"list_d1_databases"}',
 'customer_cloudflare_d1_list', 'low', 0, 0, 1, 0, '["*"]', 48, 1, unixepoch()),
('ast_cust_cf_d1_read', 'customer_cloudflare_d1_readonly_query', 'customer_cloudflare_d1_readonly_query', 'My D1 Read-Only Query', 'database.customer', 'ai', 'dispatchCustomerCloudflare',
 'Run read-only SQL on user-selected D1 (not platform env.DB).', '{"type":"object","properties":{"sql":{"type":"string"}},"required":["sql"]}',
 '{"dispatcher":"customer_data_plane","data_plane":"customer_cloudflare_d1","operation":"d1_readonly_query"}',
 'customer_cloudflare_d1_read', 'medium', 0, 0, 1, 0, '["*"]', 49, 1, unixepoch());

-- Platform owner tools (catalog metadata — runtime still gated by superadmin)
INSERT OR REPLACE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type, handler_key,
  description, input_schema, handler_config, capability_key,
  risk_level, requires_approval, requires_confirmation,
  is_active, is_degraded, workspace_scope, sort_priority, is_global, updated_at
) VALUES
('ast_platform_hd_read', 'platform_hyperdrive_agentsam_query', 'platform_hyperdrive_agentsam_query', 'Platform agentsam Query', 'database.platform', 'hyperdrive', 'dispatchDatabaseAssistant',
 'Owner-only Hyperdrive SQL against IAM agentsam.* schema.', '{"type":"object","properties":{"sql":{"type":"string"}},"required":["sql"]}',
 '{"dispatcher":"database_assistant","data_plane":"platform_supabase_agentsam","operation":"run_readonly_sql","admin_only":true}',
 'platform_hyperdrive_read', 'high', 1, 1, 1, 0, '["*"]', 50, 1, unixepoch());
