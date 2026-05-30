-- 477: OAuth MCP remaster — 24-tool surface via agentsam_mcp_tools.oauth_visible.
-- Retires legacy 30-tool connector list; tools/list reads D1 at runtime (no deploy to add tools).
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/477_oauth_mcp_remaster_24_tools.sql

-- ── 1. Schema columns on agentsam_mcp_tools (idempotent — skip if present) ─────
-- Applied manually when columns missing; safe to ignore duplicate column errors on re-run.

-- ── 2. Retire legacy OAuth surface (hide, do not delete) ────────────────────────
UPDATE agentsam_mcp_tools
SET oauth_visible = 0, updated_at = unixepoch()
WHERE tool_key IN (
  'agentsam_cms_publish',
  'agentsam_cms_read',
  'agentsam_cms_write',
  'agentsam_daily_summary',
  'agentsam_db_query',
  'agentsam_db_schema',
  'agentsam_db_write',
  'agentsam_get_agent',
  'agentsam_health_check',
  'agentsam_list_agents',
  'agentsam_memory_save',
  'agentsam_memory_search',
  'agentsam_memory_write',
  'agentsam_notify',
  'agentsam_plan',
  'agentsam_r2_read',
  'agentsam_r2_upload',
  'agentsam_r2_write',
  'agentsam_recent_errors',
  'agentsam_run',
  'agentsam_search_tools',
  'agentsam_send_email',
  'agentsam_spawn_profile',
  'agentsam_spend_summary',
  'agentsam_todo_add',
  'agentsam_todo_update',
  'agentsam_vectorize_describe',
  'agentsam_workflow_status',
  'agentsam_workflow_trigger',
  'agentsam_workspace_context'
);

-- ── 3. Execution catalog (agentsam_tools) — clone per tool (no compound UNION) ─
INSERT OR IGNORE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type, description,
  input_schema, output_schema, handler_config, risk_level, requires_approval,
  is_active, is_global, workspace_scope, modes_json, updated_at
)
SELECT 'ast_oauth_agentsam_d1_query', 'agentsam_d1_query', 'agentsam_d1_query', 'D1 Query', 'database.d1.query', 'd1',
  'Use this when you need read-only D1 SQL (SELECT, schema discovery, EXPLAIN) against workspace-scoped or platform catalog tables.',
  input_schema, output_schema, handler_config, 'low', 0, 1, 1, '["*"]', '["auto","agent","debug"]', unixepoch()
FROM agentsam_tools WHERE tool_key = 'd1_query' LIMIT 1;

INSERT OR IGNORE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type, description,
  input_schema, output_schema, handler_config, risk_level, requires_approval,
  is_active, is_global, workspace_scope, modes_json, updated_at
)
SELECT 'ast_oauth_agentsam_d1_migrate', 'agentsam_d1_migrate', 'agentsam_d1_migrate', 'D1 Migrate', 'database.d1.migrate', 'd1',
  'Use this when you need to draft or stage a D1 migration SQL file for review before apply.',
  input_schema, output_schema, handler_config, 'medium', 0, 1, 1, '["*"]', '["auto","agent","debug"]', unixepoch()
FROM agentsam_tools WHERE tool_key = 'd1_migrations_draft' LIMIT 1;

INSERT OR IGNORE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type, description,
  input_schema, output_schema, handler_config, risk_level, requires_approval,
  is_active, is_global, workspace_scope, modes_json, updated_at
)
SELECT 'ast_oauth_agentsam_supabase_query', 'agentsam_supabase_query', 'agentsam_supabase_query', 'Supabase Query', 'database.supabase.query', 'hyperdrive',
  'Use this when you need read-only SELECT against Supabase Postgres (agentsam schema) via Hyperdrive.',
  input_schema, '{"type":"object","properties":{"results":{"type":"array"},"rows":{"type":"integer"}},"additionalProperties":true}', handler_config, 'low', 0, 1, 1, '["*"]', '["auto","agent","debug"]', unixepoch()
FROM agentsam_tools WHERE tool_key = 'hyperdrive_readonly_query' LIMIT 1;

INSERT OR IGNORE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type, description,
  input_schema, output_schema, handler_config, risk_level, requires_approval,
  is_active, is_global, workspace_scope, modes_json, updated_at
)
SELECT 'ast_oauth_agentsam_supabase_write', 'agentsam_supabase_write', 'agentsam_supabase_write', 'Supabase Write', 'database.supabase.write', 'supabase',
  'Use this when you need INSERT, UPDATE, or DELETE against Supabase Postgres via Hyperdrive.',
  COALESCE(input_schema, '{"type":"object","properties":{"sql":{"type":"string"},"params":{"type":"array"}},"required":["sql"],"additionalProperties":false}'),
  COALESCE(output_schema, '{"type":"object","properties":{"ok":{"type":"boolean"},"changes":{"type":"integer"}},"additionalProperties":true}'),
  handler_config, 'medium', 0, 1, 1, '["*"]', '["auto","agent","debug"]', unixepoch()
FROM agentsam_tools WHERE tool_key = 'supabase_write' LIMIT 1;

INSERT OR IGNORE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type, description,
  input_schema, output_schema, handler_config, risk_level, requires_approval,
  is_active, is_global, workspace_scope, modes_json, updated_at
)
SELECT 'ast_oauth_agentsam_supabase_vector', 'agentsam_supabase_vector', 'agentsam_supabase_vector', 'Supabase Vector', 'database.supabase.vector', 'supabase',
  'Use this when you need pgvector similarity search or semantic retrieval via Hyperdrive.',
  input_schema, COALESCE(output_schema, '{"type":"object","properties":{"ok":{"type":"boolean"},"matches":{"type":"array"}},"additionalProperties":true}'), handler_config, 'low', 0, 1, 1, '["*"]', '["auto","agent","debug"]', unixepoch()
FROM agentsam_tools WHERE tool_key = 'supabase_vector' LIMIT 1;

INSERT OR IGNORE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type, description,
  input_schema, output_schema, handler_config, risk_level, requires_approval,
  is_active, is_global, workspace_scope, modes_json, updated_at
)
SELECT 'ast_oauth_agentsam_r2_get', 'agentsam_r2_get', 'agentsam_r2_get', 'R2 Get', 'storage.r2.get', 'r2',
  'Use this when you need to read or list objects in an R2 bucket by bucket and key/prefix.',
  COALESCE(input_schema, '{"type":"object","properties":{"bucket":{"type":"string"},"key":{"type":"string"},"prefix":{"type":"string"},"mode":{"type":"string","enum":["list","read"],"default":"read"}},"required":["bucket"],"additionalProperties":false}'),
  output_schema, handler_config, 'low', 0, 1, 1, '["*"]', '["auto","agent","debug"]', unixepoch()
FROM agentsam_tools WHERE tool_key = 'r2_read' LIMIT 1;

INSERT OR IGNORE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type, description,
  input_schema, output_schema, handler_config, risk_level, requires_approval,
  is_active, is_global, workspace_scope, modes_json, updated_at
)
SELECT 'ast_oauth_agentsam_r2_put', 'agentsam_r2_put', 'agentsam_r2_put', 'R2 Put', 'storage.r2.put', 'r2',
  'Use this when you need to upload or overwrite an object in R2 (bucket + key + content).',
  '{"type":"object","properties":{"bucket":{"type":"string"},"key":{"type":"string"},"content":{"type":"string"},"content_type":{"type":"string","default":"application/octet-stream"}},"required":["bucket","key","content"],"additionalProperties":false}',
  output_schema, handler_config, 'medium', 0, 1, 1, '["*"]', '["auto","agent","debug"]', unixepoch()
FROM agentsam_tools WHERE tool_key = 'r2_write' LIMIT 1;

INSERT OR IGNORE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type, description,
  input_schema, output_schema, handler_config, risk_level, requires_approval,
  is_active, is_global, workspace_scope, modes_json, updated_at
)
SELECT 'ast_oauth_agentsam_r2_delete', 'agentsam_r2_delete', 'agentsam_r2_delete', 'R2 Delete', 'storage.r2.delete', 'r2',
  'Use this when you need to delete a single R2 object by bucket and key.',
  input_schema, output_schema, handler_config, 'high', 0, 1, 1, '["*"]', '["auto","agent","debug"]', unixepoch()
FROM agentsam_tools WHERE tool_key = 'r2_delete' LIMIT 1;

INSERT OR IGNORE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type, description,
  input_schema, output_schema, handler_config, risk_level, requires_approval,
  is_active, is_global, workspace_scope, modes_json, updated_at
)
SELECT 'ast_oauth_agentsam_cf_vectorize', 'agentsam_cf_vectorize', 'agentsam_cf_vectorize', 'Cloudflare Vectorize', 'storage.vectorize', 'http',
  'Use this when you need to describe Vectorize indexes, dimensions, and lane purposes before semantic search.',
  input_schema, '{"type":"object","properties":{"indexes":{"type":"array"},"lanes":{"type":"array"}},"additionalProperties":true}', handler_config, 'low', 0, 1, 1, '["*"]', '["auto","agent","debug"]', unixepoch()
FROM agentsam_tools WHERE tool_key = 'agentsam_vectorize_describe' LIMIT 1;

INSERT OR IGNORE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type, description,
  input_schema, output_schema, handler_config, risk_level, requires_approval,
  is_active, is_global, workspace_scope, modes_json, updated_at
)
SELECT 'ast_oauth_agentsam_github_read', 'agentsam_github_read', 'agentsam_github_read', 'GitHub Read', 'github.read', 'github',
  'Use this when you need to read a file from a GitHub repo (path + ref).',
  input_schema, output_schema, handler_config, 'low', 0, 1, 1, '["*"]', '["auto","agent","debug"]', unixepoch()
FROM agentsam_tools WHERE tool_key = 'github_file' LIMIT 1;

INSERT OR IGNORE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type, description,
  input_schema, output_schema, handler_config, risk_level, requires_approval,
  is_active, is_global, workspace_scope, modes_json, updated_at
)
SELECT 'ast_oauth_agentsam_github_write', 'agentsam_github_write', 'agentsam_github_write', 'GitHub Write', 'github.write', 'github',
  'Use this when you need to update an existing file in a GitHub repo (requires file SHA).',
  input_schema, output_schema, handler_config, 'high', 0, 1, 1, '["*"]', '["auto","agent","debug"]', unixepoch()
FROM agentsam_tools WHERE tool_key = 'github_update_file' LIMIT 1;

INSERT OR IGNORE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type, description,
  input_schema, output_schema, handler_config, risk_level, requires_approval,
  is_active, is_global, workspace_scope, modes_json, updated_at
)
SELECT 'ast_oauth_agentsam_github_pr', 'agentsam_github_pr', 'agentsam_github_pr', 'GitHub PR', 'github.pr', 'github',
  'Use this when you need to open a pull request on the workspace-bound GitHub repo.',
  input_schema, output_schema, handler_config, 'high', 0, 1, 1, '["*"]', '["auto","agent","debug"]', unixepoch()
FROM agentsam_tools WHERE tool_key = 'github_create_pr' LIMIT 1;

INSERT OR IGNORE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type, description,
  input_schema, output_schema, handler_config, risk_level, requires_approval,
  is_active, is_global, workspace_scope, modes_json, updated_at
)
SELECT 'ast_oauth_agentsam_worker_deploy', 'agentsam_worker_deploy', 'agentsam_worker_deploy', 'Worker Deploy', 'deploy.worker', 'mcp',
  'Use this when you need to deploy the IAM Cloudflare Worker (npm run deploy:full / deploy:frontend).',
  input_schema, '{"type":"object","properties":{"ok":{"type":"boolean"},"deployment_id":{"type":"string"}},"additionalProperties":true}', handler_config, 'high', 0, 1, 1, '["*"]', '["auto","agent","debug"]', unixepoch()
FROM agentsam_tools WHERE tool_key = 'worker_deploy' LIMIT 1;

INSERT OR IGNORE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type, description,
  input_schema, output_schema, handler_config, risk_level, requires_approval,
  is_active, is_global, workspace_scope, modes_json, updated_at
)
SELECT 'ast_oauth_agentsam_worker_status', 'agentsam_worker_status', 'agentsam_worker_status', 'Worker Status', 'deploy.status', 'mcp',
  'Use this when you need the latest deploy status, build summary, or deployment history.',
  input_schema, output_schema, handler_config, 'low', 0, 1, 1, '["*"]', '["auto","agent","debug"]', unixepoch()
FROM agentsam_tools WHERE tool_key = 'deploy_status' LIMIT 1;

INSERT OR IGNORE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type, description,
  input_schema, output_schema, handler_config, risk_level, requires_approval,
  is_active, is_global, workspace_scope, modes_json, updated_at
)
SELECT 'ast_oauth_agentsam_autorag', 'agentsam_autorag', 'agentsam_autorag', 'AutoRAG Search', 'memory.autorag', 'hyperdrive',
  'Use this when you need semantic search across platform docs and knowledge base (AutoRAG / pgvector).',
  '{"type":"object","properties":{"query":{"type":"string"},"top_k":{"type":"integer","default":8,"maximum":25},"purpose":{"type":"string"}},"required":["query"],"additionalProperties":false}',
  output_schema, handler_config, 'low', 0, 1, 1, '["*"]', '["auto","agent","debug"]', unixepoch()
FROM agentsam_tools WHERE tool_key = 'knowledge_search' LIMIT 1;

INSERT OR IGNORE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type, description,
  input_schema, output_schema, handler_config, risk_level, requires_approval,
  is_active, is_global, workspace_scope, modes_json, updated_at
)
SELECT 'ast_oauth_agentsam_memory_manager', 'agentsam_memory_manager', 'agentsam_memory_manager', 'Memory Manager', 'memory.manager', 'mcp',
  'Use this when you need to search, write, list, upsert, or delete private managed agent memory.',
  input_schema, output_schema, handler_config, 'low', 0, 1, 1, '["*"]', '["auto","agent","debug"]', unixepoch()
FROM agentsam_tools WHERE tool_key = 'agentsam_memory_manager' LIMIT 1;

INSERT OR IGNORE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type, description,
  input_schema, output_schema, handler_config, risk_level, requires_approval,
  is_active, is_global, workspace_scope, modes_json, updated_at
)
SELECT 'ast_oauth_agentsam_send_email', 'agentsam_send_email', 'agentsam_send_email', 'Send Email', 'comms.email', 'mcp',
  'Use this when you need to queue or send a transactional email via the IAM Resend outbox.',
  input_schema, output_schema, handler_config, 'low', 0, 1, 1, '["*"]', '["auto","agent","debug"]', unixepoch()
FROM agentsam_tools WHERE tool_key = 'agentsam_send_email' LIMIT 1;

INSERT OR IGNORE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type, description,
  input_schema, output_schema, handler_config, risk_level, requires_approval,
  is_active, is_global, workspace_scope, modes_json, updated_at
) VALUES
('ast_oauth_agentsam_d1_write', 'agentsam_d1_write', 'agentsam_d1_write', 'D1 Write', 'database.d1.write', 'd1',
  'Use this when you need INSERT, UPDATE, DELETE, or DDL against D1 for the authenticated workspace.',
  '{"type":"object","properties":{"sql":{"type":"string"},"params":{"type":"array"},"batch":{"type":"array","items":{"type":"object","properties":{"sql":{"type":"string"},"params":{"type":"array"}}}}},"required":["sql"],"additionalProperties":false}',
  '{"type":"object","properties":{"success":{"type":"boolean"},"changes":{"type":"integer"}},"additionalProperties":true}',
  (SELECT handler_config FROM agentsam_tools WHERE tool_key = 'd1_write' LIMIT 1),
  'medium', 0, 1, 1, '["*"]', '["auto","agent","debug"]', unixepoch()),
('ast_oauth_agentsam_kv_manage', 'agentsam_kv_manage', 'agentsam_kv_manage', 'KV Manage', 'storage.kv', 'http',
  'Use this when you need to list, read, write, or delete Workers KV keys for the platform account.',
  '{"type":"object","properties":{"namespace_id":{"type":"string"},"key":{"type":"string"},"value":{"type":"string"},"operation":{"type":"string","enum":["list","get","put","delete"],"default":"get"},"prefix":{"type":"string"}},"required":["operation"],"additionalProperties":false}',
  '{"type":"object","properties":{"ok":{"type":"boolean"},"result":{},"error":{"type":"string"}},"additionalProperties":true}',
  '{"handler":"http","auth_source":"platform","resource":"kv","operation":"dispatch"}',
  'medium', 0, 1, 1, '["*"]', '["auto","agent","debug"]', unixepoch()),
('ast_oauth_agentsam_github_issue', 'agentsam_github_issue', 'agentsam_github_issue', 'GitHub Issue', 'github.issue', 'github',
  'Use this when you need to create or manage GitHub issues on the workspace-bound repo.',
  '{"type":"object","properties":{"title":{"type":"string"},"body":{"type":"string"},"labels":{"type":"array","items":{"type":"string"}},"issue_number":{"type":"integer"},"operation":{"type":"string","enum":["create","get","list","close"],"default":"create"},"state":{"type":"string","enum":["open","closed","all"],"default":"open"}},"required":["operation"],"additionalProperties":false}',
  '{"type":"object","properties":{"number":{"type":"integer"},"url":{"type":"string"},"state":{"type":"string"}},"additionalProperties":true}',
  '{"handler":"github","auth_source":"user_oauth_tokens","provider":"github","repo_field":"workspace.github_repo","operation":"create_issue"}',
  'medium', 0, 1, 1, '["*"]', '["auto","agent","debug"]', unixepoch()),
('ast_oauth_agentsam_worker_tail', 'agentsam_worker_tail', 'agentsam_worker_tail', 'Worker Tail', 'deploy.tail', 'http',
  'Use this when you need recent Worker log tail or wrangler tail session metadata.',
  '{"type":"object","properties":{"worker_name":{"type":"string"},"limit":{"type":"integer","default":50},"filter":{"type":"string"}},"additionalProperties":false}',
  '{"type":"object","properties":{"logs":{"type":"array"},"error":{"type":"string"}},"additionalProperties":true}',
  '{"command":"workers.tail","resource":"workers","action":"tail","auth_source":"platform"}',
  'low', 0, 1, 1, '["*"]', '["auto","agent","debug"]', unixepoch()),
('ast_oauth_agentsam_terminal_local', 'agentsam_terminal_local', 'agentsam_terminal_local', 'Terminal Local', 'terminal.local', 'terminal',
  'Use this when you need to run a shell command on the platform VM scoped to the workspace root.',
  '{"type":"object","properties":{"command":{"type":"string"},"path":{"type":"string"}},"required":["command"],"additionalProperties":false}',
  '{"type":"object","properties":{"ok":{"type":"boolean"},"text":{"type":"string"}},"additionalProperties":true}',
  '{"auth_source":"platform","env_key":"PTY_AUTH_TOKEN","target_type":"platform_vm"}',
  'high', 0, 1, 1, '["*"]', '["auto","agent","debug"]', unixepoch()),
('ast_oauth_agentsam_terminal_sandbox', 'agentsam_terminal_sandbox', 'agentsam_terminal_sandbox', 'Terminal Sandbox', 'terminal.sandbox', 'terminal',
  'Use this when you need isolated sandbox command execution (Sandbox SDK) for untrusted code.',
  '{"type":"object","properties":{"command":{"type":"string"},"language":{"type":"string","enum":["python","node","shell"],"default":"shell"}},"required":["command"],"additionalProperties":false}',
  '{"type":"object","properties":{"ok":{"type":"boolean"},"text":{"type":"string"}},"additionalProperties":true}',
  '{"auth_source":"platform","target_type":"sandbox"}',
  'high', 0, 1, 1, '["*"]', '["auto","agent","debug"]', unixepoch()),
('ast_oauth_agentsam_terminal_remote', 'agentsam_terminal_remote', 'agentsam_terminal_remote', 'Terminal Remote', 'terminal.remote', 'terminal',
  'Use this when you need to run a command on a remote terminal target bound to the workspace.',
  '{"type":"object","properties":{"command":{"type":"string"},"target_id":{"type":"string"}},"required":["command"],"additionalProperties":false}',
  '{"type":"object","properties":{"ok":{"type":"boolean"},"text":{"type":"string"}},"additionalProperties":true}',
  '{"auth_source":"platform","env_key":"PTY_AUTH_TOKEN","target_type":"remote"}',
  'high', 0, 1, 1, '["*"]', '["auto","agent","debug"]', unixepoch());

UPDATE agentsam_tools SET requires_approval = 0, updated_at = unixepoch()
WHERE tool_key IN (
  'agentsam_d1_query','agentsam_d1_write','agentsam_d1_migrate',
  'agentsam_supabase_query','agentsam_supabase_write','agentsam_supabase_vector',
  'agentsam_r2_get','agentsam_r2_put','agentsam_r2_delete','agentsam_kv_manage','agentsam_cf_vectorize',
  'agentsam_github_read','agentsam_github_write','agentsam_github_pr','agentsam_github_issue',
  'agentsam_worker_deploy','agentsam_worker_status','agentsam_worker_tail',
  'agentsam_terminal_local','agentsam_terminal_sandbox','agentsam_terminal_remote',
  'agentsam_memory_manager','agentsam_autorag','agentsam_send_email'
);

UPDATE agentsam_tools SET description = 'Use this when you need read-only D1 SQL (SELECT, schema discovery, EXPLAIN) against workspace-scoped or platform catalog tables.', updated_at = unixepoch() WHERE tool_key = 'agentsam_d1_query';
UPDATE agentsam_tools SET description = 'Use this when you need INSERT, UPDATE, DELETE, or DDL against D1 for the authenticated workspace.', updated_at = unixepoch() WHERE tool_key = 'agentsam_d1_write';
UPDATE agentsam_tools SET description = 'Use this when you need to draft or stage a D1 migration SQL file for review before apply.', updated_at = unixepoch() WHERE tool_key = 'agentsam_d1_migrate';
UPDATE agentsam_tools SET description = 'Use this when you need read-only SELECT against Supabase Postgres (agentsam schema) via Hyperdrive.', updated_at = unixepoch() WHERE tool_key = 'agentsam_supabase_query';
UPDATE agentsam_tools SET description = 'Use this when you need INSERT, UPDATE, or DELETE against Supabase Postgres via Hyperdrive.', updated_at = unixepoch() WHERE tool_key = 'agentsam_supabase_write';
UPDATE agentsam_tools SET description = 'Use this when you need pgvector similarity search or semantic retrieval via Hyperdrive.', updated_at = unixepoch() WHERE tool_key = 'agentsam_supabase_vector';
UPDATE agentsam_tools SET description = 'Use this when you need to read or list objects in an R2 bucket by bucket and key/prefix.', updated_at = unixepoch() WHERE tool_key = 'agentsam_r2_get';
UPDATE agentsam_tools SET description = 'Use this when you need to upload or overwrite an object in R2 (bucket + key + content).', updated_at = unixepoch() WHERE tool_key = 'agentsam_r2_put';
UPDATE agentsam_tools SET description = 'Use this when you need to delete a single R2 object by bucket and key.', updated_at = unixepoch() WHERE tool_key = 'agentsam_r2_delete';
UPDATE agentsam_tools SET description = 'Use this when you need to list, read, write, or delete Workers KV keys for the platform account.', updated_at = unixepoch() WHERE tool_key = 'agentsam_kv_manage';
UPDATE agentsam_tools SET description = 'Use this when you need to describe Vectorize indexes, dimensions, and lane purposes before semantic search.', updated_at = unixepoch() WHERE tool_key = 'agentsam_cf_vectorize';
UPDATE agentsam_tools SET description = 'Use this when you need to read a file from a GitHub repo (path + ref).', updated_at = unixepoch() WHERE tool_key = 'agentsam_github_read';
UPDATE agentsam_tools SET description = 'Use this when you need to update an existing file in a GitHub repo (requires file SHA).', updated_at = unixepoch() WHERE tool_key = 'agentsam_github_write';
UPDATE agentsam_tools SET description = 'Use this when you need to open a pull request on the workspace-bound GitHub repo.', updated_at = unixepoch() WHERE tool_key = 'agentsam_github_pr';
UPDATE agentsam_tools SET description = 'Use this when you need to create or manage GitHub issues on the workspace-bound repo.', updated_at = unixepoch() WHERE tool_key = 'agentsam_github_issue';
UPDATE agentsam_tools SET description = 'Use this when you need to deploy the IAM Cloudflare Worker (npm run deploy:full / deploy:frontend).', updated_at = unixepoch() WHERE tool_key = 'agentsam_worker_deploy';
UPDATE agentsam_tools SET description = 'Use this when you need the latest deploy status, build summary, or deployment history.', updated_at = unixepoch() WHERE tool_key = 'agentsam_worker_status';
UPDATE agentsam_tools SET description = 'Use this when you need recent Worker log tail or wrangler tail session metadata.', updated_at = unixepoch() WHERE tool_key = 'agentsam_worker_tail';
UPDATE agentsam_tools SET description = 'Use this when you need to run a shell command on the platform VM scoped to the workspace root.', updated_at = unixepoch() WHERE tool_key = 'agentsam_terminal_local';
UPDATE agentsam_tools SET description = 'Use this when you need isolated sandbox command execution (Sandbox SDK) for untrusted code.', updated_at = unixepoch() WHERE tool_key = 'agentsam_terminal_sandbox';
UPDATE agentsam_tools SET description = 'Use this when you need to run a command on a remote terminal target bound to the workspace.', updated_at = unixepoch() WHERE tool_key = 'agentsam_terminal_remote';
UPDATE agentsam_tools SET description = 'Use this when you need to search, write, list, upsert, or delete private managed agent memory.', updated_at = unixepoch() WHERE tool_key = 'agentsam_memory_manager';
UPDATE agentsam_tools SET description = 'Use this when you need semantic search across platform docs and knowledge base (AutoRAG / pgvector).', updated_at = unixepoch() WHERE tool_key = 'agentsam_autorag';
UPDATE agentsam_tools SET description = 'Use this when you need to queue or send a transactional email via the IAM Resend outbox.', updated_at = unixepoch() WHERE tool_key = 'agentsam_send_email';

-- ── 4. OAuth-visible mirror rows (agentsam_mcp_tools) ─────────────────────────
INSERT OR REPLACE INTO agentsam_mcp_tools (
  id, user_id, tool_key, tool_name, display_name, tool_category, description,
  input_schema, output_schema, handler_type, handler_config, modes_json,
  risk_level, requires_approval, enabled, is_active, workspace_scope, routing_scope,
  oauth_visible, lane, sort_order, workspace_id, updated_at
)
SELECT
  'amt_oauth_' || t.tool_key,
  (SELECT user_id FROM agentsam_mcp_tools WHERE trim(COALESCE(user_id, '')) != '' LIMIT 1),
  t.tool_key,
  t.tool_key,
  t.display_name,
  t.tool_category,
  t.description,
  COALESCE(t.input_schema, '{}'),
  COALESCE(t.output_schema, '{}'),
  t.handler_type,
  COALESCE(t.handler_config, '{}'),
  '["auto","agent","debug"]',
  COALESCE(t.risk_level, 'low'),
  0,
  1,
  1,
  '["*"]',
  'workspace',
  1,
  CASE t.tool_key
    WHEN 'agentsam_d1_query' THEN 'data'
    WHEN 'agentsam_d1_write' THEN 'data'
    WHEN 'agentsam_d1_migrate' THEN 'data'
    WHEN 'agentsam_supabase_query' THEN 'data'
    WHEN 'agentsam_supabase_write' THEN 'data'
    WHEN 'agentsam_supabase_vector' THEN 'data'
    WHEN 'agentsam_r2_get' THEN 'storage'
    WHEN 'agentsam_r2_put' THEN 'storage'
    WHEN 'agentsam_r2_delete' THEN 'storage'
    WHEN 'agentsam_kv_manage' THEN 'storage'
    WHEN 'agentsam_cf_vectorize' THEN 'storage'
    WHEN 'agentsam_memory_manager' THEN 'agent_ops'
    WHEN 'agentsam_autorag' THEN 'agent_ops'
    WHEN 'agentsam_send_email' THEN 'agent_ops'
    ELSE 'code_deploy'
  END,
  CASE t.tool_key
    WHEN 'agentsam_d1_query' THEN 10
    WHEN 'agentsam_d1_write' THEN 20
    WHEN 'agentsam_d1_migrate' THEN 30
    WHEN 'agentsam_supabase_query' THEN 40
    WHEN 'agentsam_supabase_write' THEN 50
    WHEN 'agentsam_supabase_vector' THEN 60
    WHEN 'agentsam_r2_get' THEN 70
    WHEN 'agentsam_r2_put' THEN 80
    WHEN 'agentsam_r2_delete' THEN 90
    WHEN 'agentsam_kv_manage' THEN 100
    WHEN 'agentsam_cf_vectorize' THEN 110
    WHEN 'agentsam_github_read' THEN 120
    WHEN 'agentsam_github_write' THEN 130
    WHEN 'agentsam_github_pr' THEN 140
    WHEN 'agentsam_github_issue' THEN 150
    WHEN 'agentsam_worker_deploy' THEN 160
    WHEN 'agentsam_worker_status' THEN 170
    WHEN 'agentsam_worker_tail' THEN 180
    WHEN 'agentsam_terminal_local' THEN 190
    WHEN 'agentsam_terminal_sandbox' THEN 200
    WHEN 'agentsam_terminal_remote' THEN 210
    WHEN 'agentsam_memory_manager' THEN 220
    WHEN 'agentsam_autorag' THEN 230
    WHEN 'agentsam_send_email' THEN 240
    ELSE 999
  END,
  NULL,
  unixepoch()
FROM agentsam_tools t
WHERE t.tool_key IN (
  'agentsam_d1_query','agentsam_d1_write','agentsam_d1_migrate',
  'agentsam_supabase_query','agentsam_supabase_write','agentsam_supabase_vector',
  'agentsam_r2_get','agentsam_r2_put','agentsam_r2_delete','agentsam_kv_manage','agentsam_cf_vectorize',
  'agentsam_github_read','agentsam_github_write','agentsam_github_pr','agentsam_github_issue',
  'agentsam_worker_deploy','agentsam_worker_status','agentsam_worker_tail',
  'agentsam_terminal_local','agentsam_terminal_sandbox','agentsam_terminal_remote',
  'agentsam_memory_manager','agentsam_autorag','agentsam_send_email'
)
AND COALESCE(t.is_active, 1) = 1;

-- ── 5. Capability aliases (public name → executor when catalog key differs) ─────
INSERT OR IGNORE INTO agentsam_capability_aliases (
  id, abstract_capability, match_kind, match_value, capability_lane, priority, requires_approval, rationale, is_active, created_at, updated_at
) VALUES
  ('cap_oauth477_d1_query', 'agentsam_d1_query', 'tool_key', 'd1_query', 'develop', 1, 0, '477 remaster', 1, unixepoch(), unixepoch()),
  ('cap_oauth477_d1_write', 'agentsam_d1_write', 'tool_key', 'd1_write', 'develop', 1, 0, '477 remaster', 1, unixepoch(), unixepoch()),
  ('cap_oauth477_d1_migrate', 'agentsam_d1_migrate', 'tool_key', 'd1_migrations_draft', 'develop', 1, 0, '477 remaster', 1, unixepoch(), unixepoch()),
  ('cap_oauth477_supabase_query', 'agentsam_supabase_query', 'tool_key', 'hyperdrive_readonly_query', 'develop', 1, 0, '477 remaster', 1, unixepoch(), unixepoch()),
  ('cap_oauth477_supabase_write', 'agentsam_supabase_write', 'tool_key', 'supabase_write', 'develop', 1, 0, '477 remaster', 1, unixepoch(), unixepoch()),
  ('cap_oauth477_supabase_vector', 'agentsam_supabase_vector', 'tool_key', 'supabase_vector', 'develop', 1, 0, '477 remaster', 1, unixepoch(), unixepoch()),
  ('cap_oauth477_r2_get', 'agentsam_r2_get', 'tool_key', 'r2_read', 'develop', 1, 0, '477 remaster', 1, unixepoch(), unixepoch()),
  ('cap_oauth477_r2_put', 'agentsam_r2_put', 'tool_key', 'r2_write', 'develop', 1, 0, '477 remaster', 1, unixepoch(), unixepoch()),
  ('cap_oauth477_r2_delete', 'agentsam_r2_delete', 'tool_key', 'r2_delete', 'develop', 1, 0, '477 remaster', 1, unixepoch(), unixepoch()),
  ('cap_oauth477_kv', 'agentsam_kv_manage', 'tool_key', 'agentsam_kv_manage', 'develop', 1, 0, '477 remaster', 1, unixepoch(), unixepoch()),
  ('cap_oauth477_cf_vec', 'agentsam_cf_vectorize', 'tool_key', 'agentsam_vectorize_describe', 'develop', 1, 0, '477 remaster', 1, unixepoch(), unixepoch()),
  ('cap_oauth477_gh_read', 'agentsam_github_read', 'tool_key', 'github_file', 'develop', 1, 0, '477 remaster', 1, unixepoch(), unixepoch()),
  ('cap_oauth477_gh_write', 'agentsam_github_write', 'tool_key', 'github_update_file', 'develop', 1, 0, '477 remaster', 1, unixepoch(), unixepoch()),
  ('cap_oauth477_gh_pr', 'agentsam_github_pr', 'tool_key', 'github_create_pr', 'develop', 1, 0, '477 remaster', 1, unixepoch(), unixepoch()),
  ('cap_oauth477_gh_issue', 'agentsam_github_issue', 'tool_key', 'agentsam_github_issue', 'develop', 1, 0, '477 remaster', 1, unixepoch(), unixepoch()),
  ('cap_oauth477_w_deploy', 'agentsam_worker_deploy', 'tool_key', 'worker_deploy', 'develop', 1, 0, '477 remaster', 1, unixepoch(), unixepoch()),
  ('cap_oauth477_w_status', 'agentsam_worker_status', 'tool_key', 'deploy_status', 'develop', 1, 0, '477 remaster', 1, unixepoch(), unixepoch()),
  ('cap_oauth477_w_tail', 'agentsam_worker_tail', 'tool_key', 'agentsam_worker_tail', 'develop', 1, 0, '477 remaster', 1, unixepoch(), unixepoch()),
  ('cap_oauth477_term_local', 'agentsam_terminal_local', 'tool_key', 'agentsam_terminal_local', 'develop', 1, 0, '477 remaster', 1, unixepoch(), unixepoch()),
  ('cap_oauth477_term_sandbox', 'agentsam_terminal_sandbox', 'tool_key', 'agentsam_terminal_sandbox', 'develop', 1, 0, '477 remaster', 1, unixepoch(), unixepoch()),
  ('cap_oauth477_term_remote', 'agentsam_terminal_remote', 'tool_key', 'agentsam_terminal_remote', 'develop', 1, 0, '477 remaster', 1, unixepoch(), unixepoch()),
  ('cap_oauth477_memory', 'agentsam_memory_manager', 'tool_key', 'agentsam_memory_manager', 'develop', 1, 0, '477 remaster', 1, unixepoch(), unixepoch()),
  ('cap_oauth477_autorag', 'agentsam_autorag', 'tool_key', 'knowledge_search', 'develop', 1, 0, '477 remaster', 1, unixepoch(), unixepoch()),
  ('cap_oauth477_email', 'agentsam_send_email', 'tool_key', 'agentsam_send_email', 'develop', 1, 0, '477 remaster', 1, unixepoch(), unixepoch());

-- ── 6. OAuth allowlist + token snapshots → 24-tool surface ────────────────────
UPDATE agentsam_mcp_oauth_tool_allowlist
SET is_active = 0, expose_on_connector = 0, updated_at = unixepoch()
WHERE client_id = 'iam_mcp_inneranimalmedia'
  AND tool_key NOT IN (
    'agentsam_d1_query','agentsam_d1_write','agentsam_d1_migrate',
    'agentsam_supabase_query','agentsam_supabase_write','agentsam_supabase_vector',
    'agentsam_r2_get','agentsam_r2_put','agentsam_r2_delete','agentsam_kv_manage','agentsam_cf_vectorize',
    'agentsam_github_read','agentsam_github_write','agentsam_github_pr','agentsam_github_issue',
    'agentsam_worker_deploy','agentsam_worker_status','agentsam_worker_tail',
    'agentsam_terminal_local','agentsam_terminal_sandbox','agentsam_terminal_remote',
    'agentsam_memory_manager','agentsam_autorag','agentsam_send_email'
  );

INSERT OR IGNORE INTO agentsam_mcp_oauth_tool_allowlist (
  client_id, tool_key, access_class, sort_order, notes, is_active, expose_on_connector, runtime_contract_key, connector_priority, updated_at
)
SELECT
  'iam_mcp_inneranimalmedia',
  tool_key,
  CASE
    WHEN tool_key IN ('agentsam_d1_write','agentsam_d1_migrate','agentsam_supabase_write',
      'agentsam_r2_put','agentsam_r2_delete','agentsam_kv_manage',
      'agentsam_github_write','agentsam_github_pr','agentsam_github_issue',
      'agentsam_worker_deploy','agentsam_terminal_local','agentsam_terminal_sandbox','agentsam_terminal_remote',
      'agentsam_memory_manager','agentsam_send_email') THEN 'write'
    ELSE 'read'
  END,
  sort_order,
  '477 OAuth MCP remaster',
  1,
  1,
  tool_key,
  sort_order,
  unixepoch()
FROM agentsam_mcp_tools
WHERE COALESCE(oauth_visible, 0) = 1
  AND COALESCE(is_active, 1) = 1;

UPDATE agentsam_mcp_oauth_tool_allowlist
SET is_active = 1, expose_on_connector = 1, runtime_contract_key = tool_key, updated_at = unixepoch()
WHERE client_id = 'iam_mcp_inneranimalmedia'
  AND tool_key IN (
    'agentsam_d1_query','agentsam_d1_write','agentsam_d1_migrate',
    'agentsam_supabase_query','agentsam_supabase_write','agentsam_supabase_vector',
    'agentsam_r2_get','agentsam_r2_put','agentsam_r2_delete','agentsam_kv_manage','agentsam_cf_vectorize',
    'agentsam_github_read','agentsam_github_write','agentsam_github_pr','agentsam_github_issue',
    'agentsam_worker_deploy','agentsam_worker_status','agentsam_worker_tail',
    'agentsam_terminal_local','agentsam_terminal_sandbox','agentsam_terminal_remote',
    'agentsam_memory_manager','agentsam_autorag','agentsam_send_email'
  );

UPDATE mcp_workspace_tokens
SET allowed_tools = (
  SELECT COALESCE(json_group_array(tool_key), '[]')
  FROM (
    SELECT tool_key
    FROM agentsam_mcp_tools
    WHERE COALESCE(oauth_visible, 0) = 1
      AND COALESCE(is_active, 1) = 1
    ORDER BY lane ASC, COALESCE(sort_order, 0) ASC, tool_key ASC
  )
)
WHERE token_type = 'oauth'
  AND COALESCE(is_active, 1) = 1;
