-- 483: Meet Sprint 3 — meet_invites + schedule/invite task registration.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/483_meet_invites_s3.sql

CREATE TABLE IF NOT EXISTS meet_invites (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  email TEXT NOT NULL,
  invited_by TEXT NOT NULL,
  workspace_id TEXT,
  tenant_id TEXT,
  scheduled_id TEXT,
  calendar_event_id TEXT,
  resend_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(room_id, email)
);

CREATE INDEX IF NOT EXISTS idx_meet_invites_room ON meet_invites(room_id);
CREATE INDEX IF NOT EXISTS idx_meet_invites_email ON meet_invites(email);

INSERT OR IGNORE INTO agentsam_plan_tasks (
  id, tenant_id, workspace_id, plan_id, todo_id, order_index, title, description,
  priority, category, status, routes_involved, created_at
) VALUES (
  'task_iam_meet_realtimekit_invites_s3',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'plan_iam_meet_realtimekit_2026',
  'todo_iam_meet_realtimekit_migration',
  30,
  'Meet invites + schedule parity (Sprint 3)',
  'meet_invites D1, /api/meet/schedule RTK rows, calendar link, Resend hardening, browser proof.',
  'P1',
  'backend',
  'in_progress',
  '["/api/meet/schedule","/api/meet/room/*/invite","/api/calendar/events"]',
  unixepoch()
);

UPDATE agentsam_plans
SET
  tasks_total = (SELECT COUNT(*) FROM agentsam_plan_tasks WHERE plan_id = 'plan_iam_meet_realtimekit_2026'),
  updated_at = unixepoch()
WHERE id = 'plan_iam_meet_realtimekit_2026';
