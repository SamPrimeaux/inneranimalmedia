-- Manual D1 registration: dashboard /projects C2 work item (2026-05-14)
-- Applied to production D1 `inneranimalmedia-business` via wrangler execute.
-- plan_id: plan_may14_2026_repair
-- todo_id: todo_iam_dashboard_projects_c2
-- plan_task_id: task_iam_dashboard_projects_c2_ship
-- agentsam_memory key: work_item_dashboard_projects_c2
--
-- Re-run only if rows were deleted; prefer SELECT id FROM ... before INSERT.

-- Example (adjust tenant/user if needed):
/*
INSERT INTO agentsam_todo (...) VALUES ('todo_iam_dashboard_projects_c2', ...);
INSERT INTO agentsam_plan_tasks (...) VALUES ('task_iam_dashboard_projects_c2_ship', ...);
UPDATE agentsam_plans SET session_notes = ..., tasks_total = tasks_total + 1, tasks_done = tasks_done + 1 WHERE id = 'plan_may14_2026_repair';
INSERT INTO agentsam_memory (...) ON CONFLICT(tenant_id, user_id, key) DO UPDATE ...;
*/
