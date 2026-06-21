-- Migration 657: Add personal skill/learning tracking columns to task_velocity
-- Auto-written daily by cron job (midnight-utc slot).
-- Personal columns filled via chat: "log today: ..." or left for email inference.

ALTER TABLE task_velocity ADD COLUMN new_concepts TEXT DEFAULT NULL;
-- What you actually learned or applied today.
-- e.g. "Vectorize upsert batching, D1 correlated subqueries, Thompson sampling decay"

ALTER TABLE task_velocity ADD COLUMN confidence_gains TEXT DEFAULT NULL;
-- What you feel more solid on than yesterday.
-- e.g. "Cloudflare cron wiring, Workers AI embedding pipeline"

ALTER TABLE task_velocity ADD COLUMN struggle_areas TEXT DEFAULT NULL;
-- What's still fuzzy or took longer than it should have.
-- e.g. "D1 schema column adds mid-session, wrangler secret scoping"

ALTER TABLE task_velocity ADD COLUMN ai_collab_score INTEGER DEFAULT NULL;
-- 0-100: how well you directed AI vs got dragged around.
-- 90+ = you drove every decision. <50 = AI was running the show and you were lost.

ALTER TABLE task_velocity ADD COLUMN solo_decisions INTEGER DEFAULT 0;
-- Count of architectural/product decisions you made without just accepting AI output.

ALTER TABLE task_velocity ADD COLUMN cursor_spend_usd REAL DEFAULT NULL;
-- Cursor/AI tool spend for the day (manual entry or pulled from agentsam_usage_rollups_daily).

ALTER TABLE task_velocity ADD COLUMN platform_worker_version TEXT DEFAULT NULL;
-- CF worker version deployed today — pulled from wrangler deployments.

ALTER TABLE task_velocity ADD COLUMN migrations_applied INTEGER DEFAULT 0;
-- How many D1 migrations shipped today — auto-counted from d1_migrations.

ALTER TABLE task_velocity ADD COLUMN mcp_tool_calls INTEGER DEFAULT 0;
-- Total MCP tool calls in last 24h — auto-counted from mcp_audit_log.

ALTER TABLE task_velocity ADD COLUMN week_over_week_delta INTEGER DEFAULT NULL;
-- velocity_score diff vs same day last week. Negative = slowing. Auto-computed.
