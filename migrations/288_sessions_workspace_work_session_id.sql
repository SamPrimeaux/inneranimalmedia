-- Link browser login rows in `sessions` to OAuth post-login work_sessions (work_session_id + workspace_id).
-- Apply only if columns are missing (check with PRAGMA table_info(sessions);).
-- Remote one-shot:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/288_sessions_workspace_work_session_id.sql

ALTER TABLE sessions ADD COLUMN workspace_id TEXT;
ALTER TABLE sessions ADD COLUMN work_session_id TEXT;
