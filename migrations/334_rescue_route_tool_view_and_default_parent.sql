-- 334: rescue capability_key view rebuild + missing default protocol parent route
-- Purpose:
--   332 failed early on duplicate existing columns before rebuilding v_agentsam_mcp_tools_branded.
--   333 failed on FK because cms_live_editor._default_protocol did not exist in agentsam_prompt_routes.
-- Safe to rerun.

BEGIN TRANSACTION;

INSERT INTO agentsam_prompt_routes (
  route_key,
  display_name,
  intent_labels,
  command_categories,
  trigger_keywords,
  prompt_layer_keys,
  tool_categories,
  tool_keys,
  max_tools,
  preferred_model,
  fallback_model,
  include_rag,
  include_active_plan,
  include_recent_memory,
  memory_limit,
  include_workspace_ctx,
  token_budget,
  is_active,
  priority,
  tenant_id,
  created_at,
  updated_at
)
SELECT
  'cms_live_editor._default_protocol',
  'CMS Live Editor Default Protocol',
  '["cms","live_editor","design","theme","section","schema"]',
  '["cms","design","r2","frontend"]',
  '["cms","live editor","theme","section","schema","r2 artifact"]',
  '["core_identity","workspace_context","cms_live_editor"]',
  '["cms","r2","frontend","design"]',
  '[]',
  8,
  NULL,
  NULL,
  1,
  1,
  1,
  5,
  1,
  2400,
  1,
  17,
  NULL,
  unixepoch(),
  unixepoch()
WHERE NOT EXISTS (
  SELECT 1 FROM agentsam_prompt_routes
  WHERE route_key = 'cms_live_editor._default_protocol'
);

COMMIT;

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
    NULLIF(lower(trim(m.tool_key)), ''),
    NULLIF(lower(trim(m.tool_name)), ''),
    lower(replace(trim(COALESCE(m.tool_category, 'mcp')), ' ', '_'))
      || ':'
      || lower(replace(trim(COALESCE(m.tool_name, '')), ' ', '_'))
  ) AS capability_key,
  m.server_key,
  m.agentsam_tools_id,
  m.mcp_service_url
FROM agentsam_mcp_tools m
WHERE COALESCE(m.enabled, 0) = 1
  AND COALESCE(m.is_active, 0) = 1
  AND COALESCE(m.is_degraded, 0) = 0;

-- Post-merge sample check
SELECT route_key, task_type, mode, max_tools
FROM agentsam_route_requirements
WHERE route_key LIKE 'agent_%' OR route_key LIKE 'cms_live_editor%'
ORDER BY route_key
LIMIT 80;
