-- 2026-06-01 daily execution plan — repo hygiene + Agent Sam tool spine.
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/496_jun01_daily_execution_plan.sql

INSERT OR IGNORE INTO agentsam_plans (
  id, tenant_id, workspace_id, plan_date, plan_type, title, status,
  morning_brief, session_notes, tasks_total, tasks_done, tasks_blocked,
  linked_project_keys, created_at, updated_at
) VALUES (
  'plan_jun01_2026_execution',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  '2026-06-01',
  'daily',
  'Jun 1 2026 — Tool spine + repo hygiene + doc truth',
  'active',
  'AM: Fix Agent route empty tools + fs list/write PTY + RWS telemetry FK. PM: README truth pass + dead-code archive list from docs/TOMORROW_2026-06-01.md.',
  '[2026-06-01T00:00:00Z] Plan seeded after prod tail review: Agent finalToolCount=0, multitask RWS ok:3 without deliverables, anthropic temperature shipped 0f24eda.' || char(10) ||
  '[2026-06-01] Parent sprint: plan_may22_2026_agent_sam. Playbook: docs/TOMORROW_2026-06-01.md',
  5,
  0,
  0,
  '["agent_sam","repo_hygiene","tool_spine"]',
  unixepoch(),
  unixepoch()
);

INSERT OR IGNORE INTO agentsam_todo (
  id, tenant_id, workspace_id, plan_id, title, description, status, priority, category,
  execution_status, linked_route, context_snapshot, created_at, updated_at
) VALUES
(
  'todo_jun01_agent_tool_spine',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'plan_jun01_2026_execution',
  'Agent route exposes compiled catalog tools',
  'route_requirements agent must not compile finalToolCount=0 for normal dev chat; verify route_contract log.',
  'open',
  'high',
  'agent_sam',
  'queued',
  '/api/agent/chat',
  '{"surface":"agent","log_field":"finalToolCount","parent_plan":"plan_may22_2026_agent_sam"}',
  datetime('now'),
  datetime('now')
),
(
  'todo_jun01_fs_list_write_pty',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'plan_jun01_2026_execution',
  'fs list_dir and write_file use PTY not dead HTTP',
  'Remove loopback to unwired /api/fs/list and /api/fs/write; match read_file PTY path.',
  'open',
  'high',
  'tools',
  'queued',
  'src/tools/fs.js',
  '{"files":["src/tools/fs.js","src/core/fs-read-file.js"]}',
  datetime('now'),
  datetime('now')
),
(
  'todo_jun01_rws_telemetry_fk',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'plan_jun01_2026_execution',
  'RWS child runs skip invalid Supabase tool_call_events',
  'Fix agentsam_tool_call_events_run_id_fkey for ar_* child run ids during multitask fanout.',
  'open',
  'high',
  'observability',
  'queued',
  'src/core/hyperdrive-write.js',
  '{"error":"agentsam_tool_call_events_run_id_fkey"}',
  datetime('now'),
  datetime('now')
),
(
  'todo_jun01_readme_truth_pass',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'plan_jun01_2026_execution',
  'README matches production entry and deploy',
  'Remove worker.js fallback fiction; document deploy:full = deploy-frontend.sh; fix package.json start.',
  'open',
  'medium',
  'docs',
  'queued',
  'README.md',
  '{"doc":"docs/TOMORROW_2026-06-01.md"}',
  datetime('now'),
  datetime('now')
),
(
  'todo_jun01_dead_code_archive',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'plan_jun01_2026_execution',
  'Archive high-confidence dead artifacts',
  'patch_results, legacy-worker-annotate, sandbox deploy scripts; grep before delete.',
  'open',
  'medium',
  'repo_hygiene',
  'queued',
  'scripts/patch_results',
  '{"register":"docs/TOMORROW_2026-06-01.md#dead-code-register"}',
  datetime('now'),
  datetime('now')
);

INSERT OR IGNORE INTO agentsam_plan_tasks (
  id, tenant_id, workspace_id, plan_id, todo_id, order_index, title, description,
  priority, category, status, output_summary, completed_at, created_at
) VALUES
(
  'task_jun01_agent_tool_spine',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'plan_jun01_2026_execution',
  'todo_jun01_agent_tool_spine',
  1,
  'Ship Agent route tool compilation fix',
  'Blocked tonight: finalToolCount=0 on agent mode chat.',
  'high',
  'agent_sam',
  'todo',
  NULL,
  NULL,
  unixepoch()
),
(
  'task_jun01_fs_list_write_pty',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'plan_jun01_2026_execution',
  'todo_jun01_fs_list_write_pty',
  2,
  'Ship fs list/write PTY wiring',
  'Remove loopback to unwired /api/fs/list and /api/fs/write.',
  'high',
  'tools',
  'todo',
  NULL,
  NULL,
  unixepoch()
),
(
  'task_jun01_rws_telemetry_fk',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'plan_jun01_2026_execution',
  'todo_jun01_rws_telemetry_fk',
  3,
  'Ship RWS telemetry FK guard',
  'Fix agentsam_tool_call_events_run_id_fkey for multitask child runs.',
  'high',
  'observability',
  'todo',
  NULL,
  NULL,
  unixepoch()
),
(
  'task_jun01_readme_truth_pass',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'plan_jun01_2026_execution',
  'todo_jun01_readme_truth_pass',
  4,
  'README + canonical facts correction',
  'Align README with src/index.js and deploy:full reality.',
  'medium',
  'docs',
  'todo',
  NULL,
  NULL,
  unixepoch()
),
(
  'task_jun01_dead_code_archive',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'plan_jun01_2026_execution',
  'todo_jun01_dead_code_archive',
  5,
  'Dead code archive pass',
  'patch_results, legacy-worker-annotate, sandbox scripts per dead-code register.',
  'medium',
  'repo_hygiene',
  'todo',
  NULL,
  NULL,
  unixepoch()
);
