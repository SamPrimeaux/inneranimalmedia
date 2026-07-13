-- 853: DESIGNSTUDIO-004 Blender viz ticket + enrich 003 lineage / project flow.
-- Blender executor deferred; contracts + flow metadata land now so 003 cannot bolt-on later.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/853_designstudio_004_blender_viz_ticket.sql

INSERT OR IGNORE INTO agentsam_tickets (
  id, title, status, status_reason, project, subsystem, tags, priority, doc_path,
  blocks, blocked_by, supersedes, dedup_key, required_pass_count,
  created_at, updated_at, closed_at
) VALUES (
  'tkt_designstudio_004',
  'DESIGNSTUDIO-004 FreeCAD → Blender Visualization Pipeline',
  'backlog',
  'Deferred design_visualization lane. Depends on 003 semantic IDs + VisualizationPackage contract + promote_plan hook. Blender owns presentation only — never architectural master.',
  'proj_mrb5shkc_3kos2c',
  'designstudio',
  '["design","blender","visualization","freecad","semantic-id","sam-sketch","design-visualization"]',
  'P1',
  'plans/active/DESIGNSTUDIO-004-freecad-blender-visualization.md',
  '[]',
  '["tkt_designstudio_003","tkt_designstudio_002"]',
  NULL,
  'designstudio-004-freecad-blender-visualization',
  2,
  unixepoch(),
  unixepoch(),
  NULL
);

-- 003 blocks 004 (lineage / contracts before Blender executor)
UPDATE agentsam_tickets
SET blocks = '["tkt_designstudio_004"]',
    status_reason = 'PlanGraph + FreeCAD promote with stable semantic IDs, lineage, and visualization_package hook for 004. Blender executor deferred.',
    updated_at = unixepoch()
WHERE id = 'tkt_designstudio_003';

UPDATE projects
SET metadata_json = json_set(
      COALESCE(NULLIF(metadata_json, ''), '{}'),
      '$.designstudio.plan_lane_ticket_id', 'tkt_designstudio_003',
      '$.designstudio.viz_lane_ticket_id', 'tkt_designstudio_004',
      '$.designstudio.plan_lane_plan', 'DESIGNSTUDIO-003-architectural-plan-lane.md',
      '$.designstudio.viz_lane_plan', 'DESIGNSTUDIO-004-freecad-blender-visualization.md',
      '$.designstudio.flow', json('["sketch_excalidraw","plan_graph","massing_freecad","detail_bim","visualization_package","visualization_blender","render_output"]'),
      '$.designstudio.authority', json('{"geometry":"freecad","presentation":"blender","plan_meaning":"plan_graph"}'),
      '$.designstudio.visualization_sync_policy', json('{"geometryAuthority":"freecad","presentationAuthority":"blender","onSourceUpdate":"preview_then_apply","preserve":{"materials":true,"cameras":true,"lighting":true,"worldEnvironment":true,"furniture":true,"landscaping":true,"animation":true},"deleteBehavior":"archive_orphaned"}')
    ),
    updated_at = datetime('now')
WHERE id = 'proj_mrb5shkc_3kos2c';

-- Register design_visualization profile/route shell (tools deferred to 004)
INSERT OR REPLACE INTO agentsam_tool_profiles (
  id, profile_key, display_name, tool_keys_json, max_tools, default_deny_oauth,
  write_policy_json, notes, is_active, sort_order, updated_at
) VALUES (
  'atprof_design_visualization',
  'design_visualization',
  'Design Visualization · Blender presentation',
  '["agentsam_memory_manager"]',
  8,
  1,
  '{"can_edit_files":false,"can_terminal":false,"can_d1_write":false,"can_deploy":false,"mutates_blender":true}',
  '853: shell for DESIGNSTUDIO-004 — Blender/viz tools added when 004 ships. Geometry authority remains FreeCAD.',
  1,
  48,
  unixepoch()
);

INSERT INTO agentsam_prompt_routes (
  id, route_key, display_name, intent_labels, command_categories, trigger_keywords,
  prompt_layer_keys, tool_categories, tool_keys, max_tools,
  preferred_model, fallback_model, include_rag, include_active_plan, include_recent_memory,
  memory_limit, include_workspace_ctx, token_budget, is_active, priority, tenant_id,
  created_at, updated_at
) VALUES (
  'route_design_visualization',
  'design_visualization',
  'Design Visualization · FreeCAD → Blender',
  '["visualize","render","blender","walkthrough","golden_hour","sync_visualization"]',
  '["design","create"]',
  '["render","blender","walkthrough","visualization","golden hour","materials"]',
  '["core_identity"]',
  '["design","media"]',
  '["agentsam_memory_manager"]',
  8,
  'gpt-5.6-terra',
  'gpt-5.6-luna',
  0, 1, 1, 5, 1, 2000, 1, 42, NULL,
  unixepoch(), unixepoch()
)
ON CONFLICT(id) DO UPDATE SET
  route_key = excluded.route_key,
  display_name = excluded.display_name,
  tool_keys = excluded.tool_keys,
  max_tools = excluded.max_tools,
  is_active = 1,
  updated_at = unixepoch();

INSERT OR REPLACE INTO agentsam_tool_profile_bindings (
  id, task_type, profile_key, priority, notes, updated_at
) VALUES
  ('atpb_create_visualization', 'create_visualization', 'design_visualization', 10, '853: 004 shell', unixepoch()),
  ('atpb_sync_visualization', 'sync_visualization', 'design_visualization', 10, '853: 004 shell', unixepoch()),
  ('atpb_style_visualization', 'style_visualization', 'design_visualization', 10, '853: 004 shell', unixepoch()),
  ('atpb_compose_scene', 'compose_scene', 'design_visualization', 10, '853: 004 shell', unixepoch()),
  ('atpb_render_preview', 'render_preview', 'design_visualization', 10, '853: 004 shell', unixepoch()),
  ('atpb_render_final', 'render_final', 'design_visualization', 10, '853: 004 shell', unixepoch()),
  ('atpb_animate_scene', 'animate_scene', 'design_visualization', 10, '853: 004 shell', unixepoch());
