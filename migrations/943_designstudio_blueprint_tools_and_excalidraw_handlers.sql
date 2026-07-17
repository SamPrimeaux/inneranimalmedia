-- 943: Blueprint tools for design_studio_base + fix empty Excalidraw handler_config.
-- Empty handler_config {} fails validateHandlerConfigForExecution → tools skipped at session bootstrap.

-- ── Fix Draw export / library (were skipped: invalid handler_config) ─────────
UPDATE agentsam_tools
SET handler_config = '{"auth_source":"workspace","binding":"internal","module":"media"}',
    capability_key = 'design.export',
    description = 'Export the active Draw/Excalidraw canvas as PNG+SVG to R2 (public_url / svg_public_url). Prefer calling without canvasData so the open canvas exports client-side; optional blueprint_id attaches previews.',
    input_schema = '{"type":"object","properties":{"title":{"type":"string"},"filename":{"type":"string"},"blueprint_id":{"type":"string"},"canvasData":{"type":"string","description":"Optional PNG data URL when exporting server-side"},"svgData":{"type":"string"},"downloadLocal":{"type":"boolean"}},"additionalProperties":true}',
    updated_at = unixepoch(),
    notes = COALESCE(notes || ' · ', '') || '943: non-empty handler_config + client export_plan path'
WHERE tool_key = 'excalidraw_export';

UPDATE agentsam_tools
SET handler_config = '{"auth_source":"workspace","binding":"internal","module":"media"}',
    capability_key = 'design.write',
    updated_at = unixepoch(),
    notes = COALESCE(notes || ' · ', '') || '943: non-empty handler_config'
WHERE tool_key = 'excalidraw_load_library';

-- ── Catalog: Design Studio blueprint CRUD ───────────────────────────────────
INSERT OR REPLACE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type, handler_config, handler_key,
  capability_key, description, input_schema, output_schema, risk_level, requires_approval,
  requires_confirmation, is_active, is_global, oauth_visible, dispatch_target,
  sort_priority, notes, modes_json, domain, task_type, created_at, updated_at
) VALUES
('ast_designstudio_blueprint_list','designstudio_blueprint_list','designstudio_blueprint_list','List Design Studio Blueprints',
 'design.read','agent','{"module":"design_studio"}','designstudio_blueprint_list','design.read',
 'List Design Studio design blueprints for the active workspace (title, status, preview URLs).',
 '{"type":"object","properties":{"limit":{"type":"integer","minimum":1,"maximum":50,"default":20},"status":{"type":"string"}},"additionalProperties":false}',
 '{"type":"object","properties":{"blueprints":{"type":"array"},"count":{"type":"integer"}},"required":["blueprints","count"]}',
 'low',0,0,1,1,0,'internal',30,'943 native blueprint list','["ask","agent","debug","multitask"]','design_studio','design_studio_base',unixepoch(),unixepoch()),

('ast_designstudio_blueprint_get','designstudio_blueprint_get','designstudio_blueprint_get','Get Design Studio Blueprint',
 'design.read','agent','{"module":"design_studio"}','designstudio_blueprint_get','design.read',
 'Fetch one Design Studio blueprint by id, including sketch_json and preview_image_url / preview_svg_url.',
 '{"type":"object","required":["blueprint_id"],"properties":{"blueprint_id":{"type":"string"}},"additionalProperties":false}',
 '{"type":"object"}','low',0,0,1,1,0,'internal',31,'943 native blueprint get','["ask","agent","debug","multitask"]','design_studio','design_studio_base',unixepoch(),unixepoch()),

('ast_designstudio_blueprint_create','designstudio_blueprint_create','designstudio_blueprint_create','Create Design Studio Blueprint',
 'design.write','agent','{"module":"design_studio"}','designstudio_blueprint_create','design.write',
 'Create a Design Studio blueprint (draft intent). Defaults set_active=true so Studio selects it. Do not generate CAD unless the user asks.',
 '{"type":"object","required":["title"],"properties":{"title":{"type":"string","maxLength":200},"description":{"type":"string"},"original_prompt":{"type":"string"},"tags":{"type":"array","items":{"type":"string"}},"set_active":{"type":"boolean","default":true}},"additionalProperties":false}',
 '{"type":"object","properties":{"ok":{"type":"boolean"},"blueprint_id":{"type":"string"},"blueprint":{"type":"object"}},"required":["ok","blueprint_id"]}',
 'medium',0,0,1,1,0,'internal',28,'943 native blueprint create','["agent","debug","multitask"]','design_studio','design_studio_base',unixepoch(),unixepoch()),

('ast_designstudio_blueprint_update','designstudio_blueprint_update','designstudio_blueprint_update','Update Design Studio Blueprint',
 'design.write','agent','{"module":"design_studio"}','designstudio_blueprint_update','design.write',
 'Update blueprint fields (title, status, preview URLs, sketch_json) or set_active to select it in Studio.',
 '{"type":"object","required":["blueprint_id"],"properties":{"blueprint_id":{"type":"string"},"title":{"type":"string"},"description":{"type":"string"},"original_prompt":{"type":"string"},"status":{"type":"string"},"preview_image_url":{"type":"string"},"preview_svg_url":{"type":"string"},"set_active":{"type":"boolean"}},"additionalProperties":true}',
 '{"type":"object"}','medium',0,0,1,1,0,'internal',29,'943 native blueprint update','["agent","debug","multitask"]','design_studio','design_studio_base',unixepoch(),unixepoch());

INSERT OR IGNORE INTO agentsam_tool_capabilities
  (tool_id, capability_key, requirement_type, is_primary, created_at)
SELECT id, capability_key, 'required', 1, unixepoch()
FROM agentsam_tools
WHERE tool_key IN (
  'designstudio_blueprint_list','designstudio_blueprint_get',
  'designstudio_blueprint_create','designstudio_blueprint_update'
);

-- Prefer blueprint tools ahead of scene/CAD readers (ORDER BY sort_priority ASC + LIMIT max_tools).
UPDATE agentsam_tool_profiles
SET tool_keys_json = '["designstudio_blueprint_create","designstudio_blueprint_list","designstudio_blueprint_get","designstudio_blueprint_update","designstudio_scene_list","designstudio_asset_list","cad_job_status","cad_generate","cad_job_cancel"]',
    max_tools = 10,
    write_policy_json = '{"version":2,"deny_capabilities":[],"allow_mutating_capabilities":["media.generate","design.write"],"require_approval_capabilities":["design.write"]}',
    notes = '943: base Studio + blueprint CRUD; CAD generate still available when user asks for 3D.',
    updated_at = unixepoch()
WHERE profile_key = 'design_studio_base';
