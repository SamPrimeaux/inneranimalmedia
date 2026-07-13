-- 850: Gemini function_declarations reject array properties without items.
-- Fixes Design Studio / cad_generation Gemini 400 on illustration_create.references.
-- Also replaces dead profile pin image_generation → imgx_generate_image.

UPDATE agentsam_tools
SET input_schema = '{"type":"object","required":["brief"],"properties":{"illustration":{"type":"object","description":"iam.illustration.v1 envelope"},"intent":{"type":"string","enum":["sketch","diagram","wireframe","house_floor_plan","blueprint","floor_plan","model_3d","sculpt","plan_map","other"]},"fidelity":{"type":"string","enum":["sketch","diagram","technical_2d","architectural_3d","structural"]},"engine":{"type":"string","enum":["auto","excalidraw","openscad","freecad","blender","meshy"],"default":"auto"},"title":{"type":"string"},"brief":{"type":"string"},"constraints":{"type":"object"},"payload":{"type":"object"},"references":{"type":"array","description":"Optional reference assets (URLs or labels)","items":{"type":"object","properties":{"url":{"type":"string"},"label":{"type":"string"},"kind":{"type":"string"}}}},"open_after_create":{"type":"boolean","default":true}}}',
    updated_at = unixepoch()
WHERE tool_key = 'illustration_create';

UPDATE agentsam_tools
SET input_schema = '{"type":"object","properties":{"sql":{"type":"string"},"params":{"type":"array","items":{"type":"string"},"description":"Optional bind params."}},"required":["sql"],"additionalProperties":false}',
    updated_at = unixepoch()
WHERE tool_key = 'agentsam_supabase_write';

UPDATE agentsam_tool_profiles
SET tool_keys_json = '["illustration_create","meshyai_text_to_3d","meshyai_image_to_3d","agentsam_d1_write","agentsam_memory_manager","agentsam_r2_put","imgx_generate_image"]',
    updated_at = unixepoch()
WHERE profile_key IN ('design_studio', 'cad_generation');

UPDATE agentsam_prompt_routes
SET tool_keys = '["illustration_create","meshyai_text_to_3d","meshyai_image_to_3d","agentsam_d1_write","agentsam_memory_manager","agentsam_r2_put","imgx_generate_image"]',
    updated_at = unixepoch()
WHERE route_key IN ('design_studio', 'cad_generation');
