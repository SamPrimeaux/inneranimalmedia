-- 502: agentsam_tools catalog refactor — deactivate legacy rows, handler_type lanes,
-- auth_source consolidation, dispatch_target column, workspace-scoped deploy.
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml \
--     --file=migrations/502_agentsam_tools_refactor.sql

PRAGMA foreign_keys = OFF;

-- ─── Pre-step: Expand handler_type CHECK + add dispatch_target column ─────────
-- SQLite cannot ALTER CHECK constraints; rebuild agentsam_tools in place.
DROP VIEW IF EXISTS v_agentsam_mcp_tools_branded;
DROP VIEW IF EXISTS v_agentsam_mcp_tools_canonical;
DROP VIEW IF EXISTS v_agentsam_mcp_tool_category_summary;
DROP VIEW IF EXISTS v_agentsam_route_capability_tool_matches;
DROP VIEW IF EXISTS v_agentsam_route_capability_tool_matches_deduped;
DROP VIEW IF EXISTS v_mcp_tools;
DROP VIEW IF EXISTS v_mcp_tool_execution;

DROP TABLE IF EXISTS agentsam_tools_new;
CREATE TABLE agentsam_tools_new (
  id TEXT PRIMARY KEY DEFAULT ('ast_' || lower(hex(randomblob(8)))),
  tool_name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  tool_category TEXT NOT NULL,
  handler_type TEXT NOT NULL DEFAULT 'mcp'
    CHECK (handler_type IN (
      'mcp','r2','github','terminal','http','proxy','ai','d1',
      'hyperdrive','supabase','kv','durable_object','filesystem',
      'browser_agentic','mybrowser','websearch','telemetry','eval',
      'task.planner','task.organizer','task.manager','workspace.reader',
      -- New semantic lanes (502)
      'cf','deploy','git','memory','notify','workflow','agent',
      'browser','media','canvas','integrations'
    )),
  description TEXT,
  input_schema TEXT,
  output_schema TEXT,
  linked_mcp_tool_id TEXT,
  mcp_service_url TEXT,
  handler_config TEXT DEFAULT '{}',
  intent_tags TEXT DEFAULT '[]',
  intent_category_tags TEXT,
  modes_json TEXT DEFAULT '[\"agent\",\"plan\",\"debug\",\"multitask\",\"ask\"]',
  risk_level TEXT NOT NULL DEFAULT 'low'
    CHECK (risk_level IN ('low','medium','high','critical')),
  requires_approval INTEGER NOT NULL DEFAULT 0,
  requires_confirmation INTEGER NOT NULL DEFAULT 0,
  token_budget_per_call INTEGER DEFAULT NULL,
  max_calls_per_session INTEGER DEFAULT NULL,
  cost_per_call_usd REAL DEFAULT 0.0,
  is_active INTEGER NOT NULL DEFAULT 1,
  is_degraded INTEGER NOT NULL DEFAULT 0,
  failure_rate REAL DEFAULT 0.0,
  avg_latency_ms REAL DEFAULT NULL,
  use_count INTEGER NOT NULL DEFAULT 0,
  last_used_at INTEGER DEFAULT NULL,
  last_health_check INTEGER DEFAULT NULL,
  sort_priority INTEGER DEFAULT 50,
  workspace_scope TEXT NOT NULL DEFAULT '[\"*\"]',
  subagent_profile_id TEXT DEFAULT NULL,
  schema_hint TEXT DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  is_global INTEGER DEFAULT 1,
  tool_key TEXT,
  capability_key TEXT,
  handler_key TEXT,
  route_key TEXT,
  workflow_key TEXT,
  task_type TEXT DEFAULT 'tool_use',
  domain TEXT DEFAULT 'general',
  capability_tier TEXT DEFAULT 'common',
  internal_seo TEXT DEFAULT '',
  tool_code TEXT DEFAULT NULL,
  oauth_visible INTEGER NOT NULL DEFAULT 0,
  dispatch_target TEXT NOT NULL DEFAULT 'internal'
);

INSERT INTO agentsam_tools_new (
  id, tool_name, display_name, tool_category, handler_type,
  description, input_schema, output_schema, linked_mcp_tool_id, mcp_service_url,
  handler_config, intent_tags, intent_category_tags, modes_json,
  risk_level, requires_approval, requires_confirmation,
  token_budget_per_call, max_calls_per_session, cost_per_call_usd,
  is_active, is_degraded, failure_rate, avg_latency_ms, use_count,
  last_used_at, last_health_check, sort_priority, workspace_scope,
  subagent_profile_id, schema_hint, notes, created_at, updated_at,
  is_global, tool_key, capability_key, handler_key,
  route_key, workflow_key, task_type, domain, capability_tier,
  internal_seo, tool_code, oauth_visible, dispatch_target
)
SELECT
  id, tool_name, display_name, tool_category, handler_type,
  description, input_schema, output_schema, linked_mcp_tool_id, mcp_service_url,
  handler_config, intent_tags, intent_category_tags, modes_json,
  risk_level, requires_approval, requires_confirmation,
  token_budget_per_call, max_calls_per_session, cost_per_call_usd,
  is_active, is_degraded, failure_rate, avg_latency_ms, use_count,
  last_used_at, last_health_check, sort_priority, workspace_scope,
  subagent_profile_id, schema_hint, notes, created_at, updated_at,
  is_global, tool_key, capability_key, handler_key,
  route_key, workflow_key, task_type, domain, capability_tier,
  internal_seo, tool_code, oauth_visible, 'internal' AS dispatch_target
FROM agentsam_tools;

DROP TABLE agentsam_tools;
ALTER TABLE agentsam_tools_new RENAME TO agentsam_tools;

-- Recreate views that depend on agentsam_tools
CREATE VIEW v_agentsam_mcp_tools_branded AS
SELECT
  t.id,
  t.tool_name,
  t.tool_category,
  t.handler_type,
  COALESCE(NULLIF(trim(t.handler_type), ''), 'workspace') AS handler_brand,
  CASE
    WHEN lower(COALESCE(t.handler_type, '')) = 'mybrowser' THEN 'inspect'
    WHEN lower(COALESCE(t.handler_type, '')) = 'websearch' THEN 'research'
    WHEN lower(COALESCE(t.tool_category, '')) IN ('terminal', 'shell', 'deploy') THEN 'develop'
    WHEN lower(COALESCE(t.tool_category, '')) IN ('db_query', 'd1', 'database') THEN 'develop'
    WHEN lower(COALESCE(t.tool_category, '')) IN ('browser', 'devtools', 'a11y', 'inspect') THEN 'inspect'
    WHEN lower(COALESCE(t.tool_category, '')) IN ('research.web', 'mcp_tool', 'http', 'web_fetch', 'fetch') THEN 'research'
    WHEN lower(COALESCE(t.tool_category, '')) IN ('operate', 'cron', 'queue') THEN 'operate'
    WHEN lower(COALESCE(t.tool_category, '')) IN ('observe', 'metrics', 'logs') THEN 'observe'
    WHEN lower(COALESCE(t.tool_category, '')) IN ('admin', 'billing') THEN 'admin'
    ELSE 'general'
  END AS capability_lane,
  CASE WHEN COALESCE(t.requires_approval, 0) = 1 THEN 'approval_required' ELSE 'standard' END AS safety_badge,
  t.description,
  t.input_schema,
  COALESCE(NULLIF(trim(t.risk_level), ''), 'low') AS risk_level,
  t.requires_approval,
  COALESCE(t.is_active, 1) AS enabled,
  COALESCE(t.sort_priority, 50) AS sort_priority,
  t.schema_hint,
  t.avg_latency_ms,
  t.failure_rate,
  COALESCE(NULLIF(trim(t.tool_key), ''), NULLIF(trim(t.tool_name), '')) AS tool_key,
  COALESCE(
    NULLIF(lower(trim(t.capability_key)), ''),
    NULLIF(lower(trim(t.tool_key)), ''),
    NULLIF(lower(trim(t.tool_name)), ''),
    lower(replace(trim(COALESCE(t.tool_category, 'mcp')), ' ', '_'))
      || ':'
      || lower(replace(trim(COALESCE(t.tool_name, '')), ' ', '_'))
  ) AS capability_key,
  NULL AS server_key,
  t.id AS agentsam_tools_id,
  t.mcp_service_url
FROM agentsam_tools t
WHERE COALESCE(t.is_active, 1) = 1
  AND COALESCE(t.is_degraded, 0) = 0;

CREATE VIEW v_agentsam_mcp_tools_canonical AS
SELECT
  t.*,
  COALESCE(t.is_active, 1) AS enabled,
  1 AS rn
FROM agentsam_tools t
WHERE COALESCE(t.is_active, 1) = 1
  AND COALESCE(t.is_degraded, 0) = 0;

CREATE VIEW v_mcp_tools AS
SELECT
  t.tool_key AS tool_name,
  COALESCE(NULLIF(trim(t.display_name), ''), t.tool_key) AS display_name,
  COALESCE(NULLIF(trim(t.tool_category), ''), 'agent') AS tool_category,
  COALESCE(t.mcp_service_url, 'https://mcp.inneranimalmedia.com/mcp') AS mcp_service_url,
  COALESCE(t.description, '') AS description,
  COALESCE(t.input_schema, '{}') AS input_schema,
  COALESCE(t.handler_type, 'mcp') AS handler_type,
  COALESCE(t.handler_config, '{}') AS handler_config,
  COALESCE(t.modes_json, '[\"auto\",\"agent\",\"debug\"]') AS modes_json,
  COALESCE(t.risk_level, 'low') AS risk_level,
  COALESCE(t.requires_approval, 0) AS requires_approval,
  1 AS is_available,
  COALESCE(t.is_active, 1) AS is_active,
  COALESCE(t.workspace_scope, '[\"*\"]') AS workspace_scope,
  'workspace' AS scope_type,
  t.id AS agentsam_tools_id,
  unixepoch() AS synced_at
FROM agentsam_tools t
WHERE COALESCE(t.is_active, 1) = 1
  AND COALESCE(t.is_degraded, 0) = 0
  AND trim(COALESCE(t.tool_key, '')) != '';

CREATE VIEW v_mcp_tool_execution AS
SELECT
  tc.id,
  tc.tool_id AS tool_id,
  tc.tool_name,
  tc.input_tokens,
  tc.output_tokens,
  tc.duration_ms,
  tc.cost_usd,
  CASE WHEN tc.tool_status = 'completed' THEN 1 ELSE 0 END AS success,
  tc.error_message,
  datetime(tc.started_at, 'unixepoch') AS created_at,
  tc.agent_session_id AS session_id,
  NULL AS workflow_id,
  tc.input_json,
  tc.requires_approval,
  tc.retry_count,
  tc.result_json AS output_json
FROM agentsam_tool_chain tc
WHERE tc.tool_id IN (SELECT id FROM agentsam_tools WHERE handler_type = 'mcp');

CREATE VIEW v_agentsam_mcp_tool_category_summary AS
SELECT
  tool_category,
  handler_type,
  COUNT(*) AS tool_count,
  SUM(CASE WHEN requires_approval = 1 THEN 1 ELSE 0 END) AS approval_required_count,
  SUM(CASE WHEN risk_level IN ('high','critical') THEN 1 ELSE 0 END) AS high_risk_count,
  AVG(COALESCE(avg_latency_ms, 0)) AS avg_latency_ms,
  AVG(COALESCE(failure_rate, 0)) AS avg_failure_rate,
  GROUP_CONCAT(tool_name) AS tool_names
FROM v_agentsam_mcp_tools_canonical
GROUP BY tool_category, handler_type
ORDER BY tool_category, handler_type;

CREATE VIEW v_agentsam_route_capability_tool_matches AS
WITH route_caps AS (
  SELECT
    rr.route_key,
    rr.mode,
    'required' AS cap_source,
    lower(replace(json_each.value, '_', '.')) AS normalized_capability,
    json_each.value AS original_capability
  FROM agentsam_route_requirements rr, json_each(rr.required_capability_keys_json)
  UNION ALL
  SELECT
    rr.route_key,
    rr.mode,
    'optional' AS cap_source,
    lower(replace(json_each.value, '_', '.')) AS normalized_capability,
    json_each.value AS original_capability
  FROM agentsam_route_requirements rr, json_each(rr.optional_capability_keys_json)
  UNION ALL
  SELECT
    rr.route_key,
    rr.mode,
    'blocked' AS cap_source,
    lower(replace(json_each.value, '_', '.')) AS normalized_capability,
    json_each.value AS original_capability
  FROM agentsam_route_requirements rr, json_each(rr.blocked_capability_keys_json)
),
alias_matches AS (
  SELECT
    rc.route_key,
    rc.mode,
    rc.cap_source,
    rc.original_capability,
    rc.normalized_capability,
    a.abstract_capability,
    a.match_kind,
    a.match_value,
    a.priority AS alias_priority,
    a.requires_approval AS alias_requires_approval,
    a.is_mutation AS alias_is_mutation,
    a.rationale
  FROM route_caps rc
  JOIN agentsam_capability_aliases a
    ON a.is_active = 1
   AND lower(a.abstract_capability) = rc.normalized_capability
)
SELECT DISTINCT
  am.route_key,
  am.mode,
  am.cap_source,
  am.original_capability,
  am.normalized_capability,
  am.abstract_capability,
  am.match_kind,
  am.match_value,
  am.alias_priority,
  am.alias_requires_approval,
  am.alias_is_mutation,
  v.id AS tool_id,
  v.tool_name,
  v.tool_key,
  v.tool_category,
  v.handler_brand,
  v.capability_lane,
  v.capability_key,
  v.risk_level,
  v.requires_approval AS tool_requires_approval,
  v.sort_priority,
  am.rationale
FROM alias_matches am
JOIN v_agentsam_mcp_tools_branded v
  ON (
    (am.match_kind = 'tool_key' AND lower(v.tool_key) = lower(am.match_value))
    OR (am.match_kind = 'capability_key' AND lower(v.capability_key) = lower(am.match_value))
    OR (am.match_kind = 'tool_name' AND lower(v.tool_name) = lower(am.match_value))
    OR (am.match_kind = 'capability_lane' AND lower(v.capability_lane) = lower(am.match_value))
    OR (am.match_kind = 'tool_category' AND lower(v.tool_category) = lower(am.match_value))
    OR (am.match_kind = 'handler_brand' AND lower(v.handler_brand) = lower(am.match_value))
  )
WHERE COALESCE(v.enabled, 0) = 1;

CREATE VIEW v_agentsam_route_capability_tool_matches_deduped AS
WITH ranked AS (
  SELECT
    m.*,
    ROW_NUMBER() OVER (
      PARTITION BY route_key, mode, cap_source, original_capability, tool_key
      ORDER BY alias_priority ASC, sort_priority ASC, tool_id ASC
    ) AS rn
  FROM v_agentsam_route_capability_tool_matches m
)
SELECT
  route_key, mode, cap_source, original_capability, normalized_capability,
  abstract_capability, match_kind, match_value, alias_priority,
  alias_requires_approval, alias_is_mutation, tool_id, tool_name, tool_key,
  tool_category, handler_brand, capability_lane, capability_key, risk_level,
  tool_requires_approval, sort_priority, rationale
FROM ranked
WHERE rn = 1;

-- ─── Step 1: Deactivate legacy/duplicate rows ───────────────────────────────
UPDATE agentsam_tools SET is_active = 0, updated_at = unixepoch()
WHERE tool_name IN (
  'agentsam_db_query', 'agentsam_db_schema', 'agentsam_db_write',
  'd1_query', 'd1_schema', 'd1_write',
  'd1_explain', 'd1_migrations_draft',
  'agentsam_spend_summary', 'agentsam_search_tools',
  'agentsam_health_check', 'agentsam_workspace_context',
  'agentsam_recent_errors', 'agentsam_workflow_status',
  'agentsam_get_agent', 'agentsam_todo_add', 'agentsam_todo_update',
  'github_file', 'github_repos', 'github_create_file',
  'github_update_file', 'github_create_pr', 'github_merge_pr',
  'github_create_branch', 'agentsam_github_pr_create',
  'r2_read', 'r2_write', 'r2_list', 'r2_search', 'r2_delete',
  'agentsam_r2_read', 'agentsam_r2_write', 'agentsam_r2_list',
  'agentsam_r2_upload',
  'deploy_status', 'agentsam_deploy_status',
  'get_deploy_command', 'get_worker_services',
  'list_workers', 'worker_deploy',
  'agentsam_worker_status',
  'agentsam_memory_query', 'agentsam_memory_save',
  'agentsam_memory_search', 'agentsam_memory_write',
  'hyperdrive_readonly_query', 'hyperdrive_schema_inspect',
  'platform_hyperdrive_agentsam_query',
  'supabase_query', 'supabase_schema',
  'supabase_vector', 'supabase_write',
  'knowledge_search', 'docs_knowledge_search',
  'deep_archive_search', 'schema_semantic_search',
  'memory_semantic_search', 'code_semantic_search',
  'vectorize_query', 'vectorize_upsert', 'ai_embed',
  'database_assistant',
  'agentsam_cms_read', 'agentsam_cms_write', 'agentsam_cms_publish',
  'fs_read_file', 'fs_write_file', 'fs_edit_file',
  'pty_fs_read', 'pty_fs_write',
  'workspace_apply_patch', 'workspace_write_file',
  'workspace_read_file', 'workspace_list_files',
  'fs_search_files',
  'agentsam_find_and_act', 'mcp_dispatch',
  'generate_execution_plan', 'workflow_run_pipeline',
  'agentsam_daily_summary', 'agentsam_notify',
  'resend_send_email', 'resend_send_broadcast',
  'human_context_list', 'agentsam_codebase_create',
  'agentsam_worker_tail',
  'imgx_edit_image', 'imgx_list_providers',
  'social_card_generate', 'meshyai_image_to_3d',
  'browser_close_session', 'cdt_hover',
  'cdt_list_console_messages', 'cdt_list_network_requests',
  'cdt_navigate_page', 'cdt_take_snapshot',
  'playwright_screenshot',
  'gdrive_fetch', 'gdrive_list',
  'http_fetch', 'agentsam_vectorize_describe',
  'agentsam_cf_vectorize',
  'customer_cloudflare_d1_readonly_query',
  'customer_cloudflare_list_accounts', 'customer_cloudflare_list_d1',
  'customer_supabase_list_projects', 'customer_supabase_propose_migration',
  'customer_supabase_readonly_query', 'customer_supabase_schema_inspect',
  'customer_supabase_select_project',
  'public_learning_read_table', 'public_learning_search'
);

-- ─── Step 1b: Deactivate remaining legacy/placeholder tools + mode-controller stubs ───
-- agentsam_plan is reasoning wrapped in a tool. Deactivate it.
-- Model reads active plans via agentsam_d1_query on agentsam_plans directly.
UPDATE agentsam_tools SET is_active = 0, updated_at = unixepoch()
WHERE tool_name IN (
  'terminal_execute', 'terminal_run', 'terminal_wrangler',
  'workspace_search_semantic',
  'codemode',
  'rag_ingest', 'rag_status',
  'agentsam_run',
  'agentsam_plan'
);

-- ─── Step 2: Rename handler_type on canonical active rows ─────────────────────
UPDATE agentsam_tools SET handler_type = 'browser', updated_at = unixepoch()
WHERE handler_type = 'mybrowser' AND is_active = 1;

UPDATE agentsam_tools SET handler_type = 'filesystem', updated_at = unixepoch()
WHERE handler_type = 'workspace.reader' AND is_active = 1;

UPDATE agentsam_tools SET handler_type = 'cf', updated_at = unixepoch()
WHERE tool_name IN (
  'agentsam_d1_query', 'agentsam_d1_write', 'agentsam_d1_migrate'
) AND is_active = 1;

UPDATE agentsam_tools SET handler_type = 'cf', updated_at = unixepoch()
WHERE tool_name IN (
  'agentsam_kv_manage', 'cloudflare_command_registry'
) AND is_active = 1;

UPDATE agentsam_tools SET handler_type = 'cf', updated_at = unixepoch()
WHERE tool_name IN (
  'agentsam_r2_get', 'agentsam_r2_put', 'agentsam_r2_delete'
) AND is_active = 1;

UPDATE agentsam_tools SET handler_type = 'deploy', updated_at = unixepoch()
WHERE tool_name = 'agentsam_worker_deploy' AND is_active = 1;

UPDATE agentsam_tools SET handler_type = 'git', updated_at = unixepoch()
WHERE tool_name IN (
  'pty_git_commit', 'pty_git_diff', 'pty_git_log',
  'pty_git_push', 'pty_git_status'
) AND is_active = 1;

UPDATE agentsam_tools SET handler_type = 'memory', updated_at = unixepoch()
WHERE tool_name = 'agentsam_memory_manager' AND is_active = 1;

UPDATE agentsam_tools SET tool_category = 'knowledge.autorag', updated_at = unixepoch()
WHERE tool_name = 'agentsam_autorag' AND is_active = 1;

UPDATE agentsam_tools SET handler_type = 'notify', updated_at = unixepoch()
WHERE tool_name = 'agentsam_send_email' AND is_active = 1;

UPDATE agentsam_tools SET handler_type = 'workflow', updated_at = unixepoch()
WHERE tool_name IN (
  'agentsam_workflow_trigger'
) AND is_active = 1;

UPDATE agentsam_tools SET handler_type = 'agent', updated_at = unixepoch()
WHERE tool_name IN (
  'agentsam_spawn_profile', 'agentsam_list_agents',
  'agentsam_codebase_scan_fix'
) AND is_active = 1;

UPDATE agentsam_tools SET handler_type = 'media', updated_at = unixepoch()
WHERE tool_name IN (
  'imgx_generate_image', 'veo_generate_video',
  'meshyai_text_to_3d', 'moviemode_export'
) AND is_active = 1;

UPDATE agentsam_tools SET handler_type = 'canvas', updated_at = unixepoch()
WHERE tool_name = 'excalidraw_open' AND is_active = 1;

UPDATE agentsam_tools SET handler_type = 'integrations', updated_at = unixepoch()
WHERE tool_name = 'agentsam_drive_read' AND is_active = 1;

-- ─── Step 3: Rename auth_source in handler_config JSON ──────────────────────
UPDATE agentsam_tools
SET handler_config = json_set(handler_config, '$.auth_source', 'workspace'),
    updated_at = unixepoch()
WHERE json_extract(handler_config, '$.auth_source') IN ('platform', 'platform_scoped', 'customer')
  AND is_active = 1;

UPDATE agentsam_tools
SET handler_config = json_set(handler_config, '$.auth_source', 'workspace'),
    updated_at = unixepoch()
WHERE json_extract(handler_config, '$.auth_source') IN ('platform', 'platform_scoped', 'customer')
  AND is_active = 0;

-- ─── Step 4: Remove hardcoded paths and account IDs ─────────────────────────
UPDATE agentsam_tools
SET handler_config = json_remove(handler_config, '$.repo_root'),
    updated_at = unixepoch()
WHERE json_extract(handler_config, '$.repo_root') IS NOT NULL
  AND is_active = 1;

UPDATE agentsam_tools
SET handler_config = json_remove(handler_config, '$.account_id'),
    updated_at = unixepoch()
WHERE tool_name = 'cloudflare_command_registry';

-- ─── Step 5: workspace_scope on git/pty rows ────────────────────────────────
UPDATE agentsam_tools
SET workspace_scope = '["*"]', updated_at = unixepoch()
WHERE tool_name IN (
  'pty_git_commit', 'pty_git_diff', 'pty_git_log',
  'pty_git_push', 'pty_git_status',
  'pty_fs_read', 'pty_fs_write'
);

-- ─── Step 6: Update descriptions on canonical tools ─────────────────────────
UPDATE agentsam_tools SET description = 'Read-only SELECT or schema introspect on workspace D1 database. Resolves DB binding from authenticated workspace — never crosses workspace boundaries.', updated_at = unixepoch()
WHERE tool_name = 'agentsam_d1_query';

UPDATE agentsam_tools SET description = 'INSERT, UPDATE, DELETE or DDL on workspace D1 database. Workspace-scoped — credential resolves from calling workspace. Requires approval for destructive operations.', updated_at = unixepoch()
WHERE tool_name = 'agentsam_d1_write';

UPDATE agentsam_tools SET description = 'Execute a D1 migration SQL file against workspace database. Always draft and review before applying. Requires approval.', updated_at = unixepoch()
WHERE tool_name = 'agentsam_d1_migrate';

UPDATE agentsam_tools SET description = 'Read or list R2 objects. Bucket resolves from workspace r2_roots config. Pass mode: read or mode: list. Never assumes a bucket — always pass bucket name explicitly.', updated_at = unixepoch()
WHERE tool_name = 'agentsam_r2_get';

UPDATE agentsam_tools SET description = 'Write or upload R2 object. Bucket resolves from workspace r2_roots config. Pass bucket, key, content. Requires approval for production buckets.', updated_at = unixepoch()
WHERE tool_name = 'agentsam_r2_put';

UPDATE agentsam_tools SET description = 'Delete R2 object by bucket and key. Irreversible. Requires approval.', updated_at = unixepoch()
WHERE tool_name = 'agentsam_r2_delete';

UPDATE agentsam_tools SET description = 'Read-only SELECT on IAM platform agentsam schema via Hyperdrive. PRIVATE — agentsam.* tables are IAM internal only, never exposed to end users. Do not query this on behalf of Connor or other users.', updated_at = unixepoch()
WHERE tool_name = 'agentsam_supabase_query';

UPDATE agentsam_tools SET description = 'INSERT/UPDATE/DELETE on IAM platform agentsam schema via Hyperdrive. PRIVATE — IAM internal only. Requires approval.', updated_at = unixepoch()
WHERE tool_name = 'agentsam_supabase_write';

UPDATE agentsam_tools SET description = 'pgvector similarity search on IAM platform agentsam schema via Hyperdrive. PRIVATE — IAM internal only.', updated_at = unixepoch()
WHERE tool_name = 'agentsam_supabase_vector';

UPDATE agentsam_tools SET description = 'Memory operations — search, write, upsert, list, delete. Pass operation param. Workspace-scoped always. D1 + pgvector backed. Use for storing and retrieving agent context, decisions, and long-term state.', updated_at = unixepoch()
WHERE tool_name = 'agentsam_memory_manager';

UPDATE agentsam_tools SET description = 'Shell command on workspace-local machine. workspace_root resolves from workspace_settings.settings_json. Sam gets his iMac path. Connor gets his configured path. User 100 gets theirs. Never hardcoded.', updated_at = unixepoch()
WHERE tool_name = 'agentsam_terminal_local';

UPDATE agentsam_tools SET description = 'Shell command on configured remote target. terminal_remote_target resolves from workspace_settings.settings_json for calling workspace.', updated_at = unixepoch()
WHERE tool_name = 'agentsam_terminal_remote';

UPDATE agentsam_tools SET description = 'Isolated sandbox shell — no workspace credential needed. Safe for untrusted or exploratory code execution.', updated_at = unixepoch()
WHERE tool_name = 'agentsam_terminal_sandbox';

UPDATE agentsam_tools SET description = 'Read file from GitHub repo by path and ref. Token resolves from user_oauth_tokens for the calling user — Sam gets SamPrimeaux repos, Connor gets connordmcneely96 repos. Never cross-contaminates.', updated_at = unixepoch()
WHERE tool_name = 'agentsam_github_read';

UPDATE agentsam_tools SET description = 'Write or update file in GitHub repo. Requires file SHA. Token resolves per calling user. Requires approval.', updated_at = unixepoch()
WHERE tool_name = 'agentsam_github_write';

UPDATE agentsam_tools SET description = 'List GitHub repos for authenticated user. Always scoped to calling user OAuth token — never returns another user''s repos.', updated_at = unixepoch()
WHERE tool_name = 'agentsam_github_repo_list';

UPDATE agentsam_tools SET description = 'Open pull request on GitHub. Token resolves per calling user. Requires approval.', updated_at = unixepoch()
WHERE tool_name = 'agentsam_github_pr';

UPDATE agentsam_tools SET description = 'Create or manage GitHub issues. Token resolves per calling user.', updated_at = unixepoch()
WHERE tool_name = 'agentsam_github_issue';

UPDATE agentsam_tools SET description = 'Grep or semantic search across workspace codebase. mode: grep for text pattern, mode: semantic for meaning-based search. workspace_root resolves from workspace_settings.', updated_at = unixepoch()
WHERE tool_name = 'workspace_search';

UPDATE agentsam_tools SET description = 'KV get, put, delete, or list. Namespace resolves from workspace CF account credentials. Pass operation and key.', updated_at = unixepoch()
WHERE tool_name = 'agentsam_kv_manage';

UPDATE agentsam_tools SET description = 'Cloudflare REST API dispatch. CF account ID and token resolve from workspace credentials — never hardcoded. Use for zones, DNS, pages, workers, R2 via CF API.', updated_at = unixepoch()
WHERE tool_name = 'cloudflare_command_registry';

UPDATE agentsam_tools
SET handler_config = json_set(
      json_remove(handler_config, '$.preferred_script', '$.api_only_script', '$.mcp_server', '$.tool_name'),
      '$.auth_source', 'workspace',
      '$.command_source', 'workspace_settings.deploy_command'
    ),
    description = 'Deploy workspace Worker. deploy_command resolves from workspace_settings.settings_json.deploy_command at dispatch time. If not configured for this workspace, returns an actionable error — never assumes a command, path, or account. Requires approval.',
    updated_at = unixepoch()
WHERE tool_name = 'agentsam_worker_deploy';

UPDATE agentsam_tools SET description = 'Send transactional email via Resend. From address resolves from workspace_settings. Handles single send or batch loop. Requires approval.', updated_at = unixepoch()
WHERE tool_name = 'agentsam_send_email';

UPDATE agentsam_tools SET description = 'Semantic search across platform docs and knowledge base via AutoRAG and pgvector. IAM platform knowledge only.', updated_at = unixepoch()
WHERE tool_name = 'agentsam_autorag';

UPDATE agentsam_tools SET description = 'Open Excalidraw canvas session for diagrams, wireframes, or visual planning. Available to all workspace users.', updated_at = unixepoch()
WHERE tool_name = 'excalidraw_open';

-- ─── Step 7: Rename tool names ──────────────────────────────────────────────
UPDATE agentsam_tools
SET tool_name = 'agentsam_excalidraw',
    tool_key = 'agentsam_excalidraw',
    display_name = 'Excalidraw Canvas',
    updated_at = unixepoch()
WHERE tool_name = 'excalidraw_open';

UPDATE agentsam_tools
SET tool_name = 'agentsam_workspace_search',
    tool_key = 'agentsam_workspace_search',
    display_name = 'Workspace Search',
    updated_at = unixepoch()
WHERE tool_name = 'workspace_search' AND handler_type = 'filesystem';

UPDATE agentsam_tools
SET tool_name = 'agentsam_gdrive',
    tool_key = 'agentsam_gdrive',
    display_name = 'Google Drive',
    updated_at = unixepoch()
WHERE tool_name = 'agentsam_drive_read';

-- ─── Step 8: Fix modes_json ─────────────────────────────────────────────────
UPDATE agentsam_tools
SET modes_json = '["agent","plan","debug","multitask","ask"]',
    updated_at = unixepoch()
WHERE tool_name = 'agentsam_memory_manager';

UPDATE agentsam_tools
SET modes_json = '["agent","multitask"]',
    updated_at = unixepoch()
WHERE tool_name IN ('imgx_generate_image', 'veo_generate_video', 'meshyai_text_to_3d', 'moviemode_export');

UPDATE agentsam_tools
SET modes_json = '["agent","debug"]',
    updated_at = unixepoch()
WHERE tool_name IN ('agentsam_terminal_local', 'agentsam_terminal_remote', 'agentsam_terminal_sandbox');

UPDATE agentsam_tools
SET modes_json = '["agent","debug"]',
    updated_at = unixepoch()
WHERE tool_name IN ('pty_git_commit', 'pty_git_diff', 'pty_git_log', 'pty_git_push', 'pty_git_status');

UPDATE agentsam_tools
SET modes_json = '["agent","debug"]',
    updated_at = unixepoch()
WHERE tool_name IN ('agentsam_github_write', 'agentsam_github_pr');

UPDATE agentsam_tools
SET modes_json = '["agent","debug"]',
    updated_at = unixepoch()
WHERE tool_name = 'agentsam_worker_deploy';

UPDATE agentsam_tools
SET modes_json = '["agent","debug"]',
    updated_at = unixepoch()
WHERE handler_type IN ('browser', 'mybrowser') AND is_active = 1;

UPDATE agentsam_tools
SET modes_json = '["agent"]',
    updated_at = unixepoch()
WHERE tool_name = 'agentsam_codebase_scan_fix';

UPDATE agentsam_tools
SET modes_json = '["agent","plan","multitask"]',
    updated_at = unixepoch()
WHERE tool_name = 'agentsam_excalidraw';

-- ─── Step 9: Insert new rows ────────────────────────────────────────────────
INSERT OR IGNORE INTO agentsam_tools (
  id, tool_name, tool_key, display_name,
  handler_type, tool_category, domain,
  handler_key, handler_config,
  description, modes_json,
  risk_level, requires_approval,
  is_active, oauth_visible, is_global,
  workspace_scope, intent_tags,
  sort_priority, dispatch_target,
  created_at, updated_at
) VALUES (
  'ast_supabase_project_query',
  'agentsam_supabase_project_query',
  'agentsam_supabase_project_query',
  'Supabase Project Query',
  'supabase', 'database.supabase.user', 'data',
  'agentsam_supabase_project_query',
  '{"operation":"readonly_sql","auth_source":"workspace","credential_path":"settings_json.supabase_url","schema":"public"}',
  'Read-only SELECT on user''s own Supabase project. Credential (supabase_url + anon key) resolves from workspace_settings.settings_json for the calling workspace. Connor''s lane — never touches IAM Hyperdrive or agentsam schema.',
  '["agent","plan","debug","multitask","ask"]',
  'low', 0,
  1, 0, 1,
  '["*"]', '["supabase","sql","query","user","project","database","read"]',
  50, 'internal',
  unixepoch(), unixepoch()
);

INSERT OR IGNORE INTO agentsam_tools (
  id, tool_name, tool_key, display_name,
  handler_type, tool_category, domain,
  handler_key, handler_config,
  description, modes_json,
  risk_level, requires_approval,
  is_active, oauth_visible, is_global,
  workspace_scope, intent_tags,
  sort_priority, dispatch_target,
  created_at, updated_at
) VALUES (
  'ast_supabase_project_write',
  'agentsam_supabase_project_write',
  'agentsam_supabase_project_write',
  'Supabase Project Write',
  'supabase', 'database.supabase.user', 'data',
  'agentsam_supabase_project_write',
  '{"operation":"execute_sql","auth_source":"workspace","credential_path":"settings_json.supabase_url","schema":"public","requires_approval":true}',
  'INSERT/UPDATE/DELETE on user''s own Supabase project. Credential resolves from workspace_settings.settings_json. Never touches IAM agentsam schema. Requires approval.',
  '["agent","debug"]',
  'medium', 1,
  1, 0, 1,
  '["*"]', '["supabase","sql","write","insert","update","delete","user","project"]',
  50, 'internal',
  unixepoch(), unixepoch()
);

INSERT OR IGNORE INTO agentsam_tools (
  id, tool_name, tool_key, display_name,
  handler_type, tool_category, domain,
  handler_key, handler_config,
  description, modes_json,
  risk_level, requires_approval,
  is_active, oauth_visible, is_global,
  workspace_scope, intent_tags,
  sort_priority, dispatch_target,
  created_at, updated_at
) VALUES (
  'ast_agentsam_playwright',
  'agentsam_playwright',
  'agentsam_playwright',
  'Playwright Browser',
  'browser', 'browser.automation', 'inspect',
  'agentsam_playwright',
  '{"auth_source":"workspace","binding":"MYBROWSER","executor":"playwright","dispatcher":"playwright_screenshot","source_file":"src/tools/builtin/web.js","trusted_origins_table":"agentsam_browser_trusted_origin"}',
  'Full Playwright browser automation. operation: screenshot (full-page visual capture + job tracking), navigate (go to URL), scrape (get page text/DOM), capture (screenshot of current session state). In-app only — never routes through MCP server. Trusted origin enforced.',
  '["agent","debug"]',
  'medium', 0,
  1, 0, 1,
  '["*"]', '["playwright","browser","screenshot","navigate","scrape","capture","visual","automation","test","inspect"]',
  50, 'internal',
  unixepoch(), unixepoch()
);

-- ─── Step 10: Populate dispatch_target ──────────────────────────────────────
UPDATE agentsam_tools
SET dispatch_target = 'both', updated_at = unixepoch()
WHERE oauth_visible = 1 AND is_active = 1;

UPDATE agentsam_tools
SET dispatch_target = 'mcp_proxy', updated_at = unixepoch()
WHERE tool_name IN (
  'agentsam_worker_deploy', 'agentsam_spawn_profile'
) AND is_active = 1;

-- mcp_proxy on deactivated legacy rows (historical consistency before catalog trim)
UPDATE agentsam_tools
SET dispatch_target = 'mcp_proxy', updated_at = unixepoch()
WHERE tool_name IN (
  'agentsam_worker_status', 'worker_deploy', 'deploy_status',
  'get_deploy_command', 'get_worker_services', 'list_workers',
  'human_context_list', 'generate_execution_plan', 'workflow_run_pipeline'
);

-- ─── Step 11: MCP OAuth allowlist ───────────────────────────────────────────
INSERT OR IGNORE INTO agentsam_mcp_oauth_tool_allowlist
  (client_id, tool_key, sort_order, is_active)
VALUES
  ('iam_mcp_inneranimalmedia', 'agentsam_excalidraw', 200, 1),
  ('iam_mcp_inneranimalmedia', 'agentsam_workspace_search', 201, 1),
  ('iam_mcp_inneranimalmedia', 'agentsam_gdrive', 202, 1),
  ('iam_mcp_inneranimalmedia', 'agentsam_playwright', 203, 0),
  ('iam_mcp_inneranimalmedia', 'agentsam_supabase_project_query', 204, 0),
  ('iam_mcp_inneranimalmedia', 'agentsam_supabase_project_write', 205, 0);

UPDATE agentsam_mcp_oauth_tool_allowlist
SET is_active = 0
WHERE tool_key IN (
  'excalidraw_open', 'agentsam_drive_read', 'workspace_search',
  'agentsam_find_and_act', 'mcp_dispatch', 'agentsam_daily_summary',
  'agentsam_notify', 'resend_send_email', 'resend_send_broadcast',
  'deploy_status', 'worker_deploy', 'get_deploy_command',
  'get_worker_services', 'list_workers', 'human_context_list',
  'generate_execution_plan', 'workflow_run_pipeline',
  'knowledge_search', 'docs_knowledge_search',
  'agentsam_cms_read', 'agentsam_cms_write', 'agentsam_cms_publish',
  'agentsam_worker_tail', 'agentsam_cf_vectorize',
  'agentsam_github_issue_create', 'agentsam_github_pr_create',
  'github_repos', 'github_file', 'agentsam_search_tools',
  'agentsam_spend_summary', 'agentsam_health_check',
  'agentsam_workspace_context', 'agentsam_worker_status'
);

PRAGMA foreign_keys = ON;
