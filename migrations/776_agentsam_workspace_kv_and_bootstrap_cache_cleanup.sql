-- 776: Retire bootstrap_cache hack rows + archive uws_* noise workspaces.
-- kv_namespace_id already on remote (2026-07-06). Fresh local DBs: apply column via wrangler if missing.

DELETE FROM agentsam_project_context WHERE project_type = 'bootstrap_cache';

UPDATE agentsam_workspace
SET status = 'archived', updated_at = unixepoch()
WHERE workspace_slug LIKE 'uws_%'
  AND d1_database_id IS NULL
  AND worker_name IS NULL
  AND COALESCE(status, 'active') = 'active';
