-- 937: Mirror the joined primary capability into the temporary legacy column.
UPDATE agentsam_tools
SET capability_key = (
      SELECT tc.capability_key FROM agentsam_tool_capabilities tc
      WHERE tc.tool_id = agentsam_tools.id AND tc.is_primary = 1 LIMIT 1
    ),
    updated_at = unixepoch()
WHERE id IN (SELECT tool_id FROM agentsam_tool_capabilities WHERE is_primary = 1);

UPDATE agentsam_tool_capabilities
SET operations_json = '["upsert","delete"]'
WHERE tool_id = (SELECT id FROM agentsam_tools WHERE tool_key = 'agentsam_cf_vectorize')
  AND capability_key = 'vector.write';
