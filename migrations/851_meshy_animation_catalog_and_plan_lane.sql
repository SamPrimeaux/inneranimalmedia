-- 851: Catalog Meshy rigging/animation tools (handlers already exist) + DESIGNSTUDIO-003 ticket.
-- Fixes Design Studio "Render Animation" routing to fake imgx screenshots — tools were not in agentsam_tools.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/851_meshy_animation_catalog_and_plan_lane.sql

-- ── Meshy catalog tools (D1 SSOT — model freehands args; no hardcoded script injection) ──

INSERT OR REPLACE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type, handler_key,
  capability_key, description, input_schema, risk_level, requires_approval,
  requires_confirmation, is_active, is_global, oauth_visible, dispatch_target,
  sort_priority, notes, modes_json, domain, task_type, created_at, updated_at
) VALUES (
  'ast_meshyai_rigging',
  'meshyai_rigging',
  'meshyai_rigging',
  'Meshy Rig Character',
  'media.execute',
  'ai',
  'meshyai_rigging',
  'meshy.rigging',
  'Rig a Meshy 3D model for animation. Pass input_task_id (Meshy text/image-to-3d task id) or model_url. Returns cad_job_id + Meshy rig task id. Required before meshyai_animation.',
  '{"type":"object","properties":{"input_task_id":{"type":"string","description":"Meshy source model task id"},"model_url":{"type":"string","description":"Public GLB/GLTF URL if no task id"},"height_meters":{"type":"number","description":"Character height hint (default 1.7)"},"texture_image_url":{"type":"string"}},"additionalProperties":false}',
  'medium',
  0,
  0,
  1,
  1,
  0,
  'internal',
  42,
  '851: in-process cad-meshy.js meshyRiggingInProcess',
  '["auto","agent","debug","multitask"]',
  'design_studio',
  'cad_generation',
  unixepoch(),
  unixepoch()
);

INSERT OR REPLACE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type, handler_key,
  capability_key, description, input_schema, risk_level, requires_approval,
  requires_confirmation, is_active, is_global, oauth_visible, dispatch_target,
  sort_priority, notes, modes_json, domain, task_type, created_at, updated_at
) VALUES (
  'ast_meshyai_animation',
  'meshyai_animation',
  'meshyai_animation',
  'Meshy Apply Animation Clip',
  'media.execute',
  'ai',
  'meshyai_animation',
  'meshy.animation',
  'Apply a Meshy animation library clip to a rigged model. Requires rig_task_id from meshyai_rigging and action_id from the animation library (e.g. Walking=92). Poll with meshyai_get_task; when done spawn GLB in Design Studio viewport.',
  '{"type":"object","required":["rig_task_id","action_id"],"properties":{"rig_task_id":{"type":"string","description":"Meshy rigging task id"},"action_id":{"type":"integer","description":"Clip id from /api/cad/meshy/animations/library"},"post_process":{"type":"object","properties":{"operation_type":{"type":"string","enum":["change_fps","fbx2usdz","extract_armature"]},"fps":{"type":"number"}}}},"additionalProperties":false}',
  'medium',
  0,
  0,
  1,
  1,
  0,
  'internal',
  43,
  '851: in-process cad-meshy.js meshyAnimationInProcess',
  '["auto","agent","debug","multitask"]',
  'design_studio',
  'cad_generation',
  unixepoch(),
  unixepoch()
);

INSERT OR REPLACE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type, handler_key,
  capability_key, description, input_schema, risk_level, requires_approval,
  requires_confirmation, is_active, is_global, oauth_visible, dispatch_target,
  sort_priority, notes, modes_json, domain, task_type, created_at, updated_at
) VALUES (
  'ast_meshyai_get_task',
  'meshyai_get_task',
  'meshyai_get_task',
  'Meshy Poll CAD Job',
  'media.execute',
  'ai',
  'meshyai_get_task',
  'meshy.status',
  'Poll a Meshy-backed agentsam_cad_jobs row by id (cad_job_id). Returns status, progress_pct, public_url when SUCCEEDED.',
  '{"type":"object","required":["id"],"properties":{"id":{"type":"string","description":"agentsam_cad_jobs.id / cad_job_id"},"job_id":{"type":"string","description":"Alias for id"},"cad_job_id":{"type":"string","description":"Alias for id"}},"additionalProperties":false}',
  'low',
  0,
  0,
  1,
  1,
  0,
  'internal',
  44,
  '851: meshyStatusInProcess',
  '["auto","agent","debug","multitask","ask"]',
  'design_studio',
  'cad_generation',
  unixepoch(),
  unixepoch()
);

-- Activate image-to-3d (already pinned; was is_active=0 → profile missing warn)
UPDATE agentsam_tools
SET is_active = 1,
    description = COALESCE(NULLIF(description, ''), 'Generate a 3D model from an image via MeshyAI.'),
    input_schema = COALESCE(
      NULLIF(input_schema, ''),
      '{"type":"object","properties":{"image_url":{"type":"string","description":"Public image URL"},"prompt":{"type":"string","description":"Optional style/guidance"},"enable_pbr":{"type":"boolean"}},"additionalProperties":true}'
    ),
    updated_at = unixepoch()
WHERE tool_key = 'meshyai_image_to_3d';

-- Enrich text-to-3d schema so Gemini/OpenAI get real parameters
UPDATE agentsam_tools
SET input_schema = COALESCE(
      NULLIF(input_schema, ''),
      '{"type":"object","required":["prompt"],"properties":{"prompt":{"type":"string","description":"Text description of the 3D object"},"mode":{"type":"string","enum":["preview","refine","full"],"description":"Generation quality path"},"art_style":{"type":"string"},"enable_pbr":{"type":"boolean"}},"additionalProperties":true}'
    ),
    updated_at = unixepoch()
WHERE tool_key = 'meshyai_text_to_3d';

-- Pin Meshy animation stack on Design Studio profiles
UPDATE agentsam_tool_profiles
SET tool_keys_json = '["illustration_create","meshyai_text_to_3d","meshyai_image_to_3d","meshyai_rigging","meshyai_animation","meshyai_get_task","agentsam_memory_manager","imgx_generate_image"]',
    max_tools = 10,
    notes = '851: Meshy generate + rig + animate catalog (no fake Blender render path)',
    updated_at = unixepoch()
WHERE profile_key IN ('design_studio', 'cad_generation');

UPDATE agentsam_prompt_routes
SET tool_keys = '["illustration_create","meshyai_text_to_3d","meshyai_image_to_3d","meshyai_rigging","meshyai_animation","meshyai_get_task","agentsam_memory_manager","imgx_generate_image"]',
    updated_at = unixepoch()
WHERE route_key IN ('design_studio', 'cad_generation');

-- ── DESIGNSTUDIO-003 architectural plan lane ticket ──

INSERT OR IGNORE INTO agentsam_tickets (
  id, title, status, status_reason, project, subsystem, tags, priority, doc_path,
  blocks, blocked_by, supersedes, dedup_key, required_pass_count,
  created_at, updated_at, closed_at
) VALUES (
  'tkt_designstudio_003',
  'DESIGNSTUDIO-003 Architectural Plan Lane (PlanGraph bridge)',
  'backlog',
  'Dedicated architectural_plan profile between visual_canvas and FreeCAD. PlanGraph SSOT, human verify, promote_plan — not Excalidraw-as-master or imgx floor plans.',
  'proj_mrb5shkc_3kos2c',
  'designstudio',
  '["design","plan-graph","architectural-plan","house-plan","sam-sketch","freecad","excalidraw"]',
  'P1',
  'plans/active/DESIGNSTUDIO-003-architectural-plan-lane.md',
  '[]',
  '["tkt_designstudio_002","tkt_designstudio_001"]',
  NULL,
  'designstudio-003-architectural-plan-lane',
  2,
  unixepoch(),
  unixepoch(),
  NULL
);

UPDATE projects
SET metadata_json = json_set(
      COALESCE(NULLIF(metadata_json, ''), '{}'),
      '$.designstudio.plan_lane_ticket_id', 'tkt_designstudio_003',
      '$.designstudio.plan_lane_plan', 'DESIGNSTUDIO-003-architectural-plan-lane.md',
      '$.designstudio.flow', json('["sketch_excalidraw","plan_graph","massing_freecad","detail_bim","render_glb"]')
    ),
    updated_at = datetime('now')
WHERE id = 'proj_mrb5shkc_3kos2c';
