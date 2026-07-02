-- 755: iam.illustration.v1 SSOT — illustration_create catalog tool + policy keys.
-- Apply: node scripts/d1-apply-pending.mjs --apply --from 755 --to 755

INSERT OR REPLACE INTO agentsam_tools (
  id,
  tool_key,
  tool_name,
  display_name,
  tool_category,
  handler_type,
  handler_key,
  description,
  input_schema,
  handler_config,
  risk_level,
  requires_approval,
  requires_confirmation,
  is_active,
  is_degraded,
  workspace_scope,
  sort_priority,
  is_global,
  modes_json,
  oauth_visible,
  updated_at
) VALUES (
  'ast_illustration_create',
  'illustration_create',
  'illustration_create',
  'Illustration Create (iam.illustration.v1)',
  'media',
  'media',
  'illustration_create',
  'Single SSOT envelope for sketches (Excalidraw /draw) vs CAD blueprints (Design Studio). Pass iam.illustration.v1 with intent, fidelity, engine=auto, title, brief, constraints, payload.',
  '{"type":"object","required":["brief"],"properties":{"illustration":{"type":"object","description":"iam.illustration.v1 envelope"},"intent":{"type":"string","enum":["sketch","diagram","wireframe","house_floor_plan","blueprint","floor_plan","model_3d","sculpt","plan_map","other"]},"fidelity":{"type":"string","enum":["sketch","diagram","technical_2d","architectural_3d","structural"]},"engine":{"type":"string","enum":["auto","excalidraw","openscad","freecad","blender","meshy"],"default":"auto"},"title":{"type":"string"},"brief":{"type":"string"},"constraints":{"type":"object"},"payload":{"type":"object"},"references":{"type":"array"},"open_after_create":{"type":"boolean","default":true}}}',
  '{"auth_source":"platform","binding":"internal","handler":"illustration_create"}',
  'medium',
  0,
  0,
  1,
  0,
  '["*"]',
  42,
  1,
  '["agent","plan","multitask"]',
  0,
  unixepoch()
);

INSERT OR IGNORE INTO agentsam_tool_policy_keys (id, policy_kind, tool_key, sort_order, notes) VALUES
  ('atpk_nc_illustration_create', 'non_cacheable', 'illustration_create', 55, 'iam.illustration.v1 routes may create artifacts or CAD jobs');
