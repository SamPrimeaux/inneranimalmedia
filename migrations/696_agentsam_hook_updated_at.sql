-- 696: Restore agentsam_hook.updated_at (required by settings hooks API, push-subscribe, web_push).
-- Migration 297 targeted this column but used datetime('now') DEFAULT — rejected by D1 ALTER TABLE.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/696_agentsam_hook_updated_at.sql

ALTER TABLE agentsam_hook ADD COLUMN updated_at TEXT;

UPDATE agentsam_hook
SET updated_at = COALESCE(last_run_at, created_at, datetime('now'))
WHERE updated_at IS NULL OR trim(updated_at) = '';
