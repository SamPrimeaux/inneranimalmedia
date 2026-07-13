-- 847: Draw lane — visual_canvas task_type (Phase 1)
-- Surface pin for /dashboard/draw. Nested CanvasTaskClassification
-- (operation/artifact_type/…) is metadata for Phase 2 ScenePlan adapter —
-- Thompson still keys on task_type + mode only.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/847_visual_canvas_draw_lane.sql

-- Prompt route (Excalidraw / Draw — not Design Studio CAD)
INSERT INTO agentsam_prompt_routes (
  id, route_key, display_name, intent_labels, command_categories, trigger_keywords,
  prompt_layer_keys, tool_categories, tool_keys, max_tools,
  preferred_model, fallback_model, include_rag, include_active_plan, include_recent_memory,
  memory_limit, include_workspace_ctx, token_budget, is_active, priority, tenant_id,
  created_at, updated_at
) VALUES (
  'route_visual_canvas',
  'visual_canvas',
  'Visual Canvas · Draw / Excalidraw',
  '["draw","excalidraw","diagram","flowchart","wireframe","sketch","plan_map"]',
  '["design","create"]',
  '["draw","excalidraw","flowchart","diagram","wireframe","sketch","canvas"]',
  '["core_identity"]',
  '["design","media"]',
  '["illustration_create","agentsam_excalidraw","agentsam_memory_manager"]',
  8,
  'gpt-5.6-terra',
  'gpt-5.6-luna',
  0, 1, 1, 5, 1, 2000, 1, 40, NULL,
  unixepoch(), unixepoch()
)
ON CONFLICT(id) DO UPDATE SET
  route_key = excluded.route_key,
  display_name = excluded.display_name,
  tool_keys = excluded.tool_keys,
  max_tools = excluded.max_tools,
  preferred_model = excluded.preferred_model,
  fallback_model = excluded.fallback_model,
  is_active = 1,
  updated_at = unixepoch();

-- Tool profile (narrow — no code_develop / no Meshy)
INSERT OR REPLACE INTO agentsam_tool_profiles (
  id, profile_key, display_name, tool_keys_json, max_tools, default_deny_oauth,
  write_policy_json, notes, is_active, sort_order, updated_at
) VALUES (
  'atprof_visual_canvas',
  'visual_canvas',
  'Visual Canvas · Excalidraw Draw',
  '["illustration_create","agentsam_excalidraw","agentsam_memory_manager"]',
  8,
  1,
  '{"can_edit_files":false,"can_terminal":false,"can_d1_write":false,"can_deploy":false,"mutates_canvas":true}',
  'Phase 1 Draw lane — illustration_create + open canvas. ScenePlan render/patch tools land in Phase 2.',
  1,
  45,
  unixepoch()
);

INSERT OR REPLACE INTO agentsam_tool_profile_bindings (
  id, task_type, profile_key, priority, notes, updated_at
) VALUES (
  'atpb_visual_canvas',
  'visual_canvas',
  'visual_canvas',
  10,
  '/dashboard/draw surface pin — classification override via body.task_type',
  unixepoch()
);

-- Thompson arms: terra default, luna fast, sol escalation (agent + auto)
INSERT OR IGNORE INTO agentsam_routing_arms (
  id, task_type, mode, model_key, provider, workspace_id, agent_slug,
  model_catalog_id, fallback_model_key, priority, is_active, is_eligible, is_paused,
  supports_tools, reasoning_effort, success_alpha, success_beta, updated_at
) VALUES
(
  'ra_gpt56terra_visual_canvas_agent',
  'visual_canvas', 'agent', 'gpt-5.6-terra', 'openai',
  'ws_inneranimalmedia', '', 'mdl_gpt56_terra', 'gpt-5.6-luna',
  40, 1, 1, 0, 1, 'medium', 1.0, 1.0, unixepoch()
),
(
  'ra_gpt56terra_visual_canvas_auto',
  'visual_canvas', 'auto', 'gpt-5.6-terra', 'openai',
  'ws_inneranimalmedia', '', 'mdl_gpt56_terra', 'gpt-5.6-luna',
  40, 1, 1, 0, 1, 'medium', 1.0, 1.0, unixepoch()
),
(
  'ra_gpt56luna_visual_canvas_agent',
  'visual_canvas', 'agent', 'gpt-5.6-luna', 'openai',
  'ws_inneranimalmedia', '', 'mdl_gpt56_luna', NULL,
  80, 1, 1, 0, 1, 'low', 1.0, 1.0, unixepoch()
),
(
  'ra_gpt56luna_visual_canvas_auto',
  'visual_canvas', 'auto', 'gpt-5.6-luna', 'openai',
  'ws_inneranimalmedia', '', 'mdl_gpt56_luna', NULL,
  80, 1, 1, 0, 1, 'low', 1.0, 1.0, unixepoch()
),
(
  'ra_gpt56sol_visual_canvas_agent',
  'visual_canvas', 'agent', 'gpt-5.6-sol', 'openai',
  'ws_inneranimalmedia', '', 'mdl_gpt56_sol', 'gpt-5.6-terra',
  55, 1, 1, 0, 1, 'high', 1.0, 1.0, unixepoch()
),
(
  'ra_gpt56sol_visual_canvas_auto',
  'visual_canvas', 'auto', 'gpt-5.6-sol', 'openai',
  'ws_inneranimalmedia', '', 'mdl_gpt56_sol', 'gpt-5.6-terra',
  55, 1, 1, 0, 1, 'high', 1.0, 1.0, unixepoch()
);

-- Keep Draw quickstarts on visual_canvas (not design_intake / design_studio CAD)
UPDATE agentsam_subagent_profile
SET output_schema_json = json_set(
      COALESCE(output_schema_json, '{}'),
      '$.quickstart.task_type', 'visual_canvas',
      '$.quickstart.route_key', 'visual_canvas'
    ),
    updated_at = datetime('now')
WHERE id IN ('qs_card_flowchart', 'qs_card_wireframe', 'qs_card_blank_canvas')
   OR (slug IN ('card-flowchart', 'card-wireframe', 'card-blank-canvas')
       AND id LIKE 'qs_card_%');
