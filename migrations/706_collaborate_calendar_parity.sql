-- Collaborate calendar parity: booking pages, working hours, event metadata.
-- Note: all_day, timezone, recurrence_rule already exist on prod calendar_events.

ALTER TABLE calendar_events ADD COLUMN calendar_source TEXT DEFAULT 'primary';
ALTER TABLE calendar_events ADD COLUMN guest_permissions_json TEXT;

CREATE TABLE IF NOT EXISTS calendar_booking_pages (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  tenant_id TEXT,
  user_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  duration_min INTEGER NOT NULL DEFAULT 30,
  description TEXT,
  location TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_calendar_booking_pages_ws ON calendar_booking_pages(workspace_id, is_active);

CREATE TABLE IF NOT EXISTS calendar_working_hours (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/Chicago',
  start_minutes INTEGER NOT NULL DEFAULT 540,
  end_minutes INTEGER NOT NULL DEFAULT 1020,
  work_days_json TEXT NOT NULL DEFAULT '[1,2,3,4,5]',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, user_id)
);

INSERT OR IGNORE INTO calendar_booking_pages (
  id, workspace_id, tenant_id, user_id, slug, title, duration_min, description, is_active
) VALUES (
  'cbp_sam_30min',
  'ws_inneranimalmedia',
  'tenant_sam_primeaux',
  'au_871d920d1233cbd1',
  '30-min-sam',
  '30 min with sam',
  30,
  'Book a 30-minute working session.',
  1
);
