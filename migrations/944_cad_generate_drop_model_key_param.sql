-- 944: cad_generate must not advertise a `model_key` input.
-- The property had no description, so the agent treated it as a NAME for the CAD object
-- (e.g. "cube_40mm_center_hole_15mm") and passed it as an LLM model key. That hit the strict
-- requested-model path in resolveModelForTask → [resolveModel:MODEL_NOT_FOUND].
-- The script-generation LLM is resolved by routing arms server-side; the agent never picks it.

UPDATE agentsam_tools
SET input_schema = '{"type":"object","required":["engine","prompt"],"properties":{"engine":{"type":"string","enum":["openscad","freecad","blender"],"description":"CAD engine to generate a script for."},"prompt":{"type":"string","maxLength":4000,"description":"Natural-language description of the object to model."},"project_id":{"type":"string","description":"Optional Design Studio project/blueprint id to associate."},"scene_snapshot_id":{"type":"string","description":"Optional scene snapshot id to link the job to."}},"additionalProperties":false}',
    notes = '944: dropped model_key param — script LLM is system-resolved (fixes MODEL_NOT_FOUND on object slug)',
    updated_at = unixepoch()
WHERE tool_key = 'cad_generate';
