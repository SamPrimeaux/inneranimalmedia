-- May 22 2026 sprint rotation: pause plan_may14_2026_repair, activate plan_may22_2026_agent_sam,
-- re-home open plan_tasks/todos, close workflow registry ship, seed alignment memories.
--
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/371_may22_sprint_rotation_alignment.sql

-- ── 1. Pause legacy May 14 plan (archive; counters fixed from live rows) ───────

UPDATE agentsam_plans
SET
  status = 'abandoned',
  eod_summary = COALESCE(eod_summary, '') || char(10) || '[2026-05-22] Sprint rotated to plan_may22_2026_agent_sam. Open tasks moved; see carry_over in session_notes.',
  session_notes = COALESCE(session_notes, '') || char(10) || '[2026-05-22T12:00:00Z] Sprint archived (status=abandoned) — superseded by plan_may22_2026_agent_sam.',
  tasks_total = (SELECT COUNT(*) FROM agentsam_plan_tasks WHERE plan_id = 'plan_may14_2026_repair'),
  tasks_done = (SELECT COUNT(*) FROM agentsam_plan_tasks WHERE plan_id = 'plan_may14_2026_repair' AND status = 'done'),
  tasks_blocked = (SELECT COUNT(*) FROM agentsam_plan_tasks WHERE plan_id = 'plan_may14_2026_repair' AND status = 'blocked'),
  updated_at = unixepoch()
WHERE id = 'plan_may14_2026_repair';

-- ── 2. Active May 22 plan ────────────────────────────────────────────────────

INSERT OR IGNORE INTO agentsam_plans (
  id, tenant_id, workspace_id, plan_date, plan_type, title, status,
  morning_brief, session_notes, tasks_total, tasks_done, tasks_blocked,
  linked_project_keys, created_at, updated_at
) VALUES (
  'plan_may22_2026_agent_sam',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  '2026-05-22',
  'sprint',
  'May 22 2026 — Agent Sam DB-driven workflows + CF/Supabase alignment',
  'active',
  'Ship agentsam_workflow_handlers registry execution; validate browser/inspector/CMS graphs; mirror plans to Supabase public; pump embeddings (agent_memory, plans, codebase_chunks).',
  '[2026-05-22T12:00:00Z] Sprint opened. Carry-over from plan_may14_2026_repair (open tasks re-homed).' || char(10) ||
  '[2026-05-22T06:56:08Z] commit 468428d: feat(workflows): DB-driven handler registry execution and graph repair' || char(10) ||
  '[2026-05-22T12:00:00Z] migrations 369/370/371 applied; alignment pipeline run.',
  0,
  0,
  0,
  '["agent_sam","workflows","alignment"]',
  unixepoch(),
  unixepoch()
);

-- Re-home open work from May 14 → May 22
UPDATE agentsam_plan_tasks
SET plan_id = 'plan_may22_2026_agent_sam'
WHERE plan_id = 'plan_may14_2026_repair'
  AND status IN ('todo', 'in_progress');

UPDATE agentsam_todo
SET plan_id = 'plan_may22_2026_agent_sam'
WHERE plan_id = 'plan_may14_2026_repair'
  AND status IN ('open', 'in_progress');

-- ── 3. May 22 plan tasks (registry ship + pipeline + E2E) ───────────────────

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
  'in_progress',
  NULL,
  NULL,
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
  'agent_browser_inspection_to_patch, i-am-inspector-playwright, cms_live_editor_dev_app — steps_completed > 0, no dispatchComplete noop.',
  'P1',
  'backend',
  'todo',
  NULL,
  NULL,
  unixepoch()
);

INSERT OR IGNORE INTO agentsam_todo (
  id, tenant_id, workspace_id, plan_id, title, description, status, priority, category,
  execution_status, linked_route, context_snapshot, created_at, updated_at
) VALUES
(
  'todo_iam_workflow_registry_ship',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'plan_may22_2026_agent_sam',
  'Ship workflow handler registry (D1-driven executor)',
  'Registry table agentsam_workflow_handlers drives executePrimitive; migrations 369/370.',
  'done',
  'high',
  'workflows',
  'done',
  '/api/agent/workflow/start',
  '{"surface":"workflows","commits":["468428d"],"files":["src/core/workflow-executor.js","migrations/369_browser_capture_context_handler.sql","migrations/370_workflow_repair_edges_handlers.sql"]}',
  datetime('now'),
  datetime('now')
),
(
  'todo_iam_alignment_pipeline_pump',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'plan_may22_2026_agent_sam',
  'Pump CF D1 + Supabase alignment (plans, memory, embeddings)',
  'Mirror public plans; chunk/vectorize session notes and project memories.',
  'open',
  'high',
  'platform',
  'in_progress',
  '/api/agent/alignment-sync',
  '{"surface":"alignment","plan_id":"plan_may22_2026_agent_sam"}',
  datetime('now'),
  datetime('now')
),
(
  'todo_iam_workflow_graph_e2e',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'plan_may22_2026_agent_sam',
  'E2E validate browser / inspector / CMS workflows',
  'Production workflow runs with real step_results_json.',
  'open',
  'medium',
  'workflows',
  'queued',
  '/api/agent/workflow/start',
  '{"surface":"workflows","workflow_keys":["agent_browser_inspection_to_patch","i-am-inspector-playwright","cms_live_editor_dev_app"]}',
  datetime('now'),
  datetime('now')
);

-- Close stale registry task on May 14 plan (historical row if still on old plan_id)
UPDATE agentsam_plan_tasks
SET
  status = 'done',
  output_summary = 'Superseded by task_iam_workflow_registry_ship on plan_may22_2026_agent_sam (468428d).',
  completed_at = COALESCE(completed_at, unixepoch())
WHERE id = 'task_wire_workflow_handlers'
  AND plan_id = 'plan_may14_2026_repair';

-- Recount May 22 plan counters
UPDATE agentsam_plans
SET
  tasks_total = (SELECT COUNT(*) FROM agentsam_plan_tasks WHERE plan_id = 'plan_may22_2026_agent_sam'),
  tasks_done = (SELECT COUNT(*) FROM agentsam_plan_tasks WHERE plan_id = 'plan_may22_2026_agent_sam' AND status = 'done'),
  tasks_blocked = (SELECT COUNT(*) FROM agentsam_plan_tasks WHERE plan_id = 'plan_may22_2026_agent_sam' AND status = 'blocked'),
  updated_at = unixepoch()
WHERE id = 'plan_may22_2026_agent_sam';

-- ── 4. Project memories (D1 KV — semantic mirror via pipeline script) ─────────

INSERT INTO agentsam_memory (
  id, tenant_id, user_id, workspace_id, memory_type, key, value, session_id, source, confidence, plan_id
) VALUES (
  'mem_may22_sprint_open',
  'tenant_sam_primeaux',
  'au_cccac6ec2360ac75',
  'ws_inneranimalmedia',
  'project',
  'sprint_plan_may22_2026_agent_sam',
  '{"plan_id":"plan_may22_2026_agent_sam","prior_plan":"plan_may14_2026_repair","focus":["agentsam_workflow_handlers","surface_routes","migrations_369_370_371","supabase_public_mirror","embeddings"],"commit":"468428d","worker_version":"0fe41de2"}',
  'session_20260522',
  'may22_sprint_rotation',
  1.0,
  'plan_may22_2026_agent_sam'
)
ON CONFLICT(tenant_id, user_id, key) DO UPDATE SET
  value = excluded.value,
  session_id = excluded.session_id,
  source = excluded.source,
  plan_id = excluded.plan_id,
  updated_at = unixepoch();

INSERT INTO agentsam_memory (
  id, tenant_id, user_id, workspace_id, memory_type, key, value, session_id, source, confidence
) VALUES (
  'mem_schema_workflow_handlers_registry',
  'tenant_sam_primeaux',
  'au_cccac6ec2360ac75',
  'ws_inneranimalmedia',
  'fact',
  'schema_agentsam_workflow_handlers',
  'Canonical handler registry table is agentsam_workflow_handlers (not agentsam_handler_registry). executor_kind + handler_config_json drive executePrimitive in workflow-executor.js.',
  'session_20260522',
  'may22_sprint_rotation',
  1.0
)
ON CONFLICT(tenant_id, user_id, key) DO UPDATE SET
  value = excluded.value,
  updated_at = unixepoch();
