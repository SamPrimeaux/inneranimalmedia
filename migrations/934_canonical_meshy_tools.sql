-- 934: Canonical, executable Meshy tool catalog.
-- "Cancel" is IAM-facing terminology; Meshy's operation permanently DELETEs the owned task.

UPDATE agentsam_tools
SET handler_type = 'media',
    handler_config = '{}',
    capability_key = CASE
      WHEN tool_key IN ('meshyai_text_to_3d','meshyai_image_to_3d') THEN 'media.generate'
      WHEN tool_key = 'meshyai_get_task' THEN 'media.status'
      ELSE 'media.transform'
    END,
    updated_at = unixepoch()
WHERE tool_key IN (
  'meshyai_text_to_3d','meshyai_image_to_3d','meshyai_remesh','meshyai_retexture',
  'meshyai_rigging','meshyai_animation','meshyai_convert','meshyai_resize',
  'meshyai_uv_unwrap','meshyai_get_task'
);

INSERT OR REPLACE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type, handler_config, handler_key,
  capability_key, description, input_schema, output_schema, risk_level, requires_approval,
  requires_confirmation, is_active, is_global, oauth_visible, dispatch_target,
  sort_priority, notes, modes_json, domain, task_type, created_at, updated_at
)
VALUES
('ast_meshy_text_to_3d','meshy_text_to_3d','meshy_text_to_3d','Meshy Text to 3D','media.execute','media','{}','meshy_text_to_3d',
 'media.generate','Create a Meshy Text-to-3D preview task. This spends Meshy credits; the preview can be textured with meshy_text_to_3d_refine.',
 '{"type":"object","required":["prompt"],"properties":{"prompt":{"type":"string","maxLength":600},"ai_model":{"type":"string"},"model_type":{"type":"string"},"topology":{"type":"string","enum":["triangle","quad"]},"target_polycount":{"type":"integer","minimum":100,"maximum":300000},"pose_mode":{"type":"string","enum":["","a-pose","t-pose"]},"auto_refine":{"type":"boolean"}},"additionalProperties":false}',
 '{"type":"object"}','medium',0,0,1,1,0,'internal',40,'934 canonical Meshy preview','["auto","agent","debug","multitask"]','design_studio','cad_generation',unixepoch(),unixepoch()),

('ast_meshy_text_refine','meshy_text_to_3d_refine','meshy_text_to_3d_refine','Meshy Text to 3D Refine','media.execute','media','{}','meshy_text_to_3d_refine',
 'media.transform','Texture a completed Meshy Text-to-3D preview. Requires the preview task id and spends Meshy credits.',
 '{"type":"object","required":["preview_task_id"],"properties":{"preview_task_id":{"type":"string"},"enable_pbr":{"type":"boolean"},"texture_prompt":{"type":"string"},"ai_model":{"type":"string"},"target_formats":{"type":"array","items":{"type":"string"}},"remove_lighting":{"type":"boolean"}},"additionalProperties":false}',
 '{"type":"object"}','medium',0,0,1,1,0,'internal',41,'934 canonical Meshy refine','["auto","agent","debug","multitask"]','design_studio','cad_generation',unixepoch(),unixepoch()),

('ast_meshy_image_to_3d','meshy_image_to_3d','meshy_image_to_3d','Meshy Image to 3D','media.execute','media','{}','meshy_image_to_3d',
 'media.generate','Create a textured Meshy model from one image.',
 '{"type":"object","required":["image_url"],"properties":{"image_url":{"type":"string"},"should_texture":{"type":"boolean"},"enable_pbr":{"type":"boolean"},"ai_model":{"type":"string"},"target_formats":{"type":"array","items":{"type":"string"}},"pose_mode":{"type":"string"}},"additionalProperties":false}',
 '{"type":"object"}','medium',0,0,1,1,0,'internal',42,'934 canonical Meshy image generation','["auto","agent","debug","multitask"]','design_studio','cad_generation',unixepoch(),unixepoch()),

('ast_meshy_multi_image','meshy_multi_image_to_3d','meshy_multi_image_to_3d','Meshy Multi-Image to 3D','media.execute','media','{}','meshy_multi_image_to_3d',
 'media.generate','Create a Meshy model from 1–4 views of the same object.',
 '{"type":"object","required":["image_urls"],"properties":{"image_urls":{"type":"array","minItems":1,"maxItems":4,"items":{"type":"string"}},"should_texture":{"type":"boolean"},"enable_pbr":{"type":"boolean"},"ai_model":{"type":"string"},"target_formats":{"type":"array","items":{"type":"string"}}},"additionalProperties":false}',
 '{"type":"object"}','medium',0,0,1,1,0,'internal',43,'934 canonical Meshy multi-view generation','["auto","agent","debug","multitask"]','design_studio','cad_generation',unixepoch(),unixepoch()),

('ast_meshy_remesh','meshy_remesh','meshy_remesh','Meshy Remesh','media.execute','media','{}','meshy_remesh',
 'media.transform','Change topology or polygon count for an owned Meshy task or model URL.',
 '{"type":"object","properties":{"input_task_id":{"type":"string"},"model_url":{"type":"string"},"target_formats":{"type":"array","items":{"type":"string"}},"topology":{"type":"string","enum":["triangle","quad"]},"target_polycount":{"type":"integer","minimum":100,"maximum":300000},"decimation_mode":{"type":"integer"}},"additionalProperties":false}',
 '{"type":"object"}','medium',0,0,1,1,0,'internal',44,'934 canonical Meshy remesh','["auto","agent","debug","multitask"]','design_studio','cad_generation',unixepoch(),unixepoch()),

('ast_meshy_retexture','meshy_retexture','meshy_retexture','Meshy Retexture','media.execute','media','{}','meshy_retexture',
 'media.transform','Apply a text- or image-guided texture to an existing Meshy model.',
 '{"type":"object","properties":{"input_task_id":{"type":"string"},"model_url":{"type":"string"},"text_style_prompt":{"type":"string"},"image_style_url":{"type":"string"},"enable_pbr":{"type":"boolean"},"target_formats":{"type":"array","items":{"type":"string"}}},"additionalProperties":false}',
 '{"type":"object"}','medium',0,0,1,1,0,'internal',45,'934 canonical Meshy retexture','["auto","agent","debug","multitask"]','design_studio','cad_generation',unixepoch(),unixepoch()),

('ast_meshy_rig','meshy_rig','meshy_rig','Meshy Rig','media.execute','media','{}','meshy_rig',
 'media.transform','Rig a humanoid Meshy model. The source should use a T-pose and contain no more than 300,000 faces.',
 '{"type":"object","properties":{"input_task_id":{"type":"string"},"model_url":{"type":"string"},"height_meters":{"type":"number"}},"additionalProperties":false}',
 '{"type":"object"}','medium',0,0,1,1,0,'internal',46,'934 canonical Meshy rigging','["auto","agent","debug","multitask"]','design_studio','cad_generation',unixepoch(),unixepoch()),

('ast_meshy_animate','meshy_animate','meshy_animate','Meshy Animate','media.execute','media','{}','meshy_animate',
 'media.transform','Apply a custom Meshy animation clip to a completed rig task.',
 '{"type":"object","required":["rig_task_id","action_id"],"properties":{"rig_task_id":{"type":"string"},"action_id":{"type":"integer"},"post_process":{"type":"object"}},"additionalProperties":false}',
 '{"type":"object"}','medium',0,0,1,1,0,'internal',47,'934 canonical Meshy animation','["auto","agent","debug","multitask"]','design_studio','cad_generation',unixepoch(),unixepoch()),

('ast_meshy_convert','meshy_convert','meshy_convert','Meshy Convert','media.execute','media','{}','meshy_convert',
 'media.transform','Convert a Meshy model to requested 3D formats.',
 '{"type":"object","required":["target_formats"],"properties":{"input_task_id":{"type":"string"},"model_url":{"type":"string"},"target_formats":{"type":"array","minItems":1,"items":{"type":"string","enum":["glb","fbx","obj","usdz","blend","stl","3mf"]}}},"additionalProperties":false}',
 '{"type":"object"}','low',0,0,1,1,0,'internal',48,'934 canonical Meshy format conversion','["auto","agent","debug","multitask"]','design_studio','cad_generation',unixepoch(),unixepoch()),

('ast_meshy_resize','meshy_resize','meshy_resize','Meshy Resize','media.execute','media','{}','meshy_resize',
 'media.transform','Set real-world dimensions for a Meshy model.',
 '{"type":"object","properties":{"input_task_id":{"type":"string"},"model_url":{"type":"string"},"resize_height":{"type":"number"},"resize_longest_side":{"type":"number"},"auto_size":{"type":"boolean"},"origin_at":{"type":"string","enum":["bottom","center"]}},"additionalProperties":false}',
 '{"type":"object"}','low',0,0,1,1,0,'internal',49,'934 canonical Meshy resize','["auto","agent","debug","multitask"]','design_studio','cad_generation',unixepoch(),unixepoch()),

('ast_meshy_uv_unwrap','meshy_uv_unwrap','meshy_uv_unwrap','Meshy UV Unwrap','media.execute','media','{}','meshy_uv_unwrap',
 'media.transform','Generate a UV layout for an existing Meshy model.',
 '{"type":"object","properties":{"input_task_id":{"type":"string"},"model_url":{"type":"string"}},"additionalProperties":false}',
 '{"type":"object"}','medium',0,0,1,1,0,'internal',50,'934 canonical Meshy UV unwrap','["auto","agent","debug","multitask"]','design_studio','cad_generation',unixepoch(),unixepoch()),

('ast_meshy_task_status','meshy_get_task_status','meshy_get_task_status','Meshy Task Status','media.status','media','{}','meshy_get_task_status',
 'media.status','Read IAM-owned Meshy job status by CAD job id.',
 '{"type":"object","required":["job_id"],"properties":{"job_id":{"type":"string"}},"additionalProperties":false}',
 '{"type":"object"}','low',0,0,1,1,0,'internal',51,'934 canonical Meshy task status','["ask","auto","agent","debug","multitask"]','design_studio','cad_generation',unixepoch(),unixepoch()),

('ast_meshy_list_tasks','meshy_list_tasks','meshy_list_tasks','List Meshy Tasks','media.status','media','{}','meshy_list_tasks',
 'media.status','List recent IAM-owned Meshy jobs for the authenticated user and workspace.',
 '{"type":"object","properties":{"limit":{"type":"integer","minimum":1,"maximum":20,"default":10}},"additionalProperties":false}',
 '{"type":"object","properties":{"tasks":{"type":"array"},"count":{"type":"integer"}},"required":["tasks","count"]}','low',0,0,1,1,0,'internal',52,'934 canonical scoped Meshy task list','["ask","auto","agent","debug","multitask"]','design_studio','cad_generation',unixepoch(),unixepoch()),

('ast_meshy_cancel_task','meshy_cancel_task','meshy_cancel_task','Delete Meshy Task','media.manage','media','{}','meshy_cancel_task',
 'media.manage','Permanently delete an authenticated user-owned Meshy task and mark its IAM CAD job canceled. Meshy exposes DELETE, not a reversible cancel operation.',
 '{"type":"object","required":["job_id"],"properties":{"job_id":{"type":"string"}},"additionalProperties":false}',
 '{"type":"object","properties":{"ok":{"type":"boolean"},"job_id":{"type":"string"},"task_id":{"type":"string"},"deleted":{"type":"boolean"}},"required":["ok","job_id","deleted"]}','high',1,1,1,1,0,'internal',53,'934 canonical scoped Meshy DELETE','["agent","multitask"]','design_studio','cad_generation',unixepoch(),unixepoch());

INSERT OR IGNORE INTO agentsam_tool_capabilities
  (tool_id, capability_key, requirement_type, is_primary, created_at)
SELECT t.id, t.capability_key, 'required', 1, unixepoch()
FROM agentsam_tools t
WHERE t.tool_key LIKE 'meshy_%' AND t.capability_key LIKE 'media.%';

UPDATE agentsam_tool_profiles
SET tool_keys_json = '["illustration_create","meshy_text_to_3d","meshy_text_to_3d_refine","meshy_image_to_3d","meshy_multi_image_to_3d","meshy_remesh","meshy_retexture","meshy_rig","meshy_animate","meshy_convert","meshy_resize","meshy_uv_unwrap","meshy_get_task_status","meshy_list_tasks","meshy_cancel_task","agentsam_memory_manager"]',
    max_tools = 16,
    notes = '934: canonical executable Meshy catalog; legacy meshyai_* keys remain aliases',
    updated_at = unixepoch()
WHERE profile_key IN ('design_studio','cad_generation');

UPDATE agentsam_prompt_routes
SET tool_keys = '["illustration_create","meshy_text_to_3d","meshy_text_to_3d_refine","meshy_image_to_3d","meshy_multi_image_to_3d","meshy_remesh","meshy_retexture","meshy_rig","meshy_animate","meshy_convert","meshy_resize","meshy_uv_unwrap","meshy_get_task_status","meshy_list_tasks","meshy_cancel_task","agentsam_memory_manager"]',
    updated_at = unixepoch()
WHERE route_key IN ('design_studio','cad_generation');
