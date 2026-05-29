-- 457: FOLLOW-UP (maintenance window) — add handler_type 'websearch' to agentsam_tools CHECK.
-- DO NOT apply in the same hot deploy as open-web lane work unless you have verified views/FKs.
--
-- Pre-check (remote):
--   SELECT sql FROM sqlite_master WHERE type='table' AND name='agentsam_tools';
--
-- After apply: search_web row uses handler_type='websearch'; executor case 'websearch' in catalog-tool-executor.js.

PRAGMA foreign_keys = OFF;

DROP VIEW IF EXISTS v_mcp_tools;
DROP VIEW IF EXISTS v_mcp_tool_execution;
DROP VIEW IF EXISTS v_mcp_tool_drift;

CREATE TABLE agentsam_tools_websearch_migration (
  id TEXT PRIMARY KEY DEFAULT ('ast_' || lower(hex(randomblob(8)))),
  tool_name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  tool_category TEXT NOT NULL,
  handler_type TEXT NOT NULL DEFAULT 'mcp'
    CHECK (handler_type IN (
      'mcp','r2','github','terminal','http','proxy','ai','d1',
      'hyperdrive','supabase','kv','durable_object','filesystem',
      'browser_agentic','mybrowser','telemetry','eval',
      'task.planner','task.organizer','task.manager','workspace.reader',
      'websearch'
    )),
  description TEXT,
  input_schema TEXT,
  output_schema TEXT,
  linked_mcp_tool_id TEXT,
  mcp_service_url TEXT,
  handler_config TEXT DEFAULT '{}',
  intent_tags TEXT DEFAULT '[]',
  intent_category_tags TEXT,
  modes_json TEXT DEFAULT '["agent","plan","debug","multitask","ask"]',
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
  workspace_scope TEXT NOT NULL DEFAULT '["*"]',
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
  tool_code TEXT DEFAULT NULL
);

INSERT INTO agentsam_tools_websearch_migration SELECT * FROM agentsam_tools;

DROP TABLE agentsam_tools;

ALTER TABLE agentsam_tools_websearch_migration RENAME TO agentsam_tools;

UPDATE agentsam_tools
SET
  handler_type = 'websearch',
  handler_config = '{"execution_lane":"open_web_search","web_backend":"tavily","dispatch_target":"search_web","dispatcher":"search_web","auth_source":"platform","not_browser":true,"not_workspace_search":true,"source_file":"src/tools/builtin/web.js"}',
  updated_at = unixepoch()
WHERE tool_key = 'search_web';

PRAGMA foreign_keys = ON;

-- Recreate v_mcp_tools if missing (minimal; extend from migration 450 if drift checks fail).
CREATE VIEW IF NOT EXISTS v_mcp_tools AS
SELECT
  t.tool_key AS tool_name,
  COALESCE(NULLIF(trim(t.display_name), ''), t.tool_key) AS display_name,
  COALESCE(NULLIF(trim(t.tool_category), ''), 'agent') AS tool_category,
  COALESCE(t.mcp_service_url, 'https://mcp.inneranimalmedia.com/mcp') AS mcp_service_url,
  COALESCE(t.description, '') AS description,
  COALESCE(t.input_schema, '{}') AS input_schema,
  COALESCE(t.handler_type, 'mcp') AS handler_type,
  COALESCE(t.handler_config, '{}') AS handler_config,
  COALESCE(t.modes_json, '["auto","agent","debug"]') AS modes_json,
  COALESCE(t.risk_level, 'low') AS risk_level,
  COALESCE(t.requires_approval, 0) AS requires_approval,
  1 AS is_available,
  COALESCE(t.is_active, 1) AS is_active,
  COALESCE(t.workspace_scope, '["*"]') AS workspace_scope,
  'workspace' AS scope_type,
  t.id AS agentsam_tools_id,
  unixepoch() AS synced_at
FROM agentsam_tools t
WHERE COALESCE(t.is_active, 1) = 1
  AND COALESCE(t.is_degraded, 0) = 0
  AND trim(COALESCE(t.tool_key, '')) != '';
