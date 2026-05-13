-- 332: Tool routing policy columns on agentsam_route_requirements + branded MCP tools view.
-- Safe to re-run on environments that already applied equivalent DDL: use IF NOT EXISTS guards
-- where possible; ALTER ADD COLUMN may no-op or fail on duplicate — run via migration runner
-- that tolerates "duplicate column" errors, or apply manually once per database.
--
-- Apply (example):
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml \
--     --file=./migrations/332_agentsam_route_tool_policy_and_branded_view.sql

ALTER TABLE agentsam_route_requirements ADD COLUMN allowed_lanes_json TEXT;
ALTER TABLE agentsam_route_requirements ADD COLUMN required_capability_keys_json TEXT;
ALTER TABLE agentsam_route_requirements ADD COLUMN optional_capability_keys_json TEXT;
ALTER TABLE agentsam_route_requirements ADD COLUMN blocked_capability_keys_json TEXT;
ALTER TABLE agentsam_route_requirements ADD COLUMN max_tools INTEGER;
ALTER TABLE agentsam_route_requirements ADD COLUMN approval_policy_json TEXT;

-- Optional seeds (only fill when column was empty — safe if already curated in prod)
UPDATE agentsam_route_requirements SET
  allowed_lanes_json = '["think","research","general"]',
  required_capability_keys_json = NULL,
  optional_capability_keys_json = '["knowledge_search","context_search","d1_query"]',
  blocked_capability_keys_json = '["terminal_execute","terminal_run"]',
  max_tools = 6,
  approval_policy_json = '{"high_risk_requires_approval":true}'
WHERE route_key = 'chat' AND (allowed_lanes_json IS NULL OR trim(COALESCE(allowed_lanes_json,'')) = '');

UPDATE agentsam_route_requirements SET
  allowed_lanes_json = '["develop","inspect","research"]',
  required_capability_keys_json = '["workspace_read_file"]',
  optional_capability_keys_json = '["workspace_search","terminal_execute","d1_query","github_file"]',
  blocked_capability_keys_json = NULL,
  max_tools = 12,
  approval_policy_json = '{"high_risk_requires_approval":true}'
WHERE route_key = 'code' AND (allowed_lanes_json IS NULL OR trim(COALESCE(allowed_lanes_json,'')) = '');

UPDATE agentsam_route_requirements SET
  allowed_lanes_json = '["develop","inspect","observe"]',
  required_capability_keys_json = '["workspace_read_file"]',
  optional_capability_keys_json = '["context_search","d1_query","platform_info"]',
  blocked_capability_keys_json = NULL,
  max_tools = 10,
  approval_policy_json = '{"high_risk_requires_approval":true}'
WHERE route_key = 'debug' AND (allowed_lanes_json IS NULL OR trim(COALESCE(allowed_lanes_json,'')) = '');

UPDATE agentsam_route_requirements SET
  allowed_lanes_json = '["think","design","research"]',
  required_capability_keys_json = NULL,
  optional_capability_keys_json = '["knowledge_search","excalidraw_open","d1_query"]',
  blocked_capability_keys_json = '["terminal_execute"]',
  max_tools = 8,
  approval_policy_json = '{"high_risk_requires_approval":true}'
WHERE route_key = 'plan' AND (allowed_lanes_json IS NULL OR trim(COALESCE(allowed_lanes_json,'')) = '');

DROP VIEW IF EXISTS v_agentsam_mcp_tools_branded;

CREATE VIEW v_agentsam_mcp_tools_branded AS
SELECT
  m.id,
  m.tool_name,
  m.tool_category,
  m.handler_type,
  COALESCE(
    NULLIF(trim(m.server_key), ''),
    NULLIF(trim(m.handler_type), ''),
    'workspace'
  ) AS handler_brand,
  CASE
    WHEN lower(COALESCE(m.tool_category, '')) IN ('terminal', 'shell', 'deploy') THEN 'develop'
    WHEN lower(COALESCE(m.tool_category, '')) IN ('db_query', 'd1', 'database') THEN 'develop'
    WHEN lower(COALESCE(m.tool_category, '')) IN ('browser', 'devtools', 'a11y', 'inspect') THEN 'inspect'
    WHEN lower(COALESCE(m.tool_category, '')) IN ('mcp_tool', 'http', 'web_fetch', 'fetch') THEN 'research'
    WHEN lower(COALESCE(m.tool_category, '')) IN ('operate', 'cron', 'queue') THEN 'operate'
    WHEN lower(COALESCE(m.tool_category, '')) IN ('observe', 'metrics', 'logs') THEN 'observe'
    WHEN lower(COALESCE(m.tool_category, '')) IN ('admin', 'billing') THEN 'admin'
    ELSE 'general'
  END AS capability_lane,
  CASE WHEN COALESCE(m.requires_approval, 0) = 1 THEN 'approval_required' ELSE 'standard' END AS safety_badge,
  m.description,
  m.input_schema,
  COALESCE(NULLIF(trim(m.risk_level), ''), 'low') AS risk_level,
  m.requires_approval,
  COALESCE(m.enabled, 1) AS enabled,
  COALESCE(m.sort_priority, 50) AS sort_priority,
  m.schema_hint,
  m.avg_latency_ms,
  m.failure_rate,
  COALESCE(NULLIF(trim(m.tool_key), ''), NULLIF(trim(m.tool_name), '')) AS tool_key,
  COALESCE(
    NULLIF(trim(m.tool_key), ''),
    NULLIF(trim(m.tool_name), '')
  ) AS capability_key,
  m.server_key,
  m.agentsam_tools_id,
  m.mcp_service_url
FROM agentsam_mcp_tools m
WHERE COALESCE(m.enabled, 0) = 1
  AND COALESCE(m.is_active, 0) = 1
  AND COALESCE(m.is_degraded, 0) = 0;
