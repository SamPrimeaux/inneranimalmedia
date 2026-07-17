-- 940: Split Design Studio, engine-neutral CAD, and provider-specific Meshy menus.
-- Profiles/bindings own menus. prompt_routes tool columns are retired compatibility fields.

INSERT OR REPLACE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type, handler_config, handler_key,
  capability_key, description, input_schema, output_schema, risk_level, requires_approval,
  requires_confirmation, is_active, is_global, oauth_visible, dispatch_target,
  sort_priority, notes, modes_json, domain, task_type, created_at, updated_at
) VALUES
('ast_designstudio_scene_list','designstudio_scene_list','designstudio_scene_list','List Design Studio Scenes',
 'design.read','design_studio','{}','designstudio_scene_list','design.read',
 'List named scene snapshots owned by the authenticated user in the active workspace.',
 '{"type":"object","properties":{"limit":{"type":"integer","minimum":1,"maximum":50,"default":20}},"additionalProperties":false}',
 '{"type":"object","properties":{"scenes":{"type":"array"},"count":{"type":"integer"}},"required":["scenes","count"]}',
 'low',0,0,1,1,0,'internal',35,'940 native Design Studio scene reader','["ask","agent","debug","multitask"]','design_studio','design_studio_base',unixepoch(),unixepoch()),

('ast_designstudio_asset_list','designstudio_asset_list','designstudio_asset_list','List Design Studio Assets',
 'design.read','design_studio','{}','designstudio_asset_list','design.read',
 'List shared 3D Studio assets and user-owned assets available in the active workspace.',
 '{"type":"object","properties":{"limit":{"type":"integer","minimum":1,"maximum":50,"default":30}},"additionalProperties":false}',
 '{"type":"object","properties":{"assets":{"type":"array"},"count":{"type":"integer"}},"required":["assets","count"]}',
 'low',0,0,1,1,0,'internal',36,'940 native Design Studio asset reader','["ask","agent","debug","multitask"]','design_studio','design_studio_base',unixepoch(),unixepoch()),

('ast_cad_job_status','cad_job_status','cad_job_status','CAD Job Status',
 'design.read','design_studio','{}','cad_job_status','design.read',
 'Get one scoped CAD job or list recent CAD jobs for the authenticated user and workspace.',
 '{"type":"object","properties":{"job_id":{"type":"string"},"limit":{"type":"integer","minimum":1,"maximum":20,"default":10}},"additionalProperties":false}',
 '{"type":"object"}','low',0,0,1,1,0,'internal',37,'940 native scoped CAD job reader','["ask","agent","debug","multitask"]','design_studio','design_studio_base',unixepoch(),unixepoch()),

('ast_cad_job_cancel','cad_job_cancel','cad_job_cancel','Cancel CAD Job',
 'design.execute','design_studio','{}','cad_job_cancel','design.write',
 'Cancel an authenticated user-owned CAD job. Provider cancellation is attempted when supported.',
 '{"type":"object","required":["job_id"],"properties":{"job_id":{"type":"string"}},"additionalProperties":false}',
 '{"type":"object","properties":{"ok":{"type":"boolean"},"job_id":{"type":"string"},"status":{"type":"string"}},"required":["ok","job_id","status"]}',
 'high',1,1,1,1,0,'internal',38,'940 native scoped CAD cancellation','["agent","multitask"]','design_studio','cad_generation',unixepoch(),unixepoch()),

('ast_cad_generate','cad_generate','cad_generate','Generate CAD Script Job',
 'design.execute','design_studio','{}','cad_generate','media.generate',
 'Create an engine-neutral OpenSCAD, FreeCAD, or Blender script-ready CAD job.',
 '{"type":"object","required":["engine","prompt"],"properties":{"engine":{"type":"string","enum":["openscad","freecad","blender"]},"prompt":{"type":"string","maxLength":4000},"project_id":{"type":"string"},"scene_snapshot_id":{"type":"string"},"model_key":{"type":"string"}},"additionalProperties":false}',
 '{"type":"object","properties":{"ok":{"type":"boolean"},"job_id":{"type":"string"},"engine":{"type":"string"},"status":{"type":"string"},"model_key":{"type":"string"},"next_step":{"type":"string"}},"required":["ok","job_id","engine","status"]}',
 'medium',0,0,1,1,0,'internal',39,'940 engine-neutral CAD generation intake','["agent","debug","multitask"]','design_studio','cad_generation',unixepoch(),unixepoch());

INSERT OR IGNORE INTO agentsam_tool_capabilities
  (tool_id, capability_key, requirement_type, is_primary, created_at)
SELECT id, capability_key, 'required', 1, unixepoch()
FROM agentsam_tools
WHERE tool_key IN (
  'designstudio_scene_list','designstudio_asset_list','cad_job_status','cad_job_cancel','cad_generate'
);

INSERT OR REPLACE INTO agentsam_tool_profiles
  (id, profile_key, display_name, tool_keys_json, max_tools, default_deny_oauth,
   write_policy_json, notes, is_active, sort_order, updated_at)
VALUES
('atprof_design_studio_base','design_studio_base','Design Studio base',
 '["designstudio_scene_list","designstudio_asset_list","cad_job_status"]',3,1,
 '{"version":2,"deny_capabilities":[],"allow_mutating_capabilities":[],"require_approval_capabilities":[]}',
 'General Studio scene, asset, and job inspection. Browser-local selection/material/export actions stay client-owned.',1,40,unixepoch()),
('atprof_cad_generation','cad_generation','CAD generation',
 '["cad_generate","cad_job_status","cad_job_cancel"]',3,1,
 '{"version":2,"deny_capabilities":[],"allow_mutating_capabilities":["media.generate","design.write"],"require_approval_capabilities":["design.write"]}',
 'Engine-neutral OpenSCAD, FreeCAD, and Blender intake and job controls.',1,41,unixepoch()),
('atprof_meshy_generate','meshy_generate','Meshy generation',
 '["meshy_text_to_3d","meshy_text_to_3d_refine","meshy_image_to_3d","meshy_multi_image_to_3d","meshy_get_task_status"]',5,1,
 '{"version":2,"deny_capabilities":[],"allow_mutating_capabilities":["media.generate","media.transform"],"require_approval_capabilities":[]}',
 'New Meshy models only.',1,42,unixepoch()),
('atprof_meshy_transform','meshy_transform','Meshy transform',
 '["meshy_remesh","meshy_retexture","meshy_convert","meshy_resize","meshy_uv_unwrap","meshy_get_task_status"]',6,1,
 '{"version":2,"deny_capabilities":[],"allow_mutating_capabilities":["media.transform"],"require_approval_capabilities":[]}',
 'Existing Meshy model transformations only.',1,43,unixepoch()),
('atprof_meshy_animation','meshy_animation','Meshy animation',
 '["meshy_rig","meshy_animate","meshy_get_task_status"]',3,1,
 '{"version":2,"deny_capabilities":[],"allow_mutating_capabilities":["media.transform"],"require_approval_capabilities":[]}',
 'Rigging and animation only.',1,44,unixepoch()),
('atprof_meshy_manage','meshy_manage','Meshy task management',
 '["meshy_get_task_status","meshy_list_tasks","meshy_cancel_task"]',3,1,
 '{"version":2,"deny_capabilities":[],"allow_mutating_capabilities":["media.manage"],"require_approval_capabilities":["media.manage"]}',
 'Owned Meshy task administration.',1,45,unixepoch());

UPDATE agentsam_tool_profiles
SET is_active = 0,
    notes = 'Superseded by design_studio_base and bounded provider/task profiles in migration 940.',
    updated_at = unixepoch()
WHERE profile_key = 'design_studio';

INSERT OR REPLACE INTO agentsam_tool_profile_bindings
  (id, task_type, profile_key, priority, is_active, notes, created_at, updated_at)
VALUES
('atbind_design_studio','design_studio','design_studio_base',20,1,'Compatibility task type → bounded Studio base',unixepoch(),unixepoch()),
('atbind_design_studio_base','design_studio_base','design_studio_base',10,1,'Design Studio route default',unixepoch(),unixepoch()),
('atbind_cad_generation','cad_generation','cad_generation',10,1,'Engine-neutral CAD intake',unixepoch(),unixepoch()),
('atbind_meshy_generate','meshy_generate','meshy_generate',10,1,'New Meshy model operations',unixepoch(),unixepoch()),
('atbind_meshy_transform','meshy_transform','meshy_transform',10,1,'Existing Meshy model transforms',unixepoch(),unixepoch()),
('atbind_meshy_animation','meshy_animation','meshy_animation',10,1,'Meshy rig and animation',unixepoch(),unixepoch()),
('atbind_meshy_manage','meshy_manage','meshy_manage',10,1,'Meshy task administration',unixepoch(),unixepoch());

-- Retain execution compatibility through catalog aliases, but remove duplicate discovery.
UPDATE agentsam_tools
SET is_active = 0, is_degraded = 1, oauth_visible = 0,
    notes = COALESCE(notes || ' · ', '') || '940: legacy key; resolve to canonical meshy_* alias',
    updated_at = unixepoch()
WHERE tool_key IN (
  'meshyai_text_to_3d','meshyai_image_to_3d','meshyai_remesh','meshyai_retexture',
  'meshyai_rigging','meshyai_animation','meshyai_convert','meshyai_resize',
  'meshyai_uv_unwrap','meshyai_get_task'
);

-- Route rows retain prompt/model routing only. Bound profiles own tool menus and caps.
UPDATE agentsam_prompt_routes
SET tool_keys = NULL, max_tools = NULL, updated_at = unixepoch()
WHERE route_key IN (
  SELECT task_type
  FROM agentsam_tool_profile_bindings
  WHERE COALESCE(is_active,1)=1
);
