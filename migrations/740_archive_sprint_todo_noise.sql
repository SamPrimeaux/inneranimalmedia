-- 740: Archive sprint/plan debris so owner-facing task surfaces show current work only.
-- Requires: nothing (safe on fresh DB). For unbound sprint cleanup see 742 after 741.

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
