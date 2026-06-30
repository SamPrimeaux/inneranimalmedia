-- 740: Archive sprint/plan debris so owner-facing task surfaces show current work only.
-- Idempotent: only touches rows still open on abandoned/archived plans.

UPDATE agentsam_todo
SET status = 'done',
    execution_status = 'done',
    completed_at = COALESCE(completed_at, datetime('now')),
    updated_at = datetime('now')
WHERE LOWER(COALESCE(status, '')) NOT IN ('done', 'completed', 'cancelled')
  AND plan_id IN (
    SELECT id FROM agentsam_plans
    WHERE LOWER(COALESCE(status, '')) IN ('abandoned', 'archived')
  );

UPDATE agentsam_plan_tasks
SET status = 'done',
    completed_at = COALESCE(completed_at, unixepoch())
WHERE LOWER(COALESCE(status, '')) NOT IN ('done', 'skipped', 'carried')
  AND plan_id IN (
    SELECT id FROM agentsam_plans
    WHERE LOWER(COALESCE(status, '')) IN ('abandoned', 'archived')
  );

-- Legacy sprint module lists (backend/auth/…) with no project binding — archive if tied to any plan.
UPDATE agentsam_todo
SET status = 'done',
    execution_status = 'done',
    completed_at = COALESCE(completed_at, datetime('now')),
    updated_at = datetime('now')
WHERE LOWER(COALESCE(status, '')) NOT IN ('done', 'completed', 'cancelled')
  AND (project_id IS NULL OR TRIM(project_id) = '')
  AND plan_id IS NOT NULL
  AND LOWER(COALESCE(category, '')) NOT IN ('keep', 'notes', 'inbox', 'my tasks');
