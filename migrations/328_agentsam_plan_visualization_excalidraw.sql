-- 328: Plan visualization — Excalidraw plan map tool + prompt layer (D1).
-- Safe re-run: conditional inserts / updates that skip when already applied.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Prompt version: plan_visualization_policy (global, tenant_id NULL)
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO agentsam_prompt_versions (
  id, prompt_key, version, prompt_hash, body, body_tokens, is_active, tenant_id, notes
)
SELECT
  'pv_plan_visualization_policy_v1',
  'plan_visualization_policy',
  1,
  lower(hex(randomblob(16))),
  'When creating feature, refactor, sprint, or incident plans with 2 or more tasks, create a simple Excalidraw plan map using excalidraw_plan_map_create. Keep diagrams clean: title, task cards, arrows for dependencies, risks/approvals, and involved routes/files/tables. Do not manually draw with browser tools unless explicitly asked.',
  120,
  1,
  NULL,
  '{}'
WHERE NOT EXISTS (
  SELECT 1 FROM agentsam_prompt_versions
  WHERE prompt_key = 'plan_visualization_policy' AND version = 1
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Append prompt layer to plan-related routes (skip if already in JSON array)
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE agentsam_prompt_routes AS r
SET prompt_layer_keys = (
  SELECT json_group_array(value)
  FROM (
    SELECT je.value
    FROM json_each(COALESCE(NULLIF(trim(r.prompt_layer_keys), ''), '[]')) AS je
    UNION
    SELECT 'plan_visualization_policy'
  )
)
WHERE COALESCE(r.is_active, 1) = 1
  AND json_valid(COALESCE(NULLIF(trim(r.prompt_layer_keys), ''), '[]'))
  AND r.route_key IN (
    'plan',
    'agent_plan_create',
    'agent_feature_plan',
    'agent_refactor_plan',
    'agent_incident_plan'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM json_each(COALESCE(NULLIF(trim(r.prompt_layer_keys), ''), '[]')) AS jx
    WHERE jx.value = 'plan_visualization_policy'
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Register builtin tool row (global scope: empty user/tenant/workspace match)
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO agentsam_mcp_tools (
  id,
  user_id,
  tool_key,
  tool_name,
  display_name,
  tool_category,
  description,
  input_schema,
  handler_type,
  risk_level,
  requires_approval,
  is_active,
  enabled,
  workspace_scope,
  modes_json
)
SELECT
  'mcp_tool_excalidraw_plan_map_create',
  '',
  'excalidraw_plan_map_create',
  'excalidraw_plan_map_create',
  'Excalidraw plan map',
  'media',
  'Generate an Excalidraw JSON plan map from agentsam_plans + agentsam_plan_tasks, upload to R2, insert agentsam_artifacts.',
  '{"type":"object","required":["plan_id"],"properties":{"plan_id":{"type":"string"},"open_after_create":{"type":"boolean","default":true}}}',
  'script',
  'low',
  0,
  1,
  1,
  '[]',
  '["auto","agent","debug"]'
WHERE NOT EXISTS (
  SELECT 1 FROM agentsam_mcp_tools
  WHERE tool_key = 'excalidraw_plan_map_create' AND trim(COALESCE(user_id, '')) = ''
);
