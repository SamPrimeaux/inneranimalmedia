-- 852: Catalog Meshy remesh / convert / resize / UV unwrap (+ retexture/print already handled in JS).
-- Docs: https://docs.meshy.ai/en/api/remesh · convert · resize · uv-unwrap · rigging · animation
-- Meshy = one 3D source lane (not exclusive vs FreeCAD/OpenSCAD/Blender).
-- CloudConvert stays MovieMode / general media — do NOT pin into design_studio Meshy tools.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/852_meshy_postprocess_catalog.sql

INSERT OR REPLACE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type, handler_key,
  capability_key, description, input_schema, risk_level, requires_approval,
  requires_confirmation, is_active, is_global, oauth_visible, dispatch_target,
  sort_priority, notes, modes_json, domain, task_type, created_at, updated_at
) VALUES (
  'ast_meshyai_remesh',
  'meshyai_remesh',
  'meshyai_remesh',
  'Meshy Remesh',
  'media.execute',
  'ai',
  'meshyai_remesh',
  'meshy.remesh',
  'Remesh a SUCCEEDED Meshy Text/Image-to-3D or Retexture task (or model_url). Prefer dedicated meshyai_convert / meshyai_resize for format-only or size-only. Docs: https://docs.meshy.ai/en/api/remesh',
  '{"type":"object","properties":{"input_task_id":{"type":"string"},"model_url":{"type":"string"},"target_formats":{"type":"array","items":{"type":"string","enum":["glb","fbx","obj","usdz","blend","stl","3mf"]}},"topology":{"type":"string","enum":["triangle","quad"]},"target_polycount":{"type":"integer","minimum":100,"maximum":300000},"decimation_mode":{"type":"integer","enum":[1,2,3,4],"description":"1=ultra 2=high 3=medium 4=low; ignores target_polycount"},"alpha_thumbnail":{"type":"boolean"}},"additionalProperties":false}',
  'medium', 0, 0, 1, 1, 0, 'internal', 45,
  '852: POST /openapi/v1/remesh via cad-meshy',
  '["auto","agent","debug","multitask"]',
  'design_studio', 'cad_generation', unixepoch(), unixepoch()
);

INSERT OR REPLACE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type, handler_key,
  capability_key, description, input_schema, risk_level, requires_approval,
  requires_confirmation, is_active, is_global, oauth_visible, dispatch_target,
  sort_priority, notes, modes_json, domain, task_type, created_at, updated_at
) VALUES (
  'ast_meshyai_convert',
  'meshyai_convert',
  'meshyai_convert',
  'Meshy Convert Formats',
  'media.execute',
  'ai',
  'meshyai_convert',
  'meshy.convert',
  'Convert a Meshy 3D model to glb/fbx/obj/usdz/blend/stl/3mf. Meshy CAD lane only — use CloudConvert for video/PDF/office. Docs: https://docs.meshy.ai/en/api/convert',
  '{"type":"object","required":["target_formats"],"properties":{"input_task_id":{"type":"string"},"model_url":{"type":"string"},"target_formats":{"type":"array","items":{"type":"string","enum":["glb","fbx","obj","usdz","blend","stl","3mf"]},"minItems":1}},"additionalProperties":false}',
  'low', 0, 0, 1, 1, 0, 'internal', 46,
  '852: POST /openapi/v1/convert — not CloudConvert',
  '["auto","agent","debug","multitask"]',
  'design_studio', 'cad_generation', unixepoch(), unixepoch()
);

INSERT OR REPLACE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type, handler_key,
  capability_key, description, input_schema, risk_level, requires_approval,
  requires_confirmation, is_active, is_global, oauth_visible, dispatch_target,
  sort_priority, notes, modes_json, domain, task_type, created_at, updated_at
) VALUES (
  'ast_meshyai_resize',
  'meshyai_resize',
  'meshyai_resize',
  'Meshy Resize Model',
  'media.execute',
  'ai',
  'meshyai_resize',
  'meshy.resize',
  'Resize a Meshy model to real-world meters (resize_height XOR resize_longest_side XOR auto_size). Docs: https://docs.meshy.ai/en/api/resize',
  '{"type":"object","properties":{"input_task_id":{"type":"string"},"model_url":{"type":"string"},"resize_height":{"type":"number","description":"Height in meters"},"resize_longest_side":{"type":"number"},"auto_size":{"type":"boolean"},"origin_at":{"type":"string","enum":["bottom","center"]}},"additionalProperties":false}',
  'low', 0, 0, 1, 1, 0, 'internal', 47,
  '852: POST /openapi/v1/resize',
  '["auto","agent","debug","multitask"]',
  'design_studio', 'cad_generation', unixepoch(), unixepoch()
);

INSERT OR REPLACE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type, handler_key,
  capability_key, description, input_schema, risk_level, requires_approval,
  requires_confirmation, is_active, is_global, oauth_visible, dispatch_target,
  sort_priority, notes, modes_json, domain, task_type, created_at, updated_at
) VALUES (
  'ast_meshyai_uv_unwrap',
  'meshyai_uv_unwrap',
  'meshyai_uv_unwrap',
  'Meshy UV Unwrap',
  'media.execute',
  'ai',
  'meshyai_uv_unwrap',
  'meshy.uv_unwrap',
  'Generate UV unwrap (white model) before retexture. Max ~40k faces — remesh first if needed. Docs: https://docs.meshy.ai/en/api/uv-unwrap',
  '{"type":"object","properties":{"input_task_id":{"type":"string"},"model_url":{"type":"string"}},"additionalProperties":false}',
  'medium', 0, 0, 1, 1, 0, 'internal', 48,
  '852: POST /openapi/v1/uv-unwrap',
  '["auto","agent","debug","multitask"]',
  'design_studio', 'cad_generation', unixepoch(), unixepoch()
);

INSERT OR REPLACE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type, handler_key,
  capability_key, description, input_schema, risk_level, requires_approval,
  requires_confirmation, is_active, is_global, oauth_visible, dispatch_target,
  sort_priority, notes, modes_json, domain, task_type, created_at, updated_at
) VALUES (
  'ast_meshyai_retexture',
  'meshyai_retexture',
  'meshyai_retexture',
  'Meshy Retexture',
  'media.execute',
  'ai',
  'meshyai_retexture',
  'meshy.retexture',
  'Retexture a SUCCEEDED Meshy model via text_style_prompt or image_style_url.',
  '{"type":"object","properties":{"input_task_id":{"type":"string"},"model_url":{"type":"string"},"text_style_prompt":{"type":"string"},"image_style_url":{"type":"string"},"ai_model":{"type":"string"},"enable_pbr":{"type":"boolean"},"target_formats":{"type":"array","items":{"type":"string"}}},"additionalProperties":false}',
  'medium', 0, 0, 1, 1, 0, 'internal', 49,
  '852: handler already existed; catalog pin',
  '["auto","agent","debug","multitask"]',
  'design_studio', 'cad_generation', unixepoch(), unixepoch()
);

-- Pin full Meshy stack on Design Studio (generation + post-process + animate). FreeCAD/OpenSCAD remain via illustration_create.
UPDATE agentsam_tool_profiles
SET tool_keys_json = '["illustration_create","meshyai_text_to_3d","meshyai_image_to_3d","meshyai_remesh","meshyai_convert","meshyai_resize","meshyai_uv_unwrap","meshyai_retexture","meshyai_rigging","meshyai_animation","meshyai_get_task","agentsam_memory_manager"]',
    max_tools = 14,
    notes = '852: Meshy is a source lane (not exclusive). Remesh/convert/resize/uv + animate cataloged. CloudConvert stays MovieMode.',
    updated_at = unixepoch()
WHERE profile_key IN ('design_studio', 'cad_generation');

UPDATE agentsam_prompt_routes
SET tool_keys = '["illustration_create","meshyai_text_to_3d","meshyai_image_to_3d","meshyai_remesh","meshyai_convert","meshyai_resize","meshyai_uv_unwrap","meshyai_retexture","meshyai_rigging","meshyai_animation","meshyai_get_task","agentsam_memory_manager"]',
    updated_at = unixepoch()
WHERE route_key IN ('design_studio', 'cad_generation');
