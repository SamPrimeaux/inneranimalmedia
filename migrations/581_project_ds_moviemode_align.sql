-- migrations/581_project_ds_moviemode_align.sql
-- Wire projects → scene_snapshots → agentsam_cad_jobs for Design Studio
-- Wire projects → moviemode_edit_sessions for MovieMode
-- No new tables — salvage existing structure

-- 1. project_storage: add project_id + workspace_id for per-project scoping
ALTER TABLE project_storage ADD COLUMN project_id TEXT;
ALTER TABLE project_storage ADD COLUMN workspace_id TEXT;
CREATE INDEX IF NOT EXISTS idx_project_storage_project
  ON project_storage(project_id) WHERE project_id IS NOT NULL;

-- 2. scene_snapshots: wire to projects + capture missing Design Studio fields
ALTER TABLE scene_snapshots ADD COLUMN project_id TEXT;
ALTER TABLE scene_snapshots ADD COLUMN glb_r2_key TEXT;
ALTER TABLE scene_snapshots ADD COLUMN style_preset TEXT;
ALTER TABLE scene_snapshots ADD COLUMN voxel_count INTEGER;
ALTER TABLE scene_snapshots ADD COLUMN cad_job_id TEXT;
CREATE INDEX IF NOT EXISTS idx_scene_snapshots_project
  ON scene_snapshots(project_id) WHERE project_id IS NOT NULL;

-- 3. agentsam_cad_jobs: add missing scope + scene link + progress
ALTER TABLE agentsam_cad_jobs ADD COLUMN workspace_id TEXT;
ALTER TABLE agentsam_cad_jobs ADD COLUMN tenant_id TEXT;
ALTER TABLE agentsam_cad_jobs ADD COLUMN project_id TEXT;
ALTER TABLE agentsam_cad_jobs ADD COLUMN scene_snapshot_id TEXT;
ALTER TABLE agentsam_cad_jobs ADD COLUMN progress_pct REAL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_cad_jobs_status
  ON agentsam_cad_jobs(status, created_at) WHERE status = 'pending';

-- 4. moviemode_edit_sessions: add project_id FK
ALTER TABLE moviemode_edit_sessions ADD COLUMN project_id TEXT;
CREATE INDEX IF NOT EXISTS idx_moviemode_sessions_project
  ON moviemode_edit_sessions(project_id) WHERE project_id IS NOT NULL;
