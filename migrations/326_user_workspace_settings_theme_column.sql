-- 326: Per-workspace theme column when migration 148 could not run as a whole file
-- (e.g. user_settings.default_workspace_id already existed → duplicate column on first ALTER).
-- Safe to run once after 141_user_workspace_settings.sql. If `theme` already exists, D1 returns
-- duplicate column — ignore or skip.
--
-- Apply remote:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/326_user_workspace_settings_theme_column.sql

ALTER TABLE user_workspace_settings ADD COLUMN theme TEXT;
