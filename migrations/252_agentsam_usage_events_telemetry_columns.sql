-- Remaster agent_telemetry → agentsam_usage_events: add canonical telemetry columns
-- (idempotent on SQLite: ignore if columns already exist — run manually if duplicate errors)
ALTER TABLE agentsam_usage_events ADD COLUMN event_type TEXT;
ALTER TABLE agentsam_usage_events ADD COLUMN model_key TEXT;
ALTER TABLE agentsam_usage_events ADD COLUMN duration_ms INTEGER;
ALTER TABLE agentsam_usage_events ADD COLUMN total_tokens INTEGER;
