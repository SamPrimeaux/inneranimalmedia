-- 792: Backfill task_activity from agentsam_todo (no project_time_entries dependency)

INSERT OR IGNORE INTO task_activity (id, task_id, task_source, tenant_id, workspace_id, user_id, action, changes_json, created_at)
SELECT
  'ta_backfill_created_' || t.id,
  t.id,
  'agentsam_todo',
  t.tenant_id,
  t.workspace_id,
  COALESCE(t.created_by, 'system'),
  'created',
  json_object('title', t.title, 'project_id', t.project_id, 'source', 'migration_792'),
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
  json_object('from', 'open', 'to', t.status, 'field', 'status', 'source', 'migration_792'),
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
  json_object('from', 'open', 'to', 'in_progress', 'field', 'status', 'source', 'migration_792'),
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
  json_object('status', t.status, 'due_date', t.due_date, 'source', 'migration_792'),
  unixepoch()
FROM agentsam_todo t
WHERE t.status = 'carried'
  AND t.tenant_id IS NOT NULL;
