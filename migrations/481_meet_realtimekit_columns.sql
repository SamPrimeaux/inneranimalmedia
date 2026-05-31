-- 481: RealtimeKit Meet migration — meet_rooms RTK columns + workspace linkage + todo registration.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/481_meet_realtimekit_columns.sql

-- Legacy meet.js expects workspace/tenant/cf_app_id; production table was minimal — add all idempotently.
ALTER TABLE meet_rooms ADD COLUMN workspace_id TEXT;
ALTER TABLE meet_rooms ADD COLUMN tenant_id TEXT;
ALTER TABLE meet_rooms ADD COLUMN cf_app_id TEXT;
ALTER TABLE meet_rooms ADD COLUMN realtimekit_meeting_id TEXT;
ALTER TABLE meet_rooms ADD COLUMN engine TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE meet_rooms ADD COLUMN realtimekit_host_preset TEXT DEFAULT 'group_call_host';

CREATE INDEX IF NOT EXISTS idx_meet_rooms_rtk_meeting ON meet_rooms(realtimekit_meeting_id);
CREATE INDEX IF NOT EXISTS idx_meet_rooms_engine ON meet_rooms(engine);

INSERT OR IGNORE INTO agentsam_plans (
  id, tenant_id, workspace_id, plan_date, plan_type, title, status,
  session_notes, tasks_total, tasks_done, linked_project_keys, created_at, updated_at
) VALUES (
  'plan_iam_meet_realtimekit_2026',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  '2026-05-30',
  'feature',
  'IAM Meet — RealtimeKit migration (Sprint 0–5)',
  'active',
  '[2026-05-30] Sprint 0+1: smoke script, D1 columns, /api/meet/v2 token mint. Skip legacy SFU patch; RTK presets confirmed.',
  1,
  0,
  '["meet","realtimekit"]',
  unixepoch(),
  unixepoch()
);

INSERT OR IGNORE INTO agentsam_todo (
  id, tenant_id, workspace_id, plan_id, title, description, status, priority, category,
  execution_status, linked_route, context_snapshot, created_at, updated_at
) VALUES (
  'todo_iam_meet_realtimekit_migration',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'plan_iam_meet_realtimekit_2026',
  'RealtimeKit Meet migration (SFU → RTK)',
  'Sprint 0–5: smoke script, D1 columns, /api/meet/v2 token mint, dashboard RTK UI kit, webhooks, analytics parity.',
  'open',
  'high',
  'backend',
  'in_progress',
  '/dashboard/meet',
  '{"surface":"meet","engine_target":"realtimekit","presets":["group_call_host","group_call_participant","group_call_guest"],"app_id":"08755a39-bfb2-4c6a-b322-527ba7ef0698"}',
  datetime('now'),
  datetime('now')
);

INSERT OR IGNORE INTO agentsam_plan_tasks (
  id, tenant_id, workspace_id, plan_id, todo_id, order_index, title, description,
  priority, category, status, routes_involved, created_at
) VALUES (
  'task_iam_meet_realtimekit_migration_ship',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'plan_iam_meet_realtimekit_2026',
  'todo_iam_meet_realtimekit_migration',
  10,
  'Ship RealtimeKit Meet backend (Sprint 0+1)',
  'Smoke script, D1 migration 481, realtimekit-client.js, /api/meet/v2/* routes, wire legacy /api/meet dispatch.',
  'P1',
  'backend',
  'todo',
  '["/api/meet/v2/start","/api/meet/v2/token","/api/meet/v2/room/:id"]',
  unixepoch()
);

UPDATE agentsam_plans
SET
  tasks_total = (SELECT COUNT(*) FROM agentsam_plan_tasks WHERE plan_id = 'plan_iam_meet_realtimekit_2026'),
  tasks_done = (SELECT COUNT(*) FROM agentsam_plan_tasks WHERE plan_id = 'plan_iam_meet_realtimekit_2026' AND status = 'done'),
  updated_at = unixepoch()
WHERE id = 'plan_iam_meet_realtimekit_2026';
