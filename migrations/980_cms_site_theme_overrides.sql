-- Per-site visual editor overrides. The catalog theme remains immutable and reusable;
-- these variables are merged over the active theme during CMS bootstrap.
CREATE TABLE IF NOT EXISTS cms_site_theme_overrides (
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  project_slug TEXT NOT NULL,
  vars_json TEXT NOT NULL DEFAULT '{}',
  updated_by TEXT,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (tenant_id, workspace_id, project_slug)
);

CREATE INDEX IF NOT EXISTS idx_cms_site_theme_overrides_project
  ON cms_site_theme_overrides (project_slug, workspace_id);
