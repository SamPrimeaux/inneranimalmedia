-- 939: Complete the active catalog classification with the AutoRAG read lane.
INSERT OR IGNORE INTO agentsam_tool_capabilities
  (tool_id, capability_key, requirement_type, is_primary, created_at)
SELECT id, 'vector.read', 'required', 1, unixepoch()
FROM agentsam_tools
WHERE tool_key = 'agentsam_autorag';

UPDATE agentsam_tools
SET capability_key = 'vector.read', updated_at = unixepoch()
WHERE tool_key = 'agentsam_autorag';
