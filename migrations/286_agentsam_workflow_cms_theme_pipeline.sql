-- Agent Sam workflow registry: CMS theme create + package + preview + apply.
-- Idempotent: INSERT OR REPLACE by primary key.
-- Apply prod:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/286_agentsam_workflow_cms_theme_pipeline.sql

CREATE TABLE IF NOT EXISTS agentsam_workflows (
  id TEXT PRIMARY KEY,
  workflow_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  workflow_type TEXT DEFAULT 'maintenance',
  trigger_type TEXT DEFAULT 'manual',
  default_mode TEXT DEFAULT 'agent',
  default_task_type TEXT,
  risk_level TEXT DEFAULT 'low',
  requires_approval INTEGER DEFAULT 0,
  max_concurrent_nodes INTEGER DEFAULT 1,
  timeout_ms INTEGER DEFAULT 300000,
  is_platform_global INTEGER DEFAULT 0,
  quality_gate_json TEXT DEFAULT '{}',
  metadata_json TEXT DEFAULT '{}',
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

INSERT OR REPLACE INTO agentsam_workflows (
  id,
  workflow_key,
  display_name,
  description,
  workflow_type,
  trigger_type,
  default_mode,
  default_task_type,
  risk_level,
  requires_approval,
  max_concurrent_nodes,
  timeout_ms,
  is_platform_global,
  quality_gate_json,
  metadata_json,
  is_active,
  updated_at
) VALUES (
  'wf_cms_theme_create_pkg_preview_apply',
  'cms-theme-create-package-preview-apply',
  'CMS Theme Create + Package + Preview + Apply',
  'Creates or updates CMS themes from user preferences, generates portable R2 theme packages and preview artifacts, updates cms_themes metadata, optionally applies the theme to a workspace, and refreshes the dashboard theme browser without a full app deploy.',
  'maintenance',
  'manual',
  'agent',
  'cms_theme_creation',
  'low',
  0,
  3,
  300000,
  1,
  '{"requires_theme_row":true,"requires_json_parse":true,"requires_preview_model":true,"requires_r2_package_or_export":true,"requires_no_full_dashboard_deploy":true,"requires_workspace_safe_apply":true}',
  '{"domain":"cms","area":"themes","dashboard_route":"/dashboard/settings/themes","api_routes":["GET /api/themes","GET /api/themes/active","POST /api/themes/create","POST /api/themes/apply"],"scripts":["scripts/themes/generate-theme-package.mjs","scripts/themes/generate-theme-previews.mjs"],"tables":["cms_themes","cms_theme_preferences","agentsam_workflows"],"r2_prefix":"cms/themes/{slug}/","outputs":["theme.css","theme.json","monaco.json","manifest.json","preview.html","preview.png","README.md","zip_export"],"owner_modes":{"inneranimalmedia":"r2_and_d1_seamless","external_client":"ask_storage_or_export_zip"}}',
  1,
  datetime('now')
);
