-- 941: Design Studio chat must create CAD jobs that land in the viewport.
-- design_studio_base was read-only (scene/asset/status) — agent dumped OpenSCAD source instead.
-- Expand base menu with cad_generate + cad_job_cancel; keep cad_generation as focused intake profile.

UPDATE agentsam_tool_profiles
SET tool_keys_json = '["designstudio_scene_list","designstudio_asset_list","cad_job_status","cad_generate","cad_job_cancel"]',
    max_tools = 5,
    write_policy_json = '{"version":2,"deny_capabilities":[],"allow_mutating_capabilities":["media.generate","design.write"],"require_approval_capabilities":["design.write"]}',
    notes = 'Studio inspection + engine-neutral CAD intake. cad_generate auto-dispatches; GLB auto-spawns in the Design Studio viewport. Do not paste OpenSCAD/FreeCAD/Blender source unless the user asks for source.',
    updated_at = unixepoch()
WHERE profile_key = 'design_studio_base';

UPDATE agentsam_tools
SET description = 'Create an OpenSCAD, FreeCAD, or Blender CAD job from a natural-language prompt, then auto-dispatch execution. Prefer this over pasting source code. Poll cad_job_status; the Design Studio viewport auto-spawns the GLB when the job completes.',
    notes = '941: generate + auto-execute for viewport spawn',
    updated_at = unixepoch()
WHERE tool_key = 'cad_generate';

UPDATE agentsam_tools
SET output_schema = '{"type":"object","properties":{"ok":{"type":"boolean"},"job_id":{"type":"string"},"engine":{"type":"string"},"status":{"type":"string"},"model_key":{"type":"string"},"next_step":{"type":"string"},"dispatched":{"type":"boolean"}},"required":["ok","job_id","engine","status"]}',
    updated_at = unixepoch()
WHERE tool_key = 'cad_generate';
