-- 742: Archive legacy sprint-module todos with no project binding (requires 741 project_id column).
-- Run after 741_project_spine_columns.sql.

UPDATE agentsam_todo
SET status = 'done',
    execution_status = 'done',
    completed_at = COALESCE(completed_at, datetime('now')),
    updated_at = datetime('now')
WHERE LOWER(COALESCE(status, '')) NOT IN ('done', 'completed', 'cancelled')
  AND (project_id IS NULL OR TRIM(project_id) = '')
  AND plan_id IS NOT NULL
  AND LOWER(COALESCE(category, '')) NOT IN ('keep', 'notes', 'inbox', 'my tasks');
