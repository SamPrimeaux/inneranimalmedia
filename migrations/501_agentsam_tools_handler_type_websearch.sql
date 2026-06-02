-- 501: Distinct open-web surface — handler_type 'websearch' for search_web + web_fetch (not 'ai', not 'mybrowser').
-- Rebuild agentsam_tools CHECK (prod lacks websearch until this migration).
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/501_agentsam_tools_handler_type_websearch.sql

PRAGMA foreign_keys = OFF;

DROP VIEW IF EXISTS v_agentsam_route_capability_tool_matches_deduped;
DROP VIEW IF EXISTS v_agentsam_route_capability_tool_matches;
DROP VIEW IF EXISTS v_agentsam_mcp_tools_branded;
DROP VIEW IF EXISTS v_agentsam_mcp_tool_category_summary;
DROP VIEW IF EXISTS v_agentsam_mcp_tools_canonical;
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
      'browser_agentic','mybrowser','websearch','telemetry','eval',
      'task.planner','task.organizer','task.manager','workspace.reader'
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
  tool_code TEXT DEFAULT NULL,
  oauth_visible INTEGER NOT NULL DEFAULT 0
);

INSERT INTO agentsam_tools_websearch_migration SELECT * FROM agentsam_tools;

DROP TABLE agentsam_tools;

ALTER TABLE agentsam_tools_websearch_migration RENAME TO agentsam_tools;

UPDATE agentsam_tools
SET
  handler_type = 'websearch',
  tool_category = 'research.web',
  capability_key = COALESCE(NULLIF(trim(capability_key), ''), 'open_web_search'),
  handler_key = COALESCE(NULLIF(trim(handler_key), ''), 'search_web'),
  handler_config = '{"execution_lane":"open_web_search","web_backend":"tavily","dispatch_target":"search_web","dispatcher":"search_web","auth_source":"platform","not_browser":true,"not_workspace_search":true,"source_file":"src/tools/builtin/web.js"}',
  description = COALESCE(
    NULLIF(trim(description), ''),
    'Open-web discovery (public internet). Uses Tavily when TAVILY_API_KEY is set. Not MYBROWSER, not repo grep.'
  ),
  updated_at = unixepoch()
WHERE tool_key = 'search_web' OR tool_name = 'search_web';

UPDATE agentsam_tools
SET
  handler_type = 'websearch',
  tool_category = 'research.web',
  capability_key = COALESCE(NULLIF(trim(capability_key), ''), 'web_fetch'),
  handler_key = COALESCE(NULLIF(trim(handler_key), ''), 'web_fetch'),
  handler_config = '{"execution_lane":"web_fetch","dispatch_target":"web_fetch","dispatcher":"web_fetch","auth_source":"platform","not_browser":true,"not_workspace_search":true,"source_file":"src/tools/builtin/web.js"}',
  description = COALESCE(
    NULLIF(trim(description), ''),
    'Fetch a known public URL and return text (Worker fetch). Not MYBROWSER, not Tavily search.'
  ),
  updated_at = unixepoch()
WHERE tool_key = 'web_fetch' OR tool_name = 'web_fetch';

PRAGMA foreign_keys = ON;

-- ── Views (agentsam_tools SSOT — replaces dropped agentsam_mcp_tools mirrors) ──

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
