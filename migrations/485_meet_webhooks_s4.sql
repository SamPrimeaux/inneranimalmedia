-- 485: Meet Sprint 4 — lifecycle columns + webhook task registration.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/485_meet_webhooks_s4.sql

ALTER TABLE meet_rooms ADD COLUMN started_at TEXT;
ALTER TABLE meet_rooms ADD COLUMN ended_at TEXT;
ALTER TABLE meet_rooms ADD COLUMN duration_sec INTEGER;
ALTER TABLE meet_rooms ADD COLUMN participant_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE meet_rooms ADD COLUMN rtk_session_id TEXT;
ALTER TABLE meet_rooms ADD COLUMN last_webhook_event TEXT;
ALTER TABLE meet_rooms ADD COLUMN last_webhook_at TEXT;

CREATE TABLE IF NOT EXISTS meet_webhook_events (
  id TEXT PRIMARY KEY,
  dyte_uuid TEXT UNIQUE,
  event_type TEXT NOT NULL,
  meeting_id TEXT,
  room_id TEXT,
  payload_json TEXT,
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_meet_webhook_events_meeting ON meet_webhook_events(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meet_webhook_events_room ON meet_webhook_events(room_id);

INSERT OR IGNORE INTO agentsam_plan_tasks (
  id, tenant_id, workspace_id, plan_id, todo_id, order_index, title, description,
  priority, category, status, routes_involved, created_at
) VALUES (
  'task_iam_meet_realtimekit_webhooks_s4',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'plan_iam_meet_realtimekit_2026',
  'todo_iam_meet_realtimekit_migration',
  40,
  'RealtimeKit webhooks → D1 lifecycle (Sprint 4)',
  'POST /api/webhooks/realtimekit, REALTIMEKIT_WEBHOOK_SECRET, dyte-signature verify, meet_rooms status/duration/participant_count.',
  'P1',
  'backend',
  'in_progress',
  '["/api/webhooks/realtimekit"]',
  unixepoch()
);

UPDATE agentsam_plans
SET
  tasks_total = (SELECT COUNT(*) FROM agentsam_plan_tasks WHERE plan_id = 'plan_iam_meet_realtimekit_2026'),
  updated_at = unixepoch()
WHERE id = 'plan_iam_meet_realtimekit_2026';
