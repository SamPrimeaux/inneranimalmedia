-- Fix May 22 plan tasks missed by 371 (category CHECK: workflows/platform invalid).
-- Valid category: frontend|backend|db|infra|ux|research|other

INSERT OR IGNORE INTO agentsam_plan_tasks (
  id, tenant_id, workspace_id, plan_id, todo_id, order_index, title, description,
  priority, category, status, output_summary, completed_at, created_at
) VALUES
(
  'task_iam_workflow_registry_ship',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'plan_may22_2026_agent_sam',
  'todo_iam_workflow_registry_ship',
  10,
  'Ship DB-driven workflow handler registry',
  'executePrimitive + dispatchComplete; migrations 369/370; browser.capture_context builtin_tool; surface_routes metadata.',
  'P0',
  'backend',
  'done',
  'Shipped 468428d + deploy 0fe41de2. D1: agentsam_workflow_handlers populated; edges from_status; handler_config_json non-empty for LLM/SQL steps.',
  unixepoch(),
  unixepoch()
),
(
  'task_iam_alignment_pipeline_pump',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'plan_may22_2026_agent_sam',
  'todo_iam_alignment_pipeline_pump',
  20,
  'Pump D1 ↔ Supabase alignment pipeline',
  'Mirror plans/tasks to public.agentsam_plans; sync agentsam_memory → agent_memory; run embedding backfills.',
  'P0',
  'infra',
  'done',
  'Migration 371/372; mirror + memory sync + 75 agent_memory vectors embedded; Edge backfill OK.',
  unixepoch(),
  unixepoch()
),
(
  'task_iam_workflow_graph_e2e',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'plan_may22_2026_agent_sam',
  'todo_iam_workflow_graph_e2e',
  30,
  'Validate three repair workflows E2E',
  'agent_browser_inspection_to_patch, i-am-inspector-playwright, cms_live_editor_dev_app — steps_completed > 0.',
  'P1',
  'backend',
  'todo',
  NULL,
  NULL,
  unixepoch()
);

UPDATE agentsam_todo
SET execution_status = 'done', status = 'done', updated_at = datetime('now')
WHERE id = 'todo_iam_alignment_pipeline_pump';

UPDATE agentsam_plans
SET
  tasks_total = (SELECT COUNT(*) FROM agentsam_plan_tasks WHERE plan_id = 'plan_may22_2026_agent_sam'),
  tasks_done = (SELECT COUNT(*) FROM agentsam_plan_tasks WHERE plan_id = 'plan_may22_2026_agent_sam' AND status = 'done'),
  tasks_blocked = (SELECT COUNT(*) FROM agentsam_plan_tasks WHERE plan_id = 'plan_may22_2026_agent_sam' AND status = 'blocked'),
  session_notes = COALESCE(session_notes, '') || char(10) || '[2026-05-22T18:00:00Z] migration 372: plan_tasks fixup (category CHECK).',
  updated_at = unixepoch()
WHERE id = 'plan_may22_2026_agent_sam';
