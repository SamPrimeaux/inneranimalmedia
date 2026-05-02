-- 245: agentsam_workflow_runs — Supabase sync + denormalized workflow labels.
-- Prerequisites: Table agentsam_workflow_runs must exist. If the database still has mcp_workflow_runs only,
-- run once (before this migration): ALTER TABLE mcp_workflow_runs RENAME TO agentsam_workflow_runs;
-- D1 applies each migration file once.

ALTER TABLE agentsam_workflow_runs ADD COLUMN supabase_run_id TEXT;
ALTER TABLE agentsam_workflow_runs ADD COLUMN supabase_sync_status TEXT DEFAULT 'pending';
ALTER TABLE agentsam_workflow_runs ADD COLUMN supabase_synced_at TEXT;
ALTER TABLE agentsam_workflow_runs ADD COLUMN supabase_sync_error TEXT;
ALTER TABLE agentsam_workflow_runs ADD COLUMN supabase_sync_attempts INTEGER DEFAULT 0;
ALTER TABLE agentsam_workflow_runs ADD COLUMN workflow_key TEXT;
ALTER TABLE agentsam_workflow_runs ADD COLUMN display_name TEXT;
