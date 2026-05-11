-- Default workspace and per-workspace theme for dashboard (core 4 workspaces).
-- Database: inneranimalmedia-business (D1)
-- Run once before using header workspace dropdown and per-workspace themes:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/148_workspace_default_and_theme.sql
-- If user_settings or user_workspace_settings lack these columns, the worker falls back to ws_samprimeaux and empty workspaceThemes until migration is run.
--
-- If execution fails on duplicate column for default_workspace_id (already applied): run only the
-- second ALTER below as a one-off, or use migrations/326_user_workspace_settings_theme_column.sql.

-- Default workspace for the user (shown in header dropdown)
ALTER TABLE user_settings ADD COLUMN default_workspace_id TEXT;

-- Per-workspace theme (theme slug from cms_themes)
ALTER TABLE user_workspace_settings ADD COLUMN theme TEXT;
