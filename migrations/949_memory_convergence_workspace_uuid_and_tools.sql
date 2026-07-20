-- 949: memory convergence — UUID uniqueness + tool handler alignment
-- ws_* remains canonical IAM id; supabase_workspace_id is relational bridge only.

-- Remove corrupt workspace row with NULL id (not a valid ws_* key).
DELETE FROM agentsam_workspace WHERE id IS NULL OR trim(id) = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_agentsam_workspace_supabase_workspace_id_unique
  ON agentsam_workspace(supabase_workspace_id)
  WHERE supabase_workspace_id IS NOT NULL AND trim(supabase_workspace_id) != '';

-- Main in-app Agent Sam uses handler_type=memory for commit/save/search (same core as MCP adapters).
UPDATE agentsam_tools
   SET handler_type = 'memory',
       handler_config = json_set(
         COALESCE(handler_config, '{}'),
         '$.operation',
         CASE tool_key
           WHEN 'agentsam_memory_search' THEN 'memory_search'
           WHEN 'agentsam_memory_save' THEN 'memory.commit'
           ELSE 'memory.commit'
         END
       ),
       updated_at = unixepoch()
 WHERE tool_key IN ('agentsam_memory_commit', 'agentsam_memory_save', 'agentsam_memory_search');

UPDATE agentsam_tools SET is_active = 1, updated_at = unixepoch()
 WHERE tool_key IN ('agentsam_memory_commit', 'agentsam_memory_save', 'agentsam_memory_search');
