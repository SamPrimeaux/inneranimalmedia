-- 540: Plan sub-task hierarchy + list indexes
--
-- parent_task_id column applied on production 2026-06-04 before ledger entry.
-- D1 SQLite has no ADD COLUMN IF NOT EXISTS. Fresh DBs: if PRAGMA table_info lacks
-- parent_task_id, run once:
--   ALTER TABLE agentsam_plan_tasks ADD COLUMN parent_task_id TEXT;

CREATE INDEX IF NOT EXISTS idx_aptasks_parent ON agentsam_plan_tasks(plan_id, parent_task_id);

CREATE INDEX IF NOT EXISTS idx_aplans_ws_status ON agentsam_plans(workspace_id, status, updated_at DESC);
