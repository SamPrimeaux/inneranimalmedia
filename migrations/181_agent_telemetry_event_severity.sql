-- 181: agent_telemetry severity (streamDoneDbWrites). event_type may already exist on prod D1.
-- Apply sandbox: npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.jsonc --file=migrations/181_agent_telemetry_event_severity.sql

ALTER TABLE agent_telemetry ADD COLUMN severity TEXT;
