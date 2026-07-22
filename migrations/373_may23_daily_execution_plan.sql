-- May 23 2026 daily execution plan (workflow E2E, embed fix, P1 carry-over).
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/373_may23_daily_execution_plan.sql

INSERT OR IGNORE INTO agentsam_plans (
  id, tenant_id, workspace_id, plan_date, plan_type, title, status,
  morning_brief, session_notes, tasks_total, tasks_done, tasks_blocked,
  linked_project_keys, created_at, updated_at
) VALUES (
  'plan_may23_2026_execution',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  '2026-05-23',
  'daily',
  'May 23 2026 — Workflow E2E proof + alignment completion',
  'active',
  'AM: Run agent_browser_inspection_to_patch, i-am-inspector-playwright, cms_live_editor_dev_app to steps_completed>0. Fix codebase_chunks Buffer embed + batch backfill. PM: cms-theme verify + Database Studio OR routing/terminal P1.',
  '[2026-05-23T00:00:00Z] Daily plan seeded from May 22 sprint carry-over (commit 8b55359).' || char(10) ||
  '[2026-05-23] Parent sprint: plan_may22_2026_agent_sam (registry+alignment done).',
  0,
  0,
  0,
  '["agent_sam","workflows","alignment","dashboard"]',
  unixepoch(),
  unixepoch()
);

INSERT OR IGNORE INTO agentsam_todo (
  id, tenant_id, workspace_id, plan_id, title, description, status, priority, category,
  execution_status, linked_route, context_snapshot, created_at, updated_at
) VALUES
('todo_may23_workflow_e2e','tenant_sam_primeaux','ws_inneranimalmedia','plan_may23_2026_execution','E2E validate three repair workflows on prod','agent_browser_inspection_to_patch, i-am-inspector-playwright, cms_live_editor_dev_app — real step_results_json.','open','high','workflows','queued','/api/agent/workflow/start','{"workflow_keys":["agent_browser_inspection_to_patch","i-am-inspector-playwright","cms_live_editor_dev_app"],"parent_task":"task_iam_workflow_graph_e2e"}',datetime('now'),datetime('now')),
('todo_may23_codebase_embed_fix','tenant_sam_primeaux','ws_inneranimalmedia','plan_may23_2026_execution','Fix codebase_chunks embed backfill (Buffer) + run batch','POST /api/internal/embed-codebase-chunks-backfill; ~3579 NULL embeddings remain.','open','high','platform','queued','/api/internal/embed-codebase-chunks-backfill','{"surface":"alignment","error":"Buffer is not defined"}',datetime('now'),datetime('now')),
('todo_may23_cms_theme_verify','tenant_sam_primeaux','ws_inneranimalmedia','plan_may23_2026_execution','Verify cms-theme apply on prod returns 200','Pairs with cms_live_editor_dev_app workflow validation.','open','high','backend','queued',NULL,'{"surface":"cms"}',datetime('now'),datetime('now')),
('todo_may23_database_studio','tenant_sam_primeaux','ws_inneranimalmedia','plan_may23_2026_execution','Ship Database Studio stabilization patch','Carry from task_iam_dashboard_database_studio_remaster_ship.','open','medium','frontend','in_progress','/dashboard/database','{"surface":"dashboard","carry_task":"task_iam_dashboard_database_studio_remaster_ship"}',datetime('now'),datetime('now'));

INSERT OR IGNORE INTO agentsam_plan_tasks (
  id, tenant_id, workspace_id, plan_id, todo_id, order_index, title, description,
  priority, category, status, output_summary, completed_at, created_at
) VALUES
('task_may23_workflow_e2e_validate','tenant_sam_primeaux','ws_inneranimalmedia','plan_may23_2026_execution','todo_may23_workflow_e2e',10,'AM: E2E three repair workflows (steps_completed > 0)','Start each graph on prod; record agentsam_workflow_runs + Supabase sync; no dispatchComplete noop.','P1','backend','todo',NULL,NULL,unixepoch()),
('task_may23_codebase_chunks_buffer_fix','tenant_sam_primeaux','ws_inneranimalmedia','plan_may23_2026_execution','todo_may23_codebase_embed_fix',20,'Fix Buffer in codebase_chunks backfill + batch embed','Worker embed-codebase-chunks-backfill; INTERNAL_API_SECRET auth; target remaining_null_embedding → 0.','P1','infra','todo',NULL,NULL,unixepoch()),
('task_may23_cms_theme_verify_prod','tenant_sam_primeaux','ws_inneranimalmedia','plan_may23_2026_execution','todo_may23_cms_theme_verify',30,'P0: Verify cms-theme apply 200 on prod','curl/dashboard proof before closing cms workflow E2E.','P0','backend','todo',NULL,NULL,unixepoch()),
('task_may23_database_studio_stabilize','tenant_sam_primeaux','ws_inneranimalmedia','plan_may23_2026_execution','todo_may23_database_studio',40,'PM: Database Studio stabilization ship','Carry in_progress from May 22 sprint; deploy:frontend if UI touched.','P1','frontend','in_progress',NULL,NULL,unixepoch());

UPDATE agentsam_plans
SET
  tasks_total = (SELECT COUNT(*) FROM agentsam_plan_tasks WHERE plan_id = 'plan_may23_2026_execution'),
  tasks_done = (SELECT COUNT(*) FROM agentsam_plan_tasks WHERE plan_id = 'plan_may23_2026_execution' AND status = 'done'),
  tasks_blocked = (SELECT COUNT(*) FROM agentsam_plan_tasks WHERE plan_id = 'plan_may23_2026_execution' AND status = 'blocked'),
  updated_at = unixepoch()
WHERE id = 'plan_may23_2026_execution';

INSERT INTO agentsam_memory (
  id, tenant_id, user_id, workspace_id, memory_type, key, value, session_id, source, confidence, plan_id
) VALUES (
  'mem_may23_daily_plan',
  'tenant_sam_primeaux',
  'au_cccac6ec2360ac75',
  'ws_inneranimalmedia',
  'project',
  'daily_plan_may23_2026_execution',
  '{"plan_id":"plan_may23_2026_execution","parent_sprint":"plan_may22_2026_agent_sam"}',
  'session_20260523',
  'may23_daily_plan_seed',
  1.0,
  'plan_may23_2026_execution'
)
ON CONFLICT(id) DO UPDATE SET
  value = excluded.value,
  session_id = excluded.session_id,
  source = excluded.source,
  plan_id = excluded.plan_id,
  updated_at = unixepoch();
