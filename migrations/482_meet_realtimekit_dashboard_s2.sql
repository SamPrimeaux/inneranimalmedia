-- 482: RealtimeKit Meet Sprint 2 — dashboard UI kit task registration.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/482_meet_realtimekit_dashboard_s2.sql

INSERT OR IGNORE INTO agentsam_plan_tasks (
  id, tenant_id, workspace_id, plan_id, todo_id, order_index, title, description,
  priority, category, status, routes_involved, created_at
) VALUES (
  'task_iam_meet_realtimekit_dashboard_s2',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'plan_iam_meet_realtimekit_2026',
  'todo_iam_meet_realtimekit_migration',
  20,
  'Dashboard RealtimeKit UI (Sprint 2)',
  'MeetRealtimeKitShell + @cloudflare/realtimekit-react-ui; lobby v2/start+token; legacy SFU gated by meetEngine.',
  'P1',
  'frontend',
  'in_progress',
  '["/dashboard/meet"]',
  unixepoch()
);

UPDATE agentsam_plans
SET
  tasks_total = (SELECT COUNT(*) FROM agentsam_plan_tasks WHERE plan_id = 'plan_iam_meet_realtimekit_2026'),
  updated_at = unixepoch()
WHERE id = 'plan_iam_meet_realtimekit_2026';
