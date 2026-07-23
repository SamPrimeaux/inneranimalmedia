-- 1010: Stop Local Explorer from minting fake agentsam_workspace rows.
-- Root cause: POST /api/workspace/create INSERTed a UUID into the permanent registry
-- to satisfy FK + uidx_agentsam_workspace_state_workspace (1 state per workspace_id).
-- Fix: one sentinel parent (ws_local_explorer); many state rows keyed by id uws:…;
-- partial unique index keeps real workspaces 1:1 for MCP/chat spine ON CONFLICT.

-- 1) Sentinel (idempotent)
INSERT INTO agentsam_workspace (
  id, workspace_slug, tenant_id, name, display_name, status,
  d1_binding, description, created_at, updated_at
)
SELECT
  'ws_local_explorer',
  'local-explorer',
  'tenant_sam_primeaux',
  'Local Explorer (ephemeral folder state)',
  'Local Explorer',
  'active',
  'DB',
  'Sentinel parent for Local Explorer user_workspace_v1 state only. Never a product workspace.',
  unixepoch(),
  unixepoch()
WHERE NOT EXISTS (SELECT 1 FROM agentsam_workspace WHERE id = 'ws_local_explorer');

-- 2) Allow many state rows under the sentinel (drop global uniqueness)
DROP INDEX IF EXISTS uidx_agentsam_workspace_state_workspace;

-- 3) Re-parent existing Local Explorer state onto the sentinel
UPDATE agentsam_workspace_state
SET workspace_id = 'ws_local_explorer',
    workspace_type = 'local_explorer',
    updated_at = unixepoch()
WHERE id LIKE 'uws:%';

-- 4) Real workspaces stay 1:1; Local Explorer state (id uws:…) is excluded
CREATE UNIQUE INDEX uidx_agentsam_workspace_state_workspace
  ON agentsam_workspace_state(workspace_id)
  WHERE id NOT LIKE 'uws:%';

-- 5) Delete the fake registry rows (uws_* sprawl). State already re-parented.
DELETE FROM agentsam_workspace
WHERE workspace_slug LIKE 'uws_%'
   OR (
     id GLOB '*-*-*-*-*'
     AND length(id) = 36
     AND d1_database_id IS NULL
     AND worker_name IS NULL
     AND COALESCE(github_repo, '') = ''
   );
