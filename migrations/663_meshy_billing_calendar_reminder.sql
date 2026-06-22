-- Meshy billing reminder — calendar + todo (3 weeks from 2026-06-22 → 2026-07-13).
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/663_meshy_billing_calendar_reminder.sql

INSERT OR IGNORE INTO calendar_events (
  id, tenant_id, workspace_id, event_type, title, description, location,
  start_datetime, end_datetime, color, status, attendees, created_by, created_at, updated_at
) VALUES (
  'cev_meshy_bill_reminder_20260713',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'billing_reminder',
  'Meshy billing reminder — $40.00',
  'Next Meshy bill: $40.00 for Jul 21, 2026 – Aug 21, 2026. Review usage in meshy.ai → Billing before renewal. Worker secret: MESHYAI_API_KEY.',
  'meshy.ai',
  '2026-07-13 09:00:00',
  '2026-07-13 09:30:00',
  '#f59e0b',
  'scheduled',
  NULL,
  'au_871d920d1233cbd1',
  datetime('now'),
  datetime('now')
);

INSERT OR IGNORE INTO calendar_events (
  id, tenant_id, workspace_id, event_type, title, description, location,
  start_datetime, end_datetime, color, status, attendees, created_by, created_at, updated_at
) VALUES (
  'cev_meshy_bill_period_20260721',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'billing_period',
  'Meshy subscription — $40.00',
  'Billing period Jul 21, 2026 – Aug 21, 2026 ($40.00). Design Studio Meshy jobs use MESHYAI_API_KEY on inneranimalmedia Worker.',
  'meshy.ai',
  '2026-07-21 00:00:00',
  '2026-08-21 23:59:59',
  '#14b8a6',
  'scheduled',
  NULL,
  'au_871d920d1233cbd1',
  datetime('now'),
  datetime('now')
);

INSERT OR IGNORE INTO agentsam_todo (
  id, tenant_id, workspace_id, title, description, status, priority, category, tags,
  sort_order, project_key, task_type, execution_status, assigned_to, linked_route, notes
) VALUES (
  'todo_meshy_bill_reminder_20260713',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'Review Meshy bill ($40) — Jul 21 renewal',
  'Reminder set for Jul 13, 2026. Next bill $40.00 covering Jul 21 – Aug 21, 2026. Confirm API key + usage at meshy.ai/billing.',
  'open',
  'medium',
  'billing',
  '["meshy","billing","designstudio","reminder"]',
  5,
  'inneranimalmedia',
  'review',
  'queued',
  'sam',
  '/dashboard/collaborate',
  'Calendar event cev_meshy_bill_reminder_20260713; email fires via daily billing-reminder cron'
);
