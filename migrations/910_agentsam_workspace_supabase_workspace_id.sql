-- 910: D1 owns ws_* ↔ Supabase workspace UUID map
-- agentsam_workspace.supabase_workspace_id = agentsam.agentsam_workspaces.id

ALTER TABLE agentsam_workspace ADD COLUMN supabase_workspace_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_agentsam_workspace_supabase_uuid
  ON agentsam_workspace(supabase_workspace_id)
  WHERE supabase_workspace_id IS NOT NULL AND trim(supabase_workspace_id) != '';

-- Platform + known client mappings (from rag-lanes / platform-identity-constants)
UPDATE agentsam_workspace
   SET supabase_workspace_id = 'fa1f12a8-c841-4b79-a26c-d53a78b17dac',
       updated_at = COALESCE(updated_at, unixepoch())
 WHERE id = 'ws_inneranimalmedia'
   AND (supabase_workspace_id IS NULL OR trim(supabase_workspace_id) = '');

UPDATE agentsam_workspace
   SET supabase_workspace_id = '105ac2d1-8e61-4cec-80c8-ef2a0902448d',
       updated_at = COALESCE(updated_at, unixepoch())
 WHERE id = 'ws_connor_mcneely'
   AND (supabase_workspace_id IS NULL OR trim(supabase_workspace_id) = '');

UPDATE agentsam_workspace
   SET supabase_workspace_id = '869137d3-cd65-4ac1-88cc-a1bad9844718',
       updated_at = COALESCE(updated_at, unixepoch())
 WHERE id = 'ws_meauxbility'
   AND (supabase_workspace_id IS NULL OR trim(supabase_workspace_id) = '');
