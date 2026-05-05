-- Workspace/project/user-global CMS theme preference rows (D1 source of truth for dashboard themes).
-- Apply prod:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/256_cms_theme_preferences.sql

CREATE TABLE IF NOT EXISTS cms_theme_preferences (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('project', 'workspace', 'user_global')),
  workspace_id TEXT,
  project_id TEXT,
  user_id TEXT,
  theme_slug TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_cms_theme_preferences_ws
  ON cms_theme_preferences (tenant_id, workspace_id)
  WHERE workspace_id IS NOT NULL AND scope IN ('workspace', 'project');

CREATE INDEX IF NOT EXISTS idx_cms_theme_preferences_proj
  ON cms_theme_preferences (tenant_id, workspace_id, project_id)
  WHERE scope = 'project' AND project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cms_theme_preferences_user_global
  ON cms_theme_preferences (tenant_id, user_id)
  WHERE scope = 'user_global' AND user_id IS NOT NULL;
