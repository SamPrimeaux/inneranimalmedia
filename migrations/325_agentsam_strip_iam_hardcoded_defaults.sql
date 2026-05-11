-- 325: Remove Inner Animal Media–scoped DEFAULTs on workspace_scope / workspace_id / tenant_id
-- so new rows must supply tenant/workspace explicitly at insert time (multi-tenant safe).
--
-- Backfills NULL/empty legacy rows only (does not rewrite existing non-null values).
--
-- Apply remote:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/325_agentsam_strip_iam_hardcoded_defaults.sql

PRAGMA foreign_keys = OFF;

-- Views reference agentsam_tools / agentsam_mcp_tools — drop before table rebuilds.
DROP VIEW IF EXISTS v_mcp_tools;
DROP VIEW IF EXISTS v_mcp_tool_execution;
DROP VIEW IF EXISTS v_mcp_tool_drift;

-- ── agentsam_tools: workspace_scope ─────────────────────────────────────────
UPDATE agentsam_tools
SET workspace_scope = '["ws_inneranimalmedia"]'
WHERE workspace_scope IS NULL OR trim(workspace_scope) = '';

CREATE TABLE agentsam_tools_new (
  id TEXT PRIMARY KEY DEFAULT ('ast_' || lower(hex(randomblob(8)))),
  tool_name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  tool_category TEXT NOT NULL,
  handler_type TEXT NOT NULL DEFAULT 'builtin'
    CHECK (handler_type IN ('builtin','mcp','r2','github','terminal','http','proxy','ai','d1')),
  description TEXT,
  input_schema TEXT,
  output_schema TEXT,
  linked_mcp_tool_id TEXT,
  mcp_service_url TEXT,
  handler_config TEXT DEFAULT '{}',
  intent_tags TEXT DEFAULT '[]',
  intent_category_tags TEXT,
  modes_json TEXT DEFAULT '["auto","build","chat"]',
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
  workspace_scope TEXT NOT NULL,
  subagent_profile_id TEXT DEFAULT NULL,
  schema_hint TEXT DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  is_global INTEGER DEFAULT 1
);

INSERT INTO agentsam_tools_new SELECT * FROM agentsam_tools;
DROP TABLE agentsam_tools;
ALTER TABLE agentsam_tools_new RENAME TO agentsam_tools;

-- ── agentsam_scripts: workspace_id ──────────────────────────────────────────
UPDATE agentsam_scripts
SET workspace_id = 'ws_inneranimalmedia'
WHERE workspace_id IS NULL OR trim(workspace_id) = '';

CREATE TABLE agentsam_scripts_new (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  description TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK(purpose IN ('deploy','build','test','ingest','benchmark','maintenance','dev','dangerous','audit')),
  runner TEXT NOT NULL DEFAULT 'npm' CHECK(runner IN ('npm','bash','node','python','sql','wrangler')),
  requires_env INTEGER NOT NULL DEFAULT 1,
  owner_only INTEGER NOT NULL DEFAULT 1,
  safe_to_run INTEGER NOT NULL DEFAULT 1,
  run_before TEXT,
  run_after TEXT,
  never_run_with TEXT,
  preferred_for TEXT,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  slug TEXT DEFAULT NULL,
  is_global INTEGER DEFAULT 1,
  body TEXT DEFAULT NULL,
  tenant_id TEXT DEFAULT NULL
);

INSERT INTO agentsam_scripts_new SELECT * FROM agentsam_scripts;
DROP TABLE agentsam_scripts;
ALTER TABLE agentsam_scripts_new RENAME TO agentsam_scripts;

CREATE INDEX idx_agentsam_scripts_workspace_path ON agentsam_scripts(workspace_id, path);
CREATE UNIQUE INDEX idx_scripts_slug ON agentsam_scripts(slug) WHERE slug IS NOT NULL;

-- ── agentsam_script_runs: workspace_id ────────────────────────────────────────
UPDATE agentsam_script_runs
SET workspace_id = 'ws_inneranimalmedia'
WHERE workspace_id IS NULL OR trim(workspace_id) = '';

CREATE TABLE agentsam_script_runs_new (
  id TEXT PRIMARY KEY DEFAULT ('sr_' || lower(hex(randomblob(8)))),
  script_id TEXT NOT NULL REFERENCES agentsam_scripts(id),
  workspace_id TEXT NOT NULL,
  triggered_by TEXT NOT NULL DEFAULT 'agent',
  trigger_source TEXT NOT NULL DEFAULT 'agent_sam'
    CHECK(trigger_source IN ('agent_sam','cursor','manual','github_push','scheduled','cicd')),
  cicd_run_id TEXT,
  git_commit_sha TEXT,
  git_branch TEXT DEFAULT 'main',
  environment TEXT NOT NULL DEFAULT 'production'
    CHECK(environment IN ('production','sandbox','staging','dev')),
  status TEXT NOT NULL DEFAULT 'running'
    CHECK(status IN ('running','passed','failed','skipped','cancelled')),
  exit_code INTEGER,
  duration_ms INTEGER,
  output_summary TEXT,
  error_message TEXT,
  cost_usd REAL DEFAULT 0,
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

INSERT INTO agentsam_script_runs_new SELECT * FROM agentsam_script_runs;
DROP TABLE agentsam_script_runs;
ALTER TABLE agentsam_script_runs_new RENAME TO agentsam_script_runs;

CREATE INDEX idx_agentsam_script_runs_workspace_started
  ON agentsam_script_runs(workspace_id, started_at DESC);
CREATE INDEX idx_agentsam_script_runs_script_started
  ON agentsam_script_runs(script_id, started_at DESC);
CREATE INDEX idx_agentsam_script_runs_status_started
  ON agentsam_script_runs(status, started_at DESC);
CREATE INDEX idx_agentsam_script_runs_trigger_source
  ON agentsam_script_runs(trigger_source, started_at DESC);
CREATE INDEX idx_agentsam_script_runs_cicd
  ON agentsam_script_runs(cicd_run_id)
  WHERE cicd_run_id IS NOT NULL;
CREATE INDEX idx_agentsam_script_runs_git_sha
  ON agentsam_script_runs(git_commit_sha)
  WHERE git_commit_sha IS NOT NULL;

-- ── agentsam_mcp_tool_execution: tenant_id ───────────────────────────────────
UPDATE agentsam_mcp_tool_execution
SET tenant_id = 'tenant_sam_primeaux'
WHERE tenant_id IS NULL OR trim(tenant_id) = '';

CREATE TABLE agentsam_mcp_tool_execution_new (
  id TEXT PRIMARY KEY,
  tool_id TEXT,
  tool_name TEXT,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  duration_ms INTEGER,
  cost_usd REAL DEFAULT 0,
  success INTEGER DEFAULT 1,
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  tenant_id TEXT NOT NULL,
  session_id TEXT,
  user_id TEXT,
  workflow_id TEXT,
  input_json TEXT DEFAULT '{}',
  requires_approval INTEGER DEFAULT 0,
  retry_count INTEGER DEFAULT 0,
  output_json TEXT DEFAULT '{}',
  tool_chain_id TEXT,
  agentsam_tools_id TEXT,
  workspace_id TEXT,
  agent_id TEXT,
  timed_out INTEGER DEFAULT 0,
  sla_breach INTEGER DEFAULT 0,
  timeout_ms INTEGER DEFAULT 30000,
  tool_key TEXT,
  action_type TEXT,
  resource_type TEXT,
  resource_id TEXT,
  actor_type TEXT DEFAULT 'user',
  actor_source TEXT,
  policy_decision_json TEXT DEFAULT '{}',
  denial_code TEXT,
  error_code TEXT,
  error_family TEXT,
  error_detail_json TEXT DEFAULT '{}',
  error_log_id TEXT
);

INSERT INTO agentsam_mcp_tool_execution_new SELECT * FROM agentsam_mcp_tool_execution;
DROP TABLE agentsam_mcp_tool_execution;
ALTER TABLE agentsam_mcp_tool_execution_new RENAME TO agentsam_mcp_tool_execution;

CREATE INDEX idx_mcp_exec_chain ON agentsam_mcp_tool_execution(tool_chain_id);
CREATE INDEX idx_mcp_exec_tenant_session ON agentsam_mcp_tool_execution(tenant_id, session_id);
CREATE INDEX idx_mcp_exec_workspace_tool ON agentsam_mcp_tool_execution(workspace_id, tool_name, created_at);

-- ── agentsam_webhook_events: tenant_id ────────────────────────────────────────
UPDATE agentsam_webhook_events
SET tenant_id = 'tenant_sam_primeaux'
WHERE tenant_id IS NULL OR trim(tenant_id) = '';

CREATE TABLE agentsam_webhook_events_new (
  id TEXT PRIMARY KEY DEFAULT ('whe_' || lower(hex(randomblob(8)))),
  tenant_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_id TEXT,
  payload_json TEXT,
  status TEXT CHECK(status IN ('received','processing','processed','failed','ignored')) DEFAULT 'received',
  response_id TEXT,
  model_key TEXT,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0,
  error_message TEXT,
  processed_at TEXT,
  received_at TEXT NOT NULL DEFAULT (datetime('now')),
  endpoint_id TEXT,
  source TEXT,
  repo_full_name TEXT,
  branch TEXT,
  commit_sha TEXT,
  commit_message TEXT,
  actor TEXT,
  author_username TEXT,
  author_email TEXT,
  headers_json TEXT,
  signature_valid INTEGER DEFAULT 1,
  ip_address TEXT,
  processing_error TEXT,
  created_at TEXT GENERATED ALWAYS AS (received_at) VIRTUAL
);

INSERT INTO agentsam_webhook_events_new (
  id, tenant_id, provider, event_type, event_id, payload_json, status,
  response_id, model_key, input_tokens, output_tokens, cost_usd, error_message,
  processed_at, received_at, endpoint_id, source, repo_full_name, branch,
  commit_sha, commit_message, actor, author_username, author_email, headers_json,
  signature_valid, ip_address, processing_error
)
SELECT
  id, tenant_id, provider, event_type, event_id, payload_json, status,
  response_id, model_key, input_tokens, output_tokens, cost_usd, error_message,
  processed_at, received_at, endpoint_id, source, repo_full_name, branch,
  commit_sha, commit_message, actor, author_username, author_email, headers_json,
  signature_valid, ip_address, processing_error
FROM agentsam_webhook_events;

DROP TABLE agentsam_webhook_events;
ALTER TABLE agentsam_webhook_events_new RENAME TO agentsam_webhook_events;

-- ── agentsam_mcp_tools: workspace_scope ───────────────────────────────────────
UPDATE agentsam_mcp_tools
SET workspace_scope = '["ws_inneranimalmedia"]'
WHERE workspace_scope IS NULL OR trim(workspace_scope) = '';

CREATE TABLE agentsam_mcp_tools_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tool_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  person_uuid TEXT,
  tool_name TEXT DEFAULT '',
  display_name TEXT DEFAULT '',
  tool_category TEXT DEFAULT 'mcp',
  mcp_service_url TEXT DEFAULT '',
  description TEXT DEFAULT '',
  input_schema TEXT DEFAULT '{}',
  output_schema TEXT DEFAULT '{}',
  intent_tags TEXT DEFAULT '[]',
  intent_category_tags TEXT DEFAULT '',
  modes_json TEXT DEFAULT '["auto","agent","debug"]',
  handler_config TEXT DEFAULT '{}',
  categories_json TEXT DEFAULT '[]',
  schema_hint TEXT DEFAULT '',
  risk_level TEXT DEFAULT 'low',
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  trigger_config_json TEXT DEFAULT '{}',
  trigger_type TEXT DEFAULT 'manual',
  steps_json TEXT DEFAULT '[]',
  timeout_seconds INTEGER DEFAULT 120,
  requires_approval INTEGER DEFAULT 0,
  estimated_cost_usd REAL DEFAULT 0.0,
  last_used_at TEXT,
  updated_at TEXT,
  handler_type TEXT DEFAULT 'builtin',
  is_active INTEGER DEFAULT 1,
  workspace_scope TEXT NOT NULL,
  is_degraded INTEGER NOT NULL DEFAULT 0,
  failure_rate REAL DEFAULT 0.0,
  avg_latency_ms REAL DEFAULT NULL,
  last_health_check INTEGER DEFAULT NULL,
  sort_priority INTEGER DEFAULT 50,
  cost_per_call_usd REAL DEFAULT 0.0,
  agentsam_tools_id TEXT,
  enabled INTEGER DEFAULT 1,
  tenant_id TEXT,
  workspace_id TEXT,
  agent_id TEXT,
  server_key TEXT,
  server_id TEXT,
  routing_scope TEXT DEFAULT 'workspace',
  last_error TEXT,
  health_status TEXT DEFAULT 'unknown',
  health_checked_at TEXT,
  UNIQUE(user_id, tool_key)
);

INSERT INTO agentsam_mcp_tools_new SELECT * FROM agentsam_mcp_tools;
DROP TABLE agentsam_mcp_tools;
ALTER TABLE agentsam_mcp_tools_new RENAME TO agentsam_mcp_tools;

CREATE INDEX idx_mcp_tools_category ON agentsam_mcp_tools(tool_category);
CREATE INDEX idx_mcp_tools_tenant_key ON agentsam_mcp_tools(tenant_id, tool_key, is_active);
CREATE INDEX idx_mcp_tools_tool_name ON agentsam_mcp_tools(tool_name);
CREATE INDEX idx_mcp_tools_workspace_active ON agentsam_mcp_tools(workspace_id, is_active, tool_key);

-- Restore views (definitions match pre-migration remote schema + migrations/274).
CREATE VIEW v_mcp_tools AS
SELECT
  t.id, t.tool_name, t.display_name, t.tool_category, t.description,
  t.input_schema, t.output_schema, t.handler_config, t.intent_tags,
  t.intent_category_tags, t.modes_json, t.risk_level, t.requires_approval,
  t.requires_confirmation, t.is_active, t.is_degraded, t.failure_rate,
  t.avg_latency_ms, t.use_count, t.mcp_service_url,
  m.trigger_type, m.trigger_config_json, m.steps_json,
  m.timeout_seconds, m.categories_json, m.user_id, m.person_uuid
FROM agentsam_tools t
LEFT JOIN agentsam_mcp_tools m ON m.agentsam_tools_id = t.id
WHERE t.handler_type = 'mcp';

CREATE VIEW v_mcp_tool_drift AS
SELECT
  t.tool_name, t.tool_category,
  t.is_active AS enabled,
  t.mcp_service_url,
  COALESCE(c.call_count, 0) AS total_calls,
  COALESCE(c.last_called, 'never') AS last_called,
  CASE
    WHEN COALESCE(c.call_count, 0) > 0 THEN 'active'
    WHEN t.is_active = 1 THEN 'registered_unused'
    ELSE 'disabled'
  END AS status
FROM agentsam_mcp_tools t
LEFT JOIN (
  SELECT tool_name, COUNT(*) AS call_count, MAX(created_at) AS last_called
  FROM agentsam_tool_call_log
  GROUP BY tool_name
) c ON c.tool_name = t.tool_name;

CREATE VIEW v_mcp_tool_execution AS
SELECT
  tc.id,
  tc.tool_id              AS tool_id,
  tc.tool_name,
  tc.input_tokens,
  tc.output_tokens,
  tc.duration_ms,
  tc.cost_usd,
  CASE WHEN tc.tool_status = 'completed' THEN 1 ELSE 0 END AS success,
  tc.error_message,
  datetime(tc.started_at, 'unixepoch') AS created_at,
  tc.agent_session_id     AS session_id,
  NULL                    AS workflow_id,
  tc.input_json,
  tc.requires_approval,
  tc.retry_count,
  tc.result_json          AS output_json
FROM agentsam_tool_chain tc
WHERE tc.tool_id IN (SELECT id FROM agentsam_tools WHERE handler_type = 'mcp');

PRAGMA foreign_keys = ON;
