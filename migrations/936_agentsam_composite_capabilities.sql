-- 936: Operation-sensitive composite capabilities.
WITH x(tool_key, capability_key, operations_json) AS (
  VALUES
    ('agentsam_memory_manager','memory.write','["write","upsert","save","memory_write"]'),
    ('agentsam_memory_manager','memory.delete','["delete","resolve","close","memory_delete","memory_resolve"]'),
    ('agentsam_codebase_scan_fix','file.read',NULL),
    ('agentsam_codebase_scan_fix','github.write','["fix_and_pr","fix_and_deploy"]'),
    ('agentsam_codebase_scan_fix','cloudflare.deploy','["fix_and_deploy"]'),
    ('illustration_create','design.write',NULL),
    ('agentsam_cf_vectorize','vector.read','["query","search"]'),
    ('agentsam_gdrive','drive.write','["write","create","update","delete"]')
)
INSERT OR IGNORE INTO agentsam_tool_capabilities
  (tool_id, capability_key, requirement_type, is_primary, operations_json, created_at)
SELECT t.id, x.capability_key, 'required', 0, x.operations_json, unixepoch()
FROM agentsam_tools t
JOIN x ON x.tool_key = t.tool_key;
