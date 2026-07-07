-- 793: Google Calendar sync columns + registry note
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/793_google_calendar_spine.sql
--
-- GCP OAuth client — add Authorized redirect URI:
--   https://inneranimalmedia.com/api/oauth/google-calendar/callback

ALTER TABLE calendar_events ADD COLUMN external_event_id TEXT;
ALTER TABLE calendar_events ADD COLUMN sync_account TEXT;

CREATE INDEX IF NOT EXISTS idx_calendar_events_gcal_external
  ON calendar_events(workspace_id, external_event_id, sync_account)
  WHERE calendar_source = 'google_calendar';

UPDATE integration_catalog
SET
  oauth_scopes_default = '["https://www.googleapis.com/auth/calendar.readonly","https://www.googleapis.com/auth/calendar.events.readonly"]',
  oauth_scopes_available = '["https://www.googleapis.com/auth/calendar.readonly","https://www.googleapis.com/auth/calendar.events.readonly","https://www.googleapis.com/auth/calendar.events"]'
WHERE slug IN ('google-calendar', 'google_calendar');
