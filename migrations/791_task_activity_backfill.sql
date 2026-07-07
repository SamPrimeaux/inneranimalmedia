-- 791: Backfill task_activity from existing agentsam_todo rows (idempotent)
-- Seeds lifecycle events so velocity/brief queries have signal before new writes land.

INSERT OR IGNORE INTO task_activity (id, task_id, task_source, tenant_id, workspace_id, user_id, action, changes_json, created_at)
SELECT
  'ta_backfill_created_' || t.id,
  t.id,
  'agentsam_todo',
  t.tenant_id,
  t.workspace_id,
  COALESCE(t.created_by, 'system'),
  'created',
  json_object('title', t.title, 'project_id', t.project_id, 'source', 'migration_791'),
  COALESCE(unixepoch(t.created_at), unixepoch())
FROM agentsam_todo t
WHERE t.tenant_id IS NOT NULL;

INSERT OR IGNORE INTO task_activity (id, task_id, task_source, tenant_id, workspace_id, user_id, action, changes_json, created_at)
SELECT
  'ta_backfill_completed_' || t.id,
  t.id,
  'agentsam_todo',
  t.tenant_id,
  t.workspace_id,
  COALESCE(t.created_by, 'system'),
  'completed',
  json_object('from', 'open', 'to', t.status, 'field', 'status', 'source', 'migration_791'),
  COALESCE(unixepoch(t.completed_at), unixepoch(t.updated_at), unixepoch())
FROM agentsam_todo t
WHERE t.status IN ('done', 'completed')
  AND t.tenant_id IS NOT NULL;

INSERT OR IGNORE INTO task_activity (id, task_id, task_source, tenant_id, workspace_id, user_id, action, changes_json, created_at)
SELECT
  'ta_backfill_started_' || t.id,
  t.id,
  'agentsam_todo',
  t.tenant_id,
  t.workspace_id,
  COALESCE(t.created_by, 'system'),
  'started',
  json_object('from', 'open', 'to', 'in_progress', 'field', 'status', 'source', 'migration_791'),
  COALESCE(unixepoch(t.updated_at), unixepoch())
FROM agentsam_todo t
WHERE t.status = 'in_progress'
  AND t.tenant_id IS NOT NULL;

INSERT OR IGNORE INTO task_activity (id, task_id, task_source, tenant_id, workspace_id, user_id, action, changes_json, created_at)
SELECT
  'ta_backfill_carried_' || t.id,
  t.id,
  'agentsam_todo',
  t.tenant_id,
  t.workspace_id,
  COALESCE(t.created_by, 'system'),
  'carried',
  json_object('status', t.status, 'due_date', t.due_date, 'source', 'migration_791'),
  unixepoch()
FROM agentsam_todo t
WHERE t.status = 'carried'
  AND t.tenant_id IS NOT NULL;

-- Repair today's velocity row with real todo + time signals (idempotent update)
UPDATE task_velocity
SET
  time_minutes = COALESCE((
    SELECT ROUND(SUM(duration_seconds) / 60.0)
    FROM project_time_entries
    WHERE date(start_time) = task_velocity.date
  ), time_minutes),
  notes = COALESCE(notes, '') || CASE
    WHEN EXISTS (
      SELECT 1 FROM agentsam_todo
      WHERE date(completed_at) = date(task_velocity.date)
        AND status IN ('done', 'completed')
    ) THEN ' | todos completed: ' || (
      SELECT COUNT(*) FROM agentsam_todo
      WHERE date(completed_at) = date(task_velocity.date)
        AND status IN ('done', 'completed')
    )
    ELSE ''
  END
WHERE date = date('now', '-1 day');
