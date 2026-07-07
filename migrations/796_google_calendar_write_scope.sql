-- Google Calendar: request calendar.events (read+write) per Google API guidance — no tombstone masking.
-- Existing users with readonly tokens must reconnect once to grant write scope.
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/796_google_calendar_write_scope.sql

UPDATE integration_catalog
SET
  oauth_scopes_default = '["https://www.googleapis.com/auth/calendar.events"]',
  oauth_scopes_available = '["https://www.googleapis.com/auth/calendar.events","https://www.googleapis.com/auth/calendar.readonly","https://www.googleapis.com/auth/calendar.events.readonly"]'
WHERE slug IN ('google-calendar', 'google_calendar');
